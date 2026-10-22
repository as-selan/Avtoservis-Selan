"use server";
import {confirmBusinessContent} from './business-document-workflow';
import {configuredQuibiWorkflowStatusClient} from './write-client';
import {QuibiValidationError} from './write-http';
import {reconcileEstimate} from './estimate-reconciliation';
import {unitNetFromGross} from "./line-pricing";
import {stableEstimatePayload,withDocumentId} from './write-contract';
import {quibiWorkflowJournal} from './write-journal';
import {estimateRevisionPreparation} from './estimate-revision-preparation';
import {loadQuibiDocument} from './document-read';
import {loadEstimateHistory,freshHistorySource,verifyHistoryCatalogReferences} from './estimate-history';
import {estimateCatalogSource,estimateCatalogRows} from './estimate-catalog-source';
import {createdEstimateSummary, type CreatedEstimateSummary} from './created-estimate-summary';
import type {EstimateReview} from './estimate-preparation';
import {estimatePreparationPayload,estimateReviewTotal} from './estimate-preparation';


import { quibiWorkflowConfig } from "./workflow-config";
import { quibiWorkflowContext as context, quibiEstimatePreparationContext } from "./workflow-context";
import { linkManualQuibiEstimate } from "./manual-estimate-action";
import { quibiDevEstimateChoices } from "./write-options";
import { checkTrackedEstimateStatus, sendManualLinkedEstimate, type ManualSendAuthorization, createAndVerifyEstimate, sendAndTrackEstimate, updateAndVerifyEstimate } from "./write-workflow";
import { assertQuibiDevTestSendAllowed, quibiDevTestRecipient, type EstimateBody } from "./write-contract";

type Result = { ok: true; detail: string; sha?: string; sourceSha?:string; review?: EstimateReview; document?: CreatedEstimateSummary } | { ok: false; message: string };
const fail = (message: string): Result => ({ ok: false, message });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validPrice = (value: FormDataEntryValue | null): number | null => {
  if (typeof value !== "string" || !/^\d+(?:[.,]\d{1,2})?$/.test(value)) return null;
  const amount = Number(value.replace(",", "."));
  return amount > 0 && amount <= 1_000_000 ? amount : null;
};

/** A documented free line avoids the currently failing /api2/sifranti catalog. */
export async function createQuibiDevEstimate(form: FormData): Promise<Result> {
  const serviceRequestId = form.get("serviceRequestId");
  const saleTypeId = form.get("saleTypeId");
  const unitId = form.get("unitId");
  const vatId = form.get("vatId");
  const price = validPrice(form.get("unitPrice"));
  if (typeof serviceRequestId !== "string" || typeof saleTypeId !== "string" ||
      typeof unitId !== "string" || typeof vatId !== "string" || (price == null && !form.get("catalogSource") && !form.get('historySource')&&!form.get('catalogLines')) ||
      form.get("serviceMatchConfirmed") !== "yes") return fail("Preverite ceno in izrecno potrdite ujemanje storitve.");
  const expectedSha = form.get('expectedSha');
  if (typeof expectedSha !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha) || form.get('createConfirmed') !== 'yes') return fail('Najprej preverite pripravo in izrecno potrdite CREATE istega payload-a.');
  let createdId: string | null = null;
  try {
    const ctx = await context(serviceRequestId);
    const { data: quotes, error } = await ctx.db.from("quotes").select("id")
      .eq("organization_id", ctx.access.organizationId).eq("service_request_id", serviceRequestId).limit(1);
    if (error || quotes?.length) return fail("Predračun je že povezan. Za spremembo uporabite popravek.");
    const choices = await quibiDevEstimateChoices(ctx.write);
    if (!choices.saleTypes.some((item) => item.id === saleTypeId) ||
        !choices.units.some((item) => item.id === unitId) ||
        !choices.vatRates.some((item) => item.id === vatId)) return fail("Izbrani šifranti v Quibiju niso več veljavni.");
    const warehouseId=String(form.get("warehouseId")??"");
    if(choices.warehouses.length&&!choices.warehouses.some(w=>w.id===warehouseId))return fail("Izberite veljavno Quibi skladišče.");
    const rows=await estimateCatalogRows(form,ctx.read,choices,ctx.remoteCustomer);
    const source = rows?null:await estimateCatalogSource(form, ctx.read, choices,ctx.remoteCustomer);
    if(form.get('historySource')&&ctx.remoteCustomer.priceListId===undefined)throw Error('QUIBI_CUSTOMER_PRICING_UNVERIFIED');
    const history=!rows&&form.get('historySource') ? await freshHistorySource(form,historyRead(ctx.read),{customerId:ctx.link.external_id,vehicleId:ctx.vehicleLink.quibi_vehicle_id,wanted:ctx.request.service_wanted??'',code:source?.option.code,priceListId:ctx.remoteCustomer.priceListId}) : null;
    if(history)verifyHistoryCatalogReferences(history,choices);
    if(rows && form.get('expectedSourceSha')!==rows.sourceSha)return fail('Postavke ali Quibijeve cene so se spremenile. Ponovno preglejte celoten predračun.');
    if(history && form.get('expectedSourceSha')!==history.sourceSha)return fail('Zgodovina ali aktualna cena se je spremenila. Ponovno preglejte predlog; dokument ni ustvarjen.');
    if(!history && source && form.get('expectedSourceSha')!==source.option.sourceSha)return fail('Quibijeva postavka ali cena se je spremenila. Ponovno preglejte ponudbo; dokument ni ustvarjen.');
    const op = await createAndVerifyEstimate({ journal: ctx.journal, read: ctx.read, write: ctx.write, expectedRequestSha256: expectedSha,
      verifyContent:rows?(detail,body)=>{const verified=detail as Awaited<ReturnType<typeof ctx.read.estimateDetail>>;confirmBusinessContent(verified,body,rows.unitNetPrices,rows.unitIds);if(Math.round(Number(verified.amount)*100)!==Math.round(estimateReviewTotal(rows.reviewedLines)*100))throw Error('QUIBI_DOCUMENT_AMOUNT_MISMATCH')}:undefined,
      input: { serviceRequestId, customerId: ctx.link.external_id,
        vehicleId: ctx.vehicleLink.quibi_vehicle_id, saleTypeId, warehouseId:warehouseId||undefined,
        lines: rows ? rows.lines : history ? history.payloadLines : source ? [source.line] : [{ opis: ctx.lineDescription, enota_id: unitId, ddv_id: vatId,
          kolicina: 1, cenaZDDV: unitNetFromGross(price!,vatId,choices.vatRates), popust: 0 }],
        note: `${quibiWorkflowConfig(process.env, "write").mode === "dev" ? "TEST-AUTOSERVIS-SELAN" : "AVTOSERVIS-SELAN"} ${serviceRequestId}` },
    });
    if (!op.quibiId) return fail("Dokument ni preverljivo ustvarjen.");
    createdId = op.quibiId;
    const detail = await ctx.read.estimateDetail(op.quibiId, ctx.link.external_id);
    const document = createdEstimateSummary(detail, {id:op.quibiId,customerId:ctx.link.external_id,
      vehicleId:ctx.vehicleLink.quibi_vehicle_id,sha:op.quibiContentSha256 ?? '',amount:rows?estimateReviewTotal(rows.reviewedLines):history?.total ?? source?.total ?? price!},ctx.request.customer_id!,false);
    // The existing RPC registers a digest after another Quibi re-read and keeps
    // Tadej's existing review/price approval path. UI labels the API origin.
    const linked = await linkManualQuibiEstimate(serviceRequestId, op.quibiId, true);
    return {ok:true,document:{...document,linked:linked.ok},detail:linked.ok
      ? `Quibi predračun #${op.quibiId} je ustvarjen in povezan. Pošiljanje zahteva ločeno potrditev.`
      : `Dokument #${op.quibiId} obstaja v Quibiju, povezava s primerom pa zahteva pregled: ${linked.message}. Ne ustvarjajte novega dokumenta.`};
  } catch(error) {
    const code=error instanceof Error&&/^QUIBI_[A-Z_]+(?:_\d{3})?$/.test(error.message)?error.message:"QUIBI_UNCLASSIFIED_FAILURE";console.error(JSON.stringify({event:"quibi_estimate_create_failure",caseId:serviceRequestId,code}));
    return fail(code==='QUIBI_API_REJECTED'?`Quibi je zavrnil ustvarjanje predračuna. ${error instanceof QuibiValidationError ? error.validation.summary : ''} Poskus ostaja zaklenjen; ne ponavljajte CREATE.`:createdId ? `Quibi dokument #${createdId} je ustvarjen, ponovno preverjanje ali povezava pa ni potrjena. Ne ustvarjajte drugega dokumenta.` : "Quibi operacija ni potrjena. Pred ponovnim poskusom preverite dnevnik; ne ustvarjajte drugega dokumenta.");
  }
}

export async function updateQuibiDevEstimate(form: FormData): Promise<Result> {
  const serviceRequestId = form.get("serviceRequestId");
  const quoteId = form.get("quoteId");
  const price = validPrice(form.get("unitPrice"));
  if (typeof serviceRequestId !== "string" || typeof quoteId !== "string" || !uuid.test(quoteId) ||
      price == null || form.get("serviceMatchConfirmed") !== "yes")
    return fail("Preverite popravek cene in potrdite ujemanje storitve.");
  const preparation=await prepareQuibiEstimateRevision(form);
  if(!preparation.ok)return preparation;
  if(form.get('updateConfirmed')!=='yes'||form.get('expectedSha')!==preparation.sha)return fail('Najprej preglejte SHA popravka in izrecno potrdite UPDATE iste vsebine.');
  try {
    const ctx = await context(serviceRequestId);
    const { data: quote } = await ctx.db.from("quotes")
      .select("id,content_sha256,evidence_kind,evidence_payload,internal_review_status")
      .eq("organization_id", ctx.access.organizationId).eq("service_request_id", serviceRequestId)
      .eq("id", quoteId).maybeSingle();
    const { data: latest } = await ctx.db.from("quotes").select("id")
      .eq("organization_id", ctx.access.organizationId).eq("service_request_id", serviceRequestId)
      .order("version_no", { ascending: false }).limit(1).maybeSingle();
    const evidence = quote?.evidence_payload as { external_id?: unknown; customer_external_id?: unknown } | null;
    const created = await ctx.journal.get("estimate", serviceRequestId);
    if (!quote || !created || !created.quibiId || latest?.id !== quoteId || quote.internal_review_status !== "rejected_for_revision" ||
        quote.evidence_kind !== "quibi_manual_estimate" || !evidence ||
        evidence.customer_external_id !== ctx.link.external_id || evidence.external_id !== created.quibiId ||
        created.state !== "verified" || !created.externalId)
      return fail("Popravek je dovoljen samo za zavrnjeni, preverjeno ustvarjeni Quibi predračun.");
    const base = JSON.parse(created.requestBody) as EstimateBody;
    const first = base.Postavkedokumenta["1"];
    if (!first || ("sifra" in first)) return fail("Postavke ni mogoče varno popraviti.");
    const replacement: EstimateBody = { ...base, Postavkedokumenta: {
      "1": { ...first, opis: ctx.lineDescription, cenaZDDV: unitNetFromGross(price,first.ddv_id,(await quibiDevEstimateChoices(ctx.write)).vatRates) },
    } };
    if(stableEstimatePayload(withDocumentId(replacement,created.quibiId)).sha256!==form.get('expectedSha'))return fail('Priprava popravka se je spremenila. Ponovno preglejte SHA; Quibi ni bil spremenjen.');
    const updated = await updateAndVerifyEstimate({ journal: ctx.journal, read: ctx.read, write: ctx.write,
      serviceRequestId, revisionId: quoteId, customerId: ctx.link.external_id,
      vehicleId: ctx.vehicleLink.quibi_vehicle_id, documentId: created.quibiId,
      externalId: created.externalId, numberingId: String(base.Glavadokumenta.stevilcenje_id),
      expectedContentSha256: quote.content_sha256, replacement });
    if (!updated.quibiId) return fail("Popravek ni preverjen.");
    const linked = await linkManualQuibiEstimate(serviceRequestId, updated.quibiId, true);
    return linked.ok ? { ok: true, detail: `Quibi predračun #${updated.quibiId} je popravljen in čaka na nov Tadejev pregled.` }
      : fail("Popravek v Quibiju je uspel, nova različica v primeru pa zahteva pregled.");
  } catch {
    return fail("Stanje popravka je nejasno. Ne ponavljajte write klica; preverite Quibi dokument in dnevnik.");
  }
}

/** Test delivery goes to the configured test mailbox, never the customer. */
export async function sendQuibiDevTestEstimate(form: FormData): Promise<Result> {
  const serviceRequestId = form.get("serviceRequestId");
  const quoteId = form.get("quoteId");
  if (typeof serviceRequestId !== "string" || typeof quoteId !== "string" || !uuid.test(quoteId) ||
      form.get("testSendConfirmed") !== "yes") return fail("Potrdite testno pošiljanje.");
  try {
    const ctx = await context(serviceRequestId);
    const { data: quote } = await ctx.db.from("quotes")
      .select("id,content_sha256,evidence_kind,evidence_payload,internal_review_status")
      .eq("organization_id", ctx.access.organizationId).eq("service_request_id", serviceRequestId)
      .eq("id", quoteId).maybeSingle();
    const { data: latest } = await ctx.db.from("quotes").select("id")
      .eq("organization_id", ctx.access.organizationId).eq("service_request_id", serviceRequestId)
      .order("version_no", { ascending: false }).limit(1).maybeSingle();
    const evidence = quote?.evidence_payload as { external_id?: unknown; customer_external_id?: unknown } | null;
    const created = await ctx.journal.get("estimate", serviceRequestId);
    assertQuibiDevTestSendAllowed(process.env);
    const recipient = quibiDevTestRecipient(process.env, ctx.customer.email);
    quibiDevTestRecipient(process.env, ctx.remoteCustomer.email);
    if (!quote || !created || latest?.id !== quoteId || quote.internal_review_status !== "approved_for_send" ||
        quote.evidence_kind !== "quibi_manual_estimate" ||
        evidence?.external_id !== created.quibiId || evidence?.customer_external_id !== ctx.link.external_id ||
        created.state !== "verified" || !created.externalId || !created.quibiId || !recipient ||
        recipient.trim().toLowerCase() === ctx.customer.email?.trim().toLowerCase())
      return fail("Za testno pošiljanje potrebujete svež, Tadejevo odobren Quibi DEV predračun in testni naslov.");
    const base = JSON.parse(created.requestBody) as EstimateBody;
    const op = await sendAndTrackEstimate({ journal: ctx.journal, read: ctx.read, write: ctx.write,
      quoteRevisionId: quoteId, serviceRequestId, documentId: created.quibiId,
      customerId: ctx.link.external_id, vehicleId: ctx.vehicleLink.quibi_vehicle_id,
      externalId: created.externalId, numberingId: String(base.Glavadokumenta.stevilcenje_id),
      approvedContentSha256: quote.content_sha256, approvedForSend: true,
      recipient, subject: `[TEST] Predračun Quibi DEV #${created.quibiId}`,
      beforeDispatch: async () => {
        assertQuibiDevTestSendAllowed(process.env);
        const fresh = await context(serviceRequestId);
        const [q, last] = await Promise.all([
          fresh.db.from("quotes").select("content_sha256,evidence_payload,internal_review_status")
            .eq("organization_id", fresh.access.organizationId).eq("service_request_id", serviceRequestId).eq("id", quoteId).maybeSingle(),
          fresh.db.from("quotes").select("id").eq("organization_id", fresh.access.organizationId)
            .eq("service_request_id", serviceRequestId).order("version_no", { ascending: false }).limit(1).maybeSingle(),
        ]);
        const e = q.data?.evidence_payload as { external_id?: unknown; customer_external_id?: unknown } | null;
        if (q.error || last.error || last.data?.id !== quoteId || q.data?.internal_review_status !== "approved_for_send" ||
            q.data.content_sha256 !== quote.content_sha256 || e?.external_id !== created.quibiId ||
            e?.customer_external_id !== fresh.link.external_id || fresh.link.external_id !== ctx.link.external_id ||
            fresh.vehicleLink.quibi_vehicle_id !== ctx.vehicleLink.quibi_vehicle_id ||
            fresh.request.service_wanted !== ctx.request.service_wanted ||
            quibiDevTestRecipient(process.env, fresh.remoteCustomer.email) !== recipient ||
            quibiDevTestRecipient(process.env, fresh.customer.email) !== recipient) throw new Error("QUIBI_SEND_AUTHORIZATION_CHANGED");
      } });
    if (op.sendStatus === "failed") return fail("Quibi je testno pošiljanje zavrnil. Preverite send_status; ne ponavljajte samodejno.");
    return { ok: true, detail: op.sendStatus === "sent" ? "Quibi je testno sporočilo predal poštnemu strežniku. To ne potrjuje prejema pri stranki."
      : "Quibi testno pošiljanje je v čakalni vrsti. Osvežite stanje z istim send_id." };
  } catch {
    return fail("Stanje testnega pošiljanja ni potrjeno. Ne ponavljajte pošiljanja; preverite dnevnik in send_status.");
  }
}

async function manualAuthorization(serviceRequestId: string, quoteId: string) {
  assertQuibiDevTestSendAllowed(process.env);
  const ctx = await context(serviceRequestId);
  quibiDevTestRecipient(process.env, ctx.remoteCustomer.email);
  const [quoteResult, latestResult, created] = await Promise.all([
    ctx.db.from("quotes").select("id,service_request_id,content_sha256,evidence_kind,evidence_payload,internal_review_status")
      .eq("organization_id", ctx.access.organizationId).eq("service_request_id", serviceRequestId).eq("id", quoteId).maybeSingle(),
    ctx.db.from("quotes").select("id").eq("organization_id", ctx.access.organizationId)
      .eq("service_request_id", serviceRequestId).order("version_no", { ascending: false }).limit(1).maybeSingle(),
    ctx.journal.get("estimate", serviceRequestId),
  ]);
  const q = quoteResult.data;
  const e = q?.evidence_payload as { external_id?: unknown; customer_external_id?: unknown } | null;
  if (quoteResult.error || latestResult.error || !q || typeof e?.external_id !== "string" ||
      typeof e.customer_external_id !== "string" || created?.quibiId === e.external_id)
    throw new Error("QUIBI_SEND_AUTHORIZATION");
  const authorization: ManualSendAuthorization = {
    actorId: ctx.access.userId, organizationId: ctx.access.organizationId, role: ctx.access.role,
    serviceRequestId, caseStatus: ctx.request.status, quoteRevisionId: q.id, quoteServiceRequestId: q.service_request_id,
    latestQuoteId: latestResult.data?.id ?? "", quoteReviewStatus: q.internal_review_status,
    evidenceKind: q.evidence_kind, documentId: e.external_id, customerId: ctx.link.external_id,
    evidenceCustomerId: e.customer_external_id, vehicleId: ctx.vehicleLink.quibi_vehicle_id,
    serviceWanted: ctx.request.service_wanted, approvedContentSha256: q.content_sha256, customerEmail: ctx.customer.email,
  };
  return { ctx, authorization };
}
export async function sendManualQuibiDevTestEstimate(form: FormData): Promise<Result> {
  const serviceRequestId = form.get("serviceRequestId"), quoteId = form.get("quoteId");
  const reference = form.get("manualMatchReference");
  if (typeof serviceRequestId !== "string" || !uuid.test(serviceRequestId) || typeof quoteId !== "string" ||
      !uuid.test(quoteId) || typeof reference !== "string") return fail("Neveljaven servisni primer ali potrditev.");
  try {
    const { ctx } = await manualAuthorization(serviceRequestId, quoteId);
    const op = await sendManualLinkedEstimate({ journal: ctx.journal, read: ctx.read, write: ctx.write,
      environment: process.env, serviceRequestId, quoteRevisionId: quoteId,
      authorize: async () => (await manualAuthorization(serviceRequestId, quoteId)).authorization,
      manualMatchConfirmed: form.get("manualMatchConfirmed") === "yes", manualMatchReference: reference,
      testSendConfirmed: form.get("testSendConfirmed") === "yes" });
    return sendResult(op.sendStatus);
  } catch {
    return fail("Pošiljanje ni potrjeno. Preverite odobritev, ujemanje in dnevnik. Ob neznanem izidu ne ponavljajte pošiljanja.");
  }
}
function sendResult(status: string | null): Result {
  if (status === "failed") return fail("Quibi poroča failed. Ta različica predračuna ne bo ponovno poslana.");
  return { ok: true, detail: status === "sent" ? "Quibi poroča sent: predano poštnemu strežniku, prejem ni potrjen."
    : "Quibi poroča queued. Preverite stanje z istim shranjenim send_id." };
}
/** Explicit read-only status action; it cannot create a journal entry or dispatch. */
export async function checkQuibiDevTestEstimateStatus(form: FormData): Promise<Result> {
  const caseId = form.get("serviceRequestId"), quoteId = form.get("quoteId");
  if (typeof caseId !== "string" || !uuid.test(caseId) || typeof quoteId !== "string" || !uuid.test(quoteId))
    return fail("Neveljaven primer ali predračun.");
  try {
    const prepared = await quibiEstimatePreparationContext(caseId,'send');
    const ctx={...prepared,journal:quibiWorkflowJournal(prepared.access.organizationId,prepared.access.userId)};
    const { data: quote, error } = await ctx.db.from("quotes").select("evidence_payload")
      .eq("organization_id", ctx.access.organizationId).eq("service_request_id", caseId).eq("id", quoteId).maybeSingle();
    const evidence = quote?.evidence_payload as { external_id?: unknown } | null;
    const op = await ctx.journal.get("send", quoteId);
    if (error || !op || op.serviceRequestId !== caseId || typeof evidence?.external_id !== "string")
      throw new Error("QUIBI_SEND_STATUS_UNAVAILABLE");
    const result = await checkTrackedEstimateStatus({ journal: ctx.journal, write: configuredQuibiWorkflowStatusClient(),
      operation: op, documentId: evidence.external_id });
    return sendResult(result.sendStatus);
  } catch { return fail("Status ni preverljiv. Brez novega pošiljanja preverite shranjeni send_id in dnevnik."); }
}

/** Only READ calls: no operation journal insertion or external dispatch. */
export async function prepareQuibiEstimate(form: FormData): Promise<Result> {
  const id=form.get('serviceRequestId'),sale=form.get('saleTypeId'),unit=form.get('unitId'),vat=form.get('vatId'),price=validPrice(form.get('unitPrice'));
  if(typeof id!=='string'||typeof sale!=='string'||typeof unit!=='string'||typeof vat!=='string'||(price==null&&!form.get('catalogSource')&&!form.get('historySource')&&!form.get('catalogLines')))return fail('Preverite ceno, storitev in identiteto.');
  let stage="identity";
  try {
    const ctx=await quibiEstimatePreparationContext(id);
    const {data:quotes,error}=await ctx.db.from('quotes').select('id').eq('organization_id',ctx.access.organizationId).eq('service_request_id',id).limit(1);
    if(error||quotes?.length)return fail('Predračun je že povezan ali njegove evidence ni mogoče preveriti.');
    stage="catalogs";
    const [numberings,sales,units,vatRates,warehouses]=await Promise.all(['numberings','saleTypes','units','vat','warehouses'].map(kind=>ctx.read.catalog(kind as 'numberings'|'saleTypes'|'units'|'vat'|'warehouses')));
    const warehouseId=String(form.get('warehouseId')??'');
    if(warehouses.length&&!warehouses.some(w=>w.id===warehouseId))return fail('Izberite veljavno Quibi skladišče.');
    stage="pricing";
    const rows=await estimateCatalogRows(form,ctx.read,{units,vatRates},ctx.remoteCustomer);
    const source=rows?null:await estimateCatalogSource(form,ctx.read,{units,vatRates},ctx.remoteCustomer);
    if(form.get('historySource')&&ctx.remoteCustomer.priceListId===undefined)throw Error('QUIBI_CUSTOMER_PRICING_UNVERIFIED');
    stage="history";
    const history=!rows&&form.get('historySource') ? await freshHistorySource(form,historyRead(ctx.read),{customerId:ctx.link.external_id,vehicleId:ctx.vehicleLink.quibi_vehicle_id,wanted:ctx.request.service_wanted??'',code:source?.option.code,priceListId:ctx.remoteCustomer.priceListId}) : null;
    if(history)verifyHistoryCatalogReferences(history,{units,vatRates});
    stage="review";
    const payload=estimatePreparationPayload({serviceRequestId:id,customerId:ctx.link.external_id,vehicleId:ctx.vehicleLink.quibi_vehicle_id,saleTypeId:sale,warehouseId:warehouseId||undefined,lines:rows?rows.lines:history?history.payloadLines:source?[source.line]:[{opis:ctx.lineDescription,enota_id:unit,ddv_id:vat,kolicina:1,cenaZDDV:unitNetFromGross(price!,vat,vatRates),popust:0}],note:`${quibiWorkflowConfig(process.env,'read').mode==='dev'?'TEST-AUTOSERVIS-SELAN':'AVTOSERVIS-SELAN'} ${id}`},{numberings,saleTypes:sales,units,vatRates},rows?rows.reviewedLines:history?history.reviewedLines:source?[source.reviewedLine]:undefined);
    payload.review.pricingSource=rows?(rows.hasPriceOverrides?'Quibi postavke z ročno urejenimi cenami za ta predračun; podatki in zneski so sveže preverjeni.':ctx.remoteCustomer.priceListId?'Sveže preverjeni Quibi cenik stranke #'+ctx.remoteCustomer.priceListId:'Sveže preverjene osnovne cene Quibi artiklov; stranka nima posebnega cenika.'):history?(ctx.remoteCustomer.priceListId?'Aktualni Quibi cenik stranke #'+ctx.remoteCustomer.priceListId+'; postavke iz dokumenta #':'Aktualne osnovne cene Quibi artiklov; postavke iz dokumenta #')+history.documentId:source?(ctx.remoteCustomer.priceListId?'Quibi cenik #'+ctx.remoteCustomer.priceListId+' je dodeljen tej stranki.':'Quibi stranka nima dodeljenega posebnega cenika; uporabljene so osnovne cene artiklov.'):'Ročno pregledana cena in sveži Quibi šifranti.';
    return {ok:true,sha:payload.sha256,sourceSha:rows?.sourceSha??history?.sourceSha??source?.option.sourceSha,review:payload.review,detail:`Priprava preverjena; dokument ni ustvarjen ali poslan. Pravica WRITE številčenja še ni preizkušena. Pred ustvarjanjem je potreben ponoven pregled.\nSHA-256: ${payload.sha256}\n${JSON.stringify(payload.body,null,2)}`};
  } catch(error) {
    const code=error instanceof Error && /^QUIBI_[A-Z_0-9]{1,80}$/.test(error.message)?error.message:'PREVIEW_UNAVAILABLE';
    const errorType=error instanceof Error && ['Error','TypeError','TimeoutError','AbortError'].includes(error.name)?error.name:'other';
    console.error(JSON.stringify({event:'quibi_preview_failed',caseId:id,stage,code,errorType}));
    if(code==='QUIBI_HTTP_401'||code==='QUIBI_HTTP_403')return fail('Quibi ne dovoli branja podatkov. Poskusite pozneje; če se napaka ponavlja, preverite dostop do Quibi DEV. Noben dokument ni ustvarjen ali poslan.');
    if(['QUIBI_CATALOG_LINES_INVALID','QUIBI_CATALOG_QUANTITY_INVALID','QUIBI_CATALOG_DISCOUNT_INVALID'].includes(code))return fail('Preglejte vse postavke: izberite Quibi artikel, pozitivno količino in popust med 0 in 100 %. Vnosi so ohranjeni.');
    if(code==='QUIBI_CATALOG_PRICE_INVALID')return fail('Popravite ceno pri postavki. Vnesite veljaven znesek v evrih; vnosi so ohranjeni.');
    if(code==='QUIBI_CATALOG_PRICE_OVERRIDE_UNSUPPORTED')return fail('Cene zalogovne postavke ni mogoče varno spremeniti tukaj. Uporabite svežo Quibi ceno ali jo uredite v Quibiju.');
    if(code==='QUIBI_CUSTOMER_PRICING_UNVERIFIED')return fail('Quibi ni zanesljivo potrdil cenovne politike stranke ali dovoljenega prenosa posebne cene. Preverite dodeljeni cenik in artikel v Quibiju.');
    if(['QUIBI_CASE_NOT_READY','QUIBI_CASE_LINKS_NOT_READY','QUIBI_CUSTOMER_CHANGED','QUIBI_LINK_CHANGED','QUIBI_ENVIRONMENT_MISMATCH','QUIBI_WRITE_FORBIDDEN'].includes(code))return fail('Preverite pregled primera ter potrjeno povezavo stranke in pravega vozila. Noben dokument ni ustvarjen.');
    return fail('Predogleda trenutno ni mogoče preveriti. Ponovno kliknite Preglej ponudbo. Noben dokument ni ustvarjen ali poslan.');
  }
}

/** READ-only revision preparation; WRITE stays behind a separate explicit confirmation. */
export async function prepareQuibiEstimateRevision(form:FormData):Promise<Result>{
 const id=form.get('serviceRequestId'),quoteId=form.get('quoteId'),price=validPrice(form.get('unitPrice'));
 if(typeof id!=='string'||typeof quoteId!=='string'||!uuid.test(quoteId)||price==null||form.get('serviceMatchConfirmed')!=='yes')return fail('Preverite popravek in ujemanje storitve.');
 try{
 const ctx=await quibiEstimatePreparationContext(id),journal=quibiWorkflowJournal(ctx.access.organizationId,ctx.access.userId);
 const [{data:quote,error:qe},{data:latest,error:le},created]=await Promise.all([
 ctx.db.from('quotes').select('id,content_sha256,evidence_kind,evidence_payload,internal_review_status').eq('organization_id',ctx.access.organizationId).eq('service_request_id',id).eq('id',quoteId).single(),
 ctx.db.from('quotes').select('id').eq('organization_id',ctx.access.organizationId).eq('service_request_id',id).order('version_no',{ascending:false}).limit(1).single(),journal.get('estimate',id)]);
 const evidence=quote?.evidence_payload as {external_id?:string;customer_external_id?:string}|null;
 if(qe||le||!quote||latest?.id!==quoteId||quote.internal_review_status!=='rejected_for_revision'||quote.evidence_kind!=='quibi_manual_estimate'||!created||created.state!=='verified'||!created.quibiId||evidence?.external_id!==created.quibiId||evidence?.customer_external_id!==ctx.link.external_id)throw Error('REVISION_UNVERIFIED');
 const current=await loadQuibiDocument(ctx.read,'estimate',created.quibiId,ctx.link.external_id);
 if(current.contentSha256!==quote.content_sha256||current.vehicleId!==ctx.vehicleLink.quibi_vehicle_id||current.externalId!==created.externalId||current.lines.length!==1)throw Error('REVISION_CHANGED');
 const base=JSON.parse(created.requestBody) as EstimateBody;
 const [saleTypes,units,vatRates,numberings]=await Promise.all(['saleTypes','units','vat','numberings'].map(kind=>ctx.read.catalog(kind as 'saleTypes'|'units'|'vat'|'numberings')));
 const payload=estimateRevisionPreparation(base,current,ctx.lineDescription,price,{saleTypes,units,vatRates,numberings});
 return {ok:true,sha:payload.sha256,detail:'Priprava popravka preverjena; Quibi ni bil spremenjen. SHA: '+payload.sha256+'\n'+payload.json};
 }catch{return fail('Priprava popravka ni potrjena. Preverite zadnjo zavrnjeno različico, identiteto, šifrante in journal.');}
}

function historyRead(read:Awaited<ReturnType<typeof quibiEstimatePreparationContext>>['read']){
 if(!('historyDocuments' in read))throw Error('QUIBI_HISTORY_REAL_READ_REQUIRED');
 return read;
}
/** Authorized READ only. Account-wide results are suggestions, never vehicle history evidence. */
export async function prepareQuibiEstimateHistory(form:FormData){
 try{
 const id=form.get('serviceRequestId');if(typeof id!=='string'||!uuid.test(id))throw Error('INVALID_CASE');
 const ctx=await quibiEstimatePreparationContext(id);
 const read=historyRead(ctx.read);
 const [units,vatRates]=await Promise.all([read.catalog('units'),read.catalog('vat')]);
 const source=await estimateCatalogSource(form,read,{units,vatRates},ctx.remoteCustomer);
 const offset=Number(form.get('historyOffset')??0),scope=form.get('historyScope')==='other'?'other':'vehicle';
 if(!Number.isSafeInteger(offset)||offset<0)throw Error('INVALID_HISTORY_PAGE');
 if(ctx.remoteCustomer.priceListId===undefined)return {proposals:[],issues:['Quibi nima potrjene osnovne cenovne politike te stranke. Zgodovinski predlog je ustavljen; uporabite preverjeni artikel in cenik stranke.']};
 return await loadEstimateHistory(read,{customerId:ctx.link.external_id,vehicleId:ctx.vehicleLink.quibi_vehicle_id,wanted:ctx.request.service_wanted??'',code:source?.option.code,priceListId:ctx.remoteCustomer.priceListId},{scope,offset});
 }catch{return {proposals:[],issues:['Zgodovine ni mogoče preveriti. Predlog ni pripravljen; dokument ni ustvarjen.']};}
}

/** Owner/admin READ reconciliation; no CREATE, UPDATE or SEND transport. */
export async function reconcileQuibiEstimate(serviceRequestId:string){
 try{const ctx=await quibiEstimatePreparationContext(serviceRequestId);if(serviceRequestId==='9d40c42f-b6a8-473b-983f-f9620df97d10')throw Error('CASE_BLOCKED');const read=historyRead(ctx.read),result=await reconcileEstimate(read,quibiWorkflowJournal(ctx.access.organizationId,ctx.access.userId),serviceRequestId);
 if(result.outcome==='verified'){const linked=await linkManualQuibiEstimate(serviceRequestId,result.documentId!,true);return {ok:linked.ok,message:linked.ok?'Obstoječi Quibi predračun je ponovno preverjen in povezan. Ni bilo novega CREATE ali pošiljanja.':'Dokument je preverjen, povezava zahteva pregled. Novega ne ustvarjajte.'};}
 return {ok:false,message:result.outcome==='not_found'?'Quibi dokumenta s to referenco še ne vrne. Izid ostaja neznan; ponovno ustvarjanje je ustavljeno.':result.outcome==='review'?'Quibi dokument #'+result.documentId+' je najden, prvotna cena ali vsebina pa ni neodvisno potrjena. Preglejte obstoječi dokument; novega ne ustvarjajte.':'Izida ni mogoče zanesljivo potrditi. Ponovno ustvarjanje ostaja ustavljeno.'};
 }catch{return {ok:false,message:'Quibi READ preverjanje ni uspelo. Izid ostaja neznan; novega dokumenta ne ustvarjajte.'};}
}
