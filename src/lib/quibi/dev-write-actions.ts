"use server";

import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";
import { configuredQuibiReadClient } from "./client";
import { customerFingerprint } from "./contracts";
import { linkManualQuibiEstimate } from "./manual-estimate-action";
import { verifiedVehicleLink } from "./price-suggestion";
import { configuredQuibiDevWriteClient } from "./write-client";
import { quibiDevOperationJournal } from "./write-journal";
import { quibiDevEstimateChoices } from "./write-options";
import { checkTrackedEstimateStatus, sendManualLinkedEstimate, type ManualSendAuthorization, createAndVerifyEstimate, sendAndTrackEstimate, updateAndVerifyEstimate } from "./write-workflow";
import { assertQuibiDevTestSendAllowed, quibiDevTestRecipient, type EstimateBody } from "./write-contract";

type Result = { ok: true; detail: string } | { ok: false; message: string };
const fail = (message: string): Result => ({ ok: false, message });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validPrice = (value: FormDataEntryValue | null): number | null => {
  if (typeof value !== "string" || !/^\d+(?:[.,]\d{1,2})?$/.test(value)) return null;
  const amount = Number(value.replace(",", "."));
  return amount > 0 && amount <= 1_000_000 ? amount : null;
};

async function context(serviceRequestId: string) {
  const access = await requirePhase1OperationalAccess();
  if (!["owner", "admin"].includes(access.role) || !uuid.test(serviceRequestId)) throw new Error("QUIBI_WRITE_FORBIDDEN");
  // Fails closed even when invoked directly without a visible UI button.
  const write = configuredQuibiDevWriteClient();
  const db = await createClient();
  const { data: request, error: requestError } = await db.from("service_requests")
    .select("customer_id,vehicle_id,status,service_wanted").eq("organization_id", access.organizationId)
    .eq("id", serviceRequestId).is("archived_at", null).maybeSingle();
  if (requestError || !request || request.status !== "preparing_offer" || !request.customer_id ||
      !request.vehicle_id || !request.service_wanted?.trim()) throw new Error("QUIBI_CASE_NOT_READY");
  const [customerResult, vehicleResult, linkResult, vehicleLinkResult, prepResult, fixedResult] = await Promise.all([
    db.from("customers").select("display_name,phone,email").eq("organization_id", access.organizationId)
      .eq("id", request.customer_id).is("archived_at", null).maybeSingle(),
    db.from("vehicles").select("customer_id,vin,registration_current,make,model")
      .eq("organization_id", access.organizationId).eq("id", request.vehicle_id)
      .is("archived_at", null).maybeSingle(),
    db.from("integration_links").select("external_id,local_fingerprint,external_fingerprint,sync_status")
      .eq("organization_id", access.organizationId).eq("provider", "quibi")
      .eq("entity_type", "customer").eq("entity_id", request.customer_id).maybeSingle(),
    db.from("quibi_vehicle_links").select("quibi_customer_id,quibi_vehicle_id,sync_status,local_fingerprint,external_fingerprint")
      .eq("organization_id", access.organizationId).eq("customer_id", request.customer_id)
      .eq("vehicle_id", request.vehicle_id).maybeSingle(),
    db.from("offer_preparations").select("status").eq("organization_id", access.organizationId)
      .eq("service_request_id", serviceRequestId).maybeSingle(),
    db.from("published_fixed_price_cases").select("id").eq("organization_id", access.organizationId)
      .eq("service_request_id", serviceRequestId).maybeSingle(),
  ]);
  if ([customerResult, vehicleResult, linkResult, vehicleLinkResult, prepResult, fixedResult]
      .some((result) => result.error) || !customerResult.data || !vehicleResult.data ||
      !linkResult.data || !vehicleLinkResult.data || fixedResult.data ||
      prepResult.data?.status !== "ready_for_provider" ||
      vehicleResult.data.customer_id !== request.customer_id || linkResult.data.sync_status !== "ok")
    throw new Error("QUIBI_CASE_LINKS_NOT_READY");
  const customer = customerResult.data;
  const vehicle = vehicleResult.data;
  const link = linkResult.data;
  const vehicleLink = vehicleLinkResult.data;
  if (customerFingerprint({ name: customer.display_name, phone: customer.phone ?? "",
    email: customer.email ?? "" }) !== link.local_fingerprint) throw new Error("QUIBI_CUSTOMER_CHANGED");
  const read = configuredQuibiReadClient();
  const [remoteCustomer, remoteVehicle] = await Promise.all([
    read.customer(link.external_id), read.vehicle(vehicleLink.quibi_vehicle_id, link.external_id),
  ]);
  if (customerFingerprint(remoteCustomer) !== link.external_fingerprint ||
      !verifiedVehicleLink({ customerId: link.external_id,
        localVehicle: { vin: vehicle.vin ?? "", registration: vehicle.registration_current ?? "",
          make: vehicle.make ?? "", model: vehicle.model ?? "" }, remoteVehicle, vehicleLink }))
    throw new Error("QUIBI_LINK_CHANGED");
  return { access, db, request, customer, remoteCustomer, link, vehicleLink, read, write,
    journal: quibiDevOperationJournal(access.organizationId, access.userId) };
}

/** A documented free line avoids the currently failing /api2/sifranti catalog. */
export async function createQuibiDevEstimate(form: FormData): Promise<Result> {
  const serviceRequestId = form.get("serviceRequestId");
  const saleTypeId = form.get("saleTypeId");
  const unitId = form.get("unitId");
  const vatId = form.get("vatId");
  const price = validPrice(form.get("unitPrice"));
  if (typeof serviceRequestId !== "string" || typeof saleTypeId !== "string" ||
      typeof unitId !== "string" || typeof vatId !== "string" || price == null ||
      form.get("serviceMatchConfirmed") !== "yes") return fail("Preverite ceno in izrecno potrdite ujemanje storitve.");
  try {
    const ctx = await context(serviceRequestId);
    const { data: quotes, error } = await ctx.db.from("quotes").select("id")
      .eq("organization_id", ctx.access.organizationId).eq("service_request_id", serviceRequestId).limit(1);
    if (error || quotes?.length) return fail("Predračun je že povezan. Za spremembo uporabite popravek.");
    const choices = await quibiDevEstimateChoices(ctx.write);
    if (!choices.saleTypes.some((item) => item.id === saleTypeId) ||
        !choices.units.some((item) => item.id === unitId) ||
        !choices.vatRates.some((item) => item.id === vatId)) return fail("Izbrani šifranti v Quibiju niso več veljavni.");
    const op = await createAndVerifyEstimate({ journal: ctx.journal, read: ctx.read, write: ctx.write,
      input: { serviceRequestId, customerId: ctx.link.external_id,
        vehicleId: ctx.vehicleLink.quibi_vehicle_id, saleTypeId,
        lines: [{ opis: ctx.request.service_wanted.trim(), enota_id: unitId, ddv_id: vatId,
          kolicina: 1, cenaZDDV: price, popust: 0 }],
        note: `TEST-AUTOSERVIS-SELAN ${serviceRequestId}` },
    });
    if (!op.quibiId) return fail("Dokument ni preverljivo ustvarjen.");
    // The existing RPC registers a digest after another Quibi re-read and keeps
    // Tadej's existing review/price approval path. UI labels the API origin.
    const linked = await linkManualQuibiEstimate(serviceRequestId, op.quibiId, true);
    return linked.ok ? { ok: true, detail: `Quibi DEV predračun #${op.quibiId} je ustvarjen in povezan.` }
      : fail(`Dokument #${op.quibiId} obstaja v Quibi DEV, povezava s primerom pa zahteva pregled: ${linked.message}`);
  } catch {
    return fail("Quibi operacija ni potrjena. Pred ponovnim poskusom preverite dnevnik; ne ustvarjajte drugega dokumenta.");
  }
}

export async function updateQuibiDevEstimate(form: FormData): Promise<Result> {
  const serviceRequestId = form.get("serviceRequestId");
  const quoteId = form.get("quoteId");
  const price = validPrice(form.get("unitPrice"));
  if (typeof serviceRequestId !== "string" || typeof quoteId !== "string" || !uuid.test(quoteId) ||
      price == null || form.get("serviceMatchConfirmed") !== "yes")
    return fail("Preverite popravek cene in potrdite ujemanje storitve.");
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
      return fail("Popravek je dovoljen samo za zavrnjeni, preverjeno ustvarjeni Quibi DEV predračun.");
    const base = JSON.parse(created.requestBody) as EstimateBody;
    const first = base.Postavkedokumenta["1"];
    if (!first || !("opis" in first)) return fail("Postavke ni mogoče varno popraviti.");
    const replacement: EstimateBody = { ...base, Postavkedokumenta: {
      "1": { ...first, opis: ctx.request.service_wanted.trim(), cenaZDDV: price },
    } };
    const updated = await updateAndVerifyEstimate({ journal: ctx.journal, read: ctx.read, write: ctx.write,
      serviceRequestId, revisionId: quoteId, customerId: ctx.link.external_id,
      vehicleId: ctx.vehicleLink.quibi_vehicle_id, documentId: created.quibiId,
      externalId: created.externalId, numberingId: String(base.Glavadokumenta.stevilcenje_id),
      expectedContentSha256: quote.content_sha256, replacement });
    if (!updated.quibiId) return fail("Popravek ni preverjen.");
    const linked = await linkManualQuibiEstimate(serviceRequestId, updated.quibiId, true);
    return linked.ok ? { ok: true, detail: `Quibi DEV predračun #${updated.quibiId} je popravljen in čaka na nov Tadejev pregled.` }
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
    assertQuibiDevTestSendAllowed(process.env);
    const ctx = await context(caseId);
    const { data: quote, error } = await ctx.db.from("quotes").select("evidence_payload")
      .eq("organization_id", ctx.access.organizationId).eq("service_request_id", caseId).eq("id", quoteId).maybeSingle();
    const evidence = quote?.evidence_payload as { external_id?: unknown } | null;
    const op = await ctx.journal.get("send", quoteId);
    if (error || !op || op.serviceRequestId !== caseId || typeof evidence?.external_id !== "string")
      throw new Error("QUIBI_SEND_STATUS_UNAVAILABLE");
    const result = await checkTrackedEstimateStatus({ journal: ctx.journal, write: ctx.write,
      operation: op, documentId: evidence.external_id });
    return sendResult(result.sendStatus);
  } catch { return fail("Status ni preverljiv. Brez novega pošiljanja preverite shranjeni send_id in dnevnik."); }
}
