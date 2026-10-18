import {loadCaseWork} from '@/lib/case-work/read';
import {isHostedQuibiEnvironment,hostedQuibiEnvironment,quibiJournalTable} from '@/lib/quibi/deployment-policy';
import {requiresResolvedVehicleConfirmation} from '@/lib/quibi/vehicle-identity';
import {VehicleResolutionPanel} from '@/components/dashboard/VehicleResolutionPanel';
import {intakeSyncConfigurationProblem,INTAKE_ACTOR_ACCESS_PROBLEM} from '@/lib/quibi/intake-sync-configuration';
import {CaseWorkPanel} from '@/components/dashboard/CaseWorkPanel';
import {quibiDevTestRecipients} from '@/lib/quibi/write-contract';
import {syntheticCaseEvidenceAllowed} from '@/lib/quibi/synthetic-case-evidence';
import {loadEstimateCatalog,exactEstimateCatalogMatch,type EstimateCatalogOption} from '@/lib/quibi/estimate-catalog';
import {AutomaticIntakeSync} from '@/components/dashboard/AutomaticIntakeSync';
import {previewDevActivationReadiness} from '@/lib/quibi/hosted-activation-requirements';
import {internalWorkOrdersEnabled} from '@/lib/work-orders/availability';
import {QuibiCaseBusinessOperations,QuibiInspectionInvoicePreparation} from '@/components/dashboard/QuibiCaseBusinessOperations';
import {QuibiCaseDocuments} from '@/components/dashboard/QuibiCaseDocuments';
import {localSyntheticQaAllowed} from "@/lib/appointments/synthetic-qa-policy";
import {ReviewManualEstimate} from "@/components/dashboard/ReviewManualEstimate";
import {estimateLineDescription} from "@/lib/quibi/estimate-line-description";
import {hasRecordedCustomerApproval} from '@/lib/quibi/business-form-state';
import {currentIntakeCompleteness} from '@/lib/intake/completeness';
import {configuredIntakeProvider} from '@/lib/assistance/configured-intake-provider';
import {intakeAiConfiguration} from '@/lib/assistance/openai-intake-provider';
import {analyzeIntake} from '@/lib/assistance/intake-analysis';
import { CreateWorkOrder } from "@/components/dashboard/WorkOrderEditor";
import { localQaIdentityExceptionAvailable } from "@/lib/quibi/local-send-policy";
import Link from "next/link";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";
import { canQueryCustomerId } from "@/lib/customers/present";
import { toPresentationRef } from "@/lib/dashboard/adapt-dashboard";
import { mapDbStatusToUiStatus } from "@/lib/dashboard/db-status";
import { getStatusLabel } from "@/lib/dashboard/statuses";
import { nextCaseStep,quibiBusinessNextAction,type CaseStep } from "@/lib/cases/next-step";
import { intakeFieldLabels } from "@/lib/completion/message";
import { CreateCompletionLinkButton } from "@/components/dashboard/CreateCompletionLinkButton";
import { PrepareOfferButton } from "@/components/dashboard/PrepareOfferButton";
import { LinkManualEstimateForm } from "@/components/dashboard/LinkManualEstimateForm";
import { ManualEstimateHandoff } from "@/components/dashboard/ManualEstimateHandoff";
import { PreliminaryInspection } from "@/components/dashboard/PreliminaryInspection";
import { ManualSlotOffer } from "@/components/dashboard/ManualSlotOffer";
import { PublishedFinalPrice } from "@/components/dashboard/PublishedFinalPrice";
import { ReviewIntakeButton } from "@/components/dashboard/ReviewIntakeButton";
import { CommunicationDraft } from "@/components/dashboard/CommunicationDraft";
import { configuredQuibiReadClient } from "@/lib/quibi/client";
import { verifiedCasePrice } from "@/lib/quibi/price-suggestion";
import { quibiDevEstimateChoices, type QuibiChoice } from "@/lib/quibi/write-options";
import { quibiWorkflowJournal } from "@/lib/quibi/write-journal";
import { QuibiDevWritePanel } from "@/components/dashboard/QuibiDevWritePanel";
import { configuredQuibiWorkflowWriteClient } from "@/lib/quibi/write-client";
import { QuibiEstimateWorkflowPanel } from "@/components/dashboard/QuibiEstimateWorkflowPanel";
import { quibiLinkEnvironment, quibiWorkflowConfig, workflowRecipient } from "@/lib/quibi/workflow-config";
import type { QuibiEstimateDetail } from "@/lib/quibi/contracts";
import { pollQuibiEstimateSend } from "@/lib/quibi/unified-actions";
import type { Operation } from "@/lib/quibi/write-workflow";

export const dynamic = "force-dynamic";
const fixedPriceEnabled = process.env.SELAN_FIXED_PRICE_V1 === "1";

const unavailable = <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">Primera trenutno ni mogoče prikazati.</div>;

export default async function CasePage({ params }: { params: Promise<{ serviceRequestId: string }> }) {
  const access = await requirePhase1OperationalAccess();
  const { serviceRequestId } = await params;
  if (!canQueryCustomerId(serviceRequestId)) return unavailable;

    const db = await createClient();
    const { data: request, error: requestError } = await db.from("service_requests")
      .select("id, customer_id, vehicle_id, status, source, channel, intake_request_id, summary, problem_description, service_wanted, missing_fields, next_action, attention_needed, attention_reason, has_error, error_reason, created_at, updated_at")
      .eq("organization_id", access.organizationId).eq("id", serviceRequestId)
      .is("archived_at", null).maybeSingle();
    if (requestError || !request) return unavailable;

    const [customerResult, vehicleResult, prepResult, linkResult, quoteResult, appointmentResult, approvalResult, inspectionResult, slotOffersResult, fixedPriceResult, vehicleLinkResult] = await Promise.all([
      request.customer_id ? db.from("customers").select("id, display_name, phone, email")
        .eq("organization_id", access.organizationId).eq("id", request.customer_id)
        .is("archived_at", null).maybeSingle() : Promise.resolve({ data: null, error: null }),
      request.vehicle_id ? db.from("vehicles").select("id, make, model, registration_current, vin")
        .eq("organization_id", access.organizationId).eq("id", request.vehicle_id)
        .is("archived_at", null).maybeSingle() : Promise.resolve({ data: null, error: null }),
      db.from("offer_preparations").select("id, status")
        .eq("organization_id", access.organizationId).eq("service_request_id", serviceRequestId).maybeSingle(),
      request.customer_id ? db.from("integration_links").select("external_id, sync_status, last_error_code,quibi_environment")
        .eq("organization_id", access.organizationId).eq("provider", "quibi")
        .eq("entity_type", "customer").eq("entity_id", request.customer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db.from("quotes").select("id, version_no, internal_review_status, evidence_kind, evidence_payload, content_sha256")
        .eq("organization_id", access.organizationId).eq("service_request_id", serviceRequestId)
        .order("version_no", { ascending: false }).limit(1),
      db.from("appointments").select("id, status, appointment_type, starts_at, ends_at")
        .eq("organization_id", access.organizationId).eq("service_request_id", serviceRequestId)
        .order("starts_at", { ascending: true }),
      db.from("customer_approvals").select("quote_id, delivery_status, delivered_at, delivery_channel, delivery_evidence_reference, delivery_proof_kind, customer_decision, decided_at, decision_evidence_reference, content_sha256, revoked_at")
        .eq("organization_id", access.organizationId).eq("service_request_id", serviceRequestId)
        .order("created_at", { ascending: false }).limit(1),
      db.from("preliminary_inspections").select("status, findings, repair_decision")
        .eq("organization_id", access.organizationId).eq("service_request_id", serviceRequestId).maybeSingle(),
      db.from("manual_slot_offers").select("id, appointment_type, status, slot_1, slot_2, slot_3, selected_slot, availability_reference, offer_reference, response_reference, booking_reference")
        .eq("organization_id", access.organizationId).eq("service_request_id", serviceRequestId)
        .neq("status", "cancelled"),
      fixedPriceEnabled ? db.from("published_fixed_price_cases").select("status, service_label, final_price_eur, published_url, communication_reference, decision_reference")
        .eq("organization_id", access.organizationId).eq("service_request_id", serviceRequestId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      request.vehicle_id ? db.from("quibi_vehicle_links")
        .select("quibi_customer_id, quibi_vehicle_id, local_fingerprint, external_fingerprint, sync_status,quibi_environment")
        .eq("organization_id", access.organizationId).eq("vehicle_id", request.vehicle_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if ([customerResult, vehicleResult, prepResult, linkResult, quoteResult, appointmentResult, approvalResult, inspectionResult, slotOffersResult, fixedPriceResult, vehicleLinkResult].some((result) => result.error)) return unavailable;

    let syncConfigurationProblem=intakeSyncConfigurationProblem(process.env);
    if(!syncConfigurationProblem){const actor=await db.from('organization_memberships').select('role,is_active').eq('organization_id',access.organizationId).eq('profile_id',process.env.QUIBI_INTAKE_SYNC_ACTOR_ID!).maybeSingle();if(actor.error||!actor.data?.is_active||!['owner','admin'].includes(actor.data.role))syncConfigurationProblem=INTAKE_ACTOR_ACCESS_PROBLEM;}
    const customer = customerResult.data;
    const vehicle = vehicleResult.data;
    const prep = prepResult.data;
    const link = linkResult.data;
    const quote = quoteResult.data?.[0] ?? null;
    const fixedPrice = fixedPriceResult.data;
    const vehicleLink = vehicleLinkResult.data;
    const vehicleResolution=await db.from('case_vehicle_resolution_events').select('id').eq('organization_id',access.organizationId).eq('case_id',serviceRequestId).limit(1);
    const resolvedVehicleNeedsReview=requiresResolvedVehicleConfirmation(!!vehicleResolution.data?.length,vehicleLink?.sync_status);
    const quoteEvidence = quote?.evidence_payload as { external_id?: unknown } | null;
    const quibiEstimateId = quote?.evidence_kind === "quibi_manual_estimate" &&
      typeof quoteEvidence?.external_id === "string" && /^\d+$/.test(quoteEvidence.external_id)
      ? quoteEvidence.external_id : null;
    const activation=previewDevActivationReadiness(process.env);
    const appointments = appointmentResult.data ?? [];
    const latestApproval = approvalResult.data?.[0] ?? null;
    let approval = latestApproval && latestApproval.quote_id === quote?.id && latestApproval.revoked_at===null && latestApproval.content_sha256===quote?.content_sha256 ? latestApproval : null;
    const diagnosisOffer = slotOffersResult.data?.find((item) => item.appointment_type === "diagnosis") ?? null;
    const serviceOffer = slotOffersResult.data?.find((item) => item.appointment_type === "service") ?? null;
    let writeRequested = false;
    try { quibiWorkflowConfig(process.env, "write"); writeRequested = true; } catch { /* disabled */ }
    const realDevMode = writeRequested && process.env.QUIBI_E2E_WRITE_ENABLED !== "1" && process.env.SELAN_REMOTE_DEMO !== "1" &&
      process.env.NEXT_PUBLIC_SELAN_REMOTE_DEMO !== "1";
    let sendReady=false;try{sendReady=quibiWorkflowConfig(process.env,'send').mode==='production'}catch{}
    let testRecipient: string | null = null;
    let reviewDetail: QuibiEstimateDetail | null = null;
    let writeReady = false;
    let writeChoices: { saleTypes: QuibiChoice[]; units: QuibiChoice[]; vatRates: QuibiChoice[] } | null = null;
    let createdOperation: Operation | null = null;
    let sendOperation: Operation | null = null;
    if (writeRequested && link?.sync_status === "ok" && vehicleLink?.sync_status === "ok" &&
        !fixedPrice) {
      try {
        configuredQuibiWorkflowWriteClient();
        const journal = quibiWorkflowJournal(access.organizationId, access.userId);
        createdOperation = await journal.get("estimate", serviceRequestId);
        if (quote) {
          sendOperation = await journal.get("send", quote.id);
          // Reopening a case reconciles status/evidence without any send operation.
          if (["owner", "admin"].includes(access.role) && sendOperation?.sendId &&
              (sendOperation.sendStatus === "queued" || (process.env.QUIBI_MODE === "production" &&
                sendOperation.sendStatus === "sent" && approval?.delivery_status !== "delivered"))) {
            const statusForm = new FormData(); statusForm.set("serviceRequestId", serviceRequestId); statusForm.set("quoteId", quote.id);
            await pollQuibiEstimateSend(statusForm);
            sendOperation = await journal.get("send", quote.id);
            const [freshApproval, freshCase] = await Promise.all([
              db.from("customer_approvals").select("quote_id, delivery_status, delivered_at, delivery_channel, delivery_evidence_reference, delivery_proof_kind, customer_decision, decided_at, decision_evidence_reference, content_sha256, revoked_at")
                .eq("organization_id", access.organizationId).eq("quote_id", quote.id).is("revoked_at", null).maybeSingle(),
              db.from("service_requests").select("status").eq("organization_id", access.organizationId).eq("id", serviceRequestId).maybeSingle(),
            ]);
            if (!freshApproval.error && freshApproval.data) approval = freshApproval.data;
            if (!freshCase.error && freshCase.data) request.status = freshCase.data.status;
          }
        }
        if (!quote && prep?.status === "ready_for_provider") writeChoices = await quibiDevEstimateChoices();
        writeReady = true;
      } catch { writeReady = false; }
    }
    if (!quote && !fixedPrice && prep?.status === "ready_for_provider" && ["owner","admin"].includes(access.role) && !writeChoices) {
      try {
        const read=configuredQuibiReadClient();
        const [saleTypes,units,vatRates]=await Promise.all([read.catalog('saleTypes'),read.catalog('units'),read.catalog('vat')]);
        writeChoices={saleTypes,units,vatRates};
      } catch { /* fail closed: catalog errors do not enable dispatch */ }
    }
    let estimateCatalog:{options:EstimateCatalogOption[];issues:string[]}={options:[],issues:[]};
    if(!quote&&!fixedPrice&&['owner','admin'].includes(access.role)&&['new','preparing_offer'].includes(request.status)){
      try{estimateCatalog=await loadEstimateCatalog(configuredQuibiReadClient());}
      catch{estimateCatalog.issues=['Quibijevih cenikov ni mogoče prebrati. Podatki niso nadomeščeni z lokalnim cenikom.'];}
    }
    // Journal evidence remains visible with all external writes disabled.
    if (quote && !createdOperation){try{createdOperation=await quibiWorkflowJournal(access.organizationId,access.userId).get("estimate",serviceRequestId)}catch{}}
    if (quote && !sendOperation) {
      try { sendOperation = await quibiWorkflowJournal(access.organizationId, access.userId).get("send", quote.id); }
      catch { /* journal unavailable: sending still remains closed */ }
    }
    let operationRecipient: string | null = null;
    if (sendOperation) { try { operationRecipient = JSON.parse(sendOperation.requestBody).recipient ?? null; } catch { /* immutable journal integrity handled by status action */ } }
    let proposedPrice: ReturnType<typeof verifiedCasePrice> = null;
    let priceReadFailed = false;
    if (quote && link?.sync_status === "ok" && quibiEstimateId && vehicle && vehicleLink) {
      try {
        if (link.quibi_environment !== quibiLinkEnvironment(process.env) || vehicleLink.quibi_environment !== quibiLinkEnvironment(process.env)) throw Error("QUIBI_ENVIRONMENT_MISMATCH");
        const quibi = configuredQuibiReadClient();
        const remoteVehicle = await quibi.vehicle(vehicleLink.quibi_vehicle_id, link.external_id);
        const listed = await quibi.estimates(link.external_id);
        if (listed.some((document) => document.id === quibiEstimateId)) {
          const detail = await quibi.estimateDetail(quibiEstimateId, link.external_id);
          reviewDetail = detail;
          try { const remoteCustomer = await quibi.customer(link.external_id);
            testRecipient = workflowRecipient(process.env, customer?.email ?? null, remoteCustomer.email);
          } catch { /* sending remains closed */ }
          proposedPrice = verifiedCasePrice({ quote, customerId: link.external_id,
            detail,
            localVehicle: { vin: vehicle.vin ?? "", registration: vehicle.registration_current ?? "",
              make: vehicle.make ?? "", model: vehicle.model ?? "" },
            remoteVehicle, vehicleLink });
        }
      } catch { priceReadFailed = true; }
    }
    const internalOrdersEnabled=internalWorkOrdersEnabled(process.env);
    const {data:workOrder}=internalOrdersEnabled?await db.from("work_orders").select("id,status").eq("organization_id",access.organizationId).eq("service_request_id",serviceRequestId).maybeSingle():{data:null};
    let businessNextAction:CaseStep|undefined;
    if(realDevMode&&!internalOrdersEnabled&&['owner','admin'].includes(access.role)){const {data,error}=await db.from(quibiJournalTable(hostedQuibiEnvironment(process.env))).select('kind,state,quibi_id,quibi_content_sha256,request_body,send_status,created_at').eq('organization_id',access.organizationId).eq('service_request_id',serviceRequestId).in('kind',['work_order','invoice','work_order_update','invoice_update','send']);if(!error)businessNextAction=quibiBusinessNextAction(data??[]);}
    const repairWork=(await loadCaseWork(serviceRequestId)).rows[0];
    const step = nextCaseStep({repairNextAction:repairWork?.phase?.step,businessNextAction,quibiCreateRejected:createdOperation?.state==='failed', customerApprovalVerified:!!approval&&!!quote&&hasRecordedCustomerApproval(approval,quote.content_sha256), quibiCreateUncertain:createdOperation?.state==="uncertain"||createdOperation?.state==="dispatching",directQuibiBusiness:!internalOrdersEnabled,status: request.status, workOrderStatus: workOrder?.status, offerPrepared: prep?.status === "ready_for_provider",
      quibiLinked: !!link, quibiSyncStatus: link?.sync_status, quoteReviewStatus: quote?.internal_review_status,
      deliveryStatus: approval?.delivery_status, customerDecision: approval?.customer_decision,
      fixedPriceStatus: fixedPrice?.status,
      inspectionRepairDecision: inspectionResult.data?.repair_decision,
      syntheticAppointment: serviceOffer?.booking_reference?.startsWith("QA-SIM-"), slotOfferStatus: serviceOffer?.status, quibiDevWriteEnabled: writeReady, quibiSendStatus: sendOperation?.sendStatus, quibiSendAttempted: !!sendOperation });
    const missing = currentIntakeCompleteness({phone:customer?.phone??null,email:customer?.email??null,vin:vehicle?.vin??null,make:vehicle?.make??null,model:vehicle?.model??null,registration:vehicle?.registration_current??null},{source:request.source,channel:request.channel,intakeRequestId:request.intake_request_id},Array.isArray(request.missing_fields)?request.missing_fields:[]).missing_fields;
    const aiProvider=configuredIntakeProvider(access.organizationId);
    const aiNotes=aiProvider?await db.from('service_case_notes').select('body').eq('case_id',serviceRequestId).order('created_at',{ascending:false}).limit(20):null;
    // Authenticated RLS supplies only this case's notes. No structured customer IDs,
    // prices, credentials, PDFs or financial documents; free text may contain PII.
    const assistance=await analyzeIntake({summary:[request.summary,request.problem_description].filter(Boolean).join('\n').slice(0,10000),missingFields:missing,serviceWanted:request.service_wanted??undefined,
      estimateContext:{inspectionFindings:inspectionResult.data?.status==='completed'?inspectionResult.data.findings??undefined:undefined,
        mechanicNotes:aiNotes?.error?undefined:aiNotes?.data?.map(n=>n.body),vehicle:vehicle?{make:vehicle.make??'',model:vehicle.model??''}:undefined,
        catalog:estimateCatalog.options.length<=500?estimateCatalog.options.map(o=>({key:o.key,code:o.code,name:o.name,unit:o.unitLabel})):[]}},aiProvider);
    const recipient = customer?.display_name || "stranka";
    const communicationDraft = step.kind === "send_estimate" && fixedPrice?.status === "approved" && !!request.service_wanted &&
        fixedPrice.service_label.trim().replace(/\s+/g, " ").toLocaleLowerCase("sl-SI") === request.service_wanted.trim().replace(/\s+/g, " ").toLocaleLowerCase("sl-SI")
        ? { title: "Odobrena objavljena cena", body: `Pozdravljeni, ${recipient}. Za storitev ${fixedPrice.service_label} je objavljena končna cena ${Number(fixedPrice.final_price_eur).toLocaleString("sl-SI", { style: "currency", currency: "EUR" })}. Vir: ${fixedPrice.published_url}. Prosimo, sporočite, ali storitev naročate. Lep pozdrav, Avtoservis Selan` }
        : step.kind === "send_estimate" && proposedPrice?.state === "approved" && quibiEstimateId
          ? { title: "Odobreni predračun", body: `Pozdravljeni, ${recipient}. Pripravili smo predračun za vaš servisni primer. Odobrena cena predračuna je ${Number(proposedPrice.amount).toLocaleString("sl-SI", { style: "currency", currency: "EUR" })}. Predračun Quibi #${quibiEstimateId} priložite po ročnem preverjanju dokumenta. Prosimo, sporočite svojo odločitev. Lep pozdrav, Avtoservis Selan` }
          : null;

    return <div className="space-y-5">
      {process.env.SELAN_LOCAL_REVIEW === "1" && !realDevMode && <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        Lokalni QA: reference QA-SIM pomenijo simuliran preizkus. Nobeno sporočilo ni dejansko poslano in noben termin ni rezerviran v MyPlanlyju. {process.env.QUIBI_E2E_WRITE_ENABLED === "1" ? "Quibi je lokalna simulacija." : process.env.QUIBI_MODE === "dev" ? "Quibi DEV: podatki so prebrani iz testnega okolja." : "Quibi je lokalna simulacija."}
      </p>}
      <Link href="/dashboard" className="text-sm font-medium text-blue-700">← Nazaj na nadzorno ploščo</Link>
      <header><h1 className="text-2xl font-semibold text-slate-900">Primer #{toPresentationRef(request.id)}</h1>
        <p className="mt-1 text-sm text-slate-600">{request.summary}</p>
        <p className="mt-1 text-xs text-slate-500">Vir: {({ web_form: "splet", phone: "telefon", sms: "sporočilo", manual: "ročni vnos", other: "drugo" } as Record<string, string>)[request.source] ?? "drugo"} · Poslovna faza: {repairWork?.phase?.label??getStatusLabel(mapDbStatusToUiStatus(request.status,workOrder?.status))}</p>{repairWork&&<details className="text-xs text-slate-500"><summary>Ločena izvorna stanja</summary><p>Stanje povpraševanja: {getStatusLabel(mapDbStatusToUiStatus(request.status,workOrder?.status))}. To stanje ne potrjuje trenutne faze popravila, računa, plačila ali prevzema.</p></details>}</header>

      <section id="naslednji-korak" className="scroll-mt-20 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <h2 className="font-semibold text-blue-950">Naslednji korak</h2>
        {process.env.QUIBI_MODE==='dev'&&<details className="mt-3 rounded border bg-white p-3"><summary className="cursor-pointer font-medium">Celoten servisni postopek · kaj opravi Selan in kaj potrdiš ti</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm"><li>Povpraševanje: spletni ali ročni vnos. Selan shrani primer in preveri povezavo stranke ter vozila.</li><li>Predračun: Selan pridobi preverjene Quibijeve postavke in cene. Pregledaš manjkajoče podatke in potrdiš ustvarjanje v Quibiju.</li><li>Pošiljanje predračuna: izbereš dovoljen testni naslov in potrdiš enkratno pošiljanje. Selan shrani referenco ter preverja status.</li><li>Odobritev: zabeležiš dejansko odločitev in njeno referenco, tudi po telefonu. Status pošiljanja ni odobritev.</li><li>Delovni nalog: Selan pripravi podatke iz odobrenega predračuna. Potrdiš ustvarjanje Quibijevega naloga.</li><li>Popravilo: potrdiš, da je opravljeno, in dejanski datum storitve. QA simulacijo vedno označiš posebej.</li><li>Račun: Selan prevzame postavke iz preverjenega naloga. Pregledaš račun in potrdiš ustvarjanje, nato ločeno pošiljanje.</li><li>Prevzem: preveriš dejansko plačilo in prevzem. Status »sent« ne potrjuje prejema, plačila ali zaključka.</li></ol><p className="mt-3 text-sm">{assistance.status==='draft'?'AI je pripravil predlog za pregled.':'AI trenutno ni na voljo; priprava iz Quibija deluje brez njega.'} Termini se urejajo ročno.</p></details>}
        <p className="mt-1 text-sm text-blue-900">{step.label}</p>
        {request.next_action && ["new", "needs_data", "preparing_offer"].includes(request.status) &&
          !inspectionResult.data?.repair_decision &&
          <p className="mt-1 text-xs text-blue-800">Zabeleženo v primeru: {request.next_action}</p>}
      </section>
      {assistance.status==='unavailable' && <div className="text-xs text-slate-500"><p>AI še ni povezan. Preverjanje podatkov in priprava iz Quibija sta na voljo.</p>{['owner','admin'].includes(access.role)&&<details><summary>Podrobnosti povezave AI</summary><p>Manjkajo strežniške nastavitve: {intakeAiConfiguration(process.env).missing.join(', ')}.</p></details>}</div>}
      {assistance.status==='failed'&&<p role="status" className="text-xs text-slate-500">AI analize trenutno ni mogoče pridobiti. Nadaljujte s preverjenimi podatki Quibija.</p>}
      {assistance.status==='draft'&&<><section className="space-y-2 rounded-xl border bg-white p-4"><h2 className="font-semibold">AI analiza za pregled</h2>{assistance.analysis&&<p className="whitespace-pre-wrap text-sm">{assistance.analysis}</p>}{assistance.serviceSuggestions.length>0&&<><p className="text-sm">Predlogi storitev — preverite z dejanskimi artikli v Quibiju:</p><ul className="list-disc pl-5 text-sm">{assistance.serviceSuggestions.map((suggestion,i)=><li key={i}>{suggestion}</li>)}</ul></>}</section><CommunicationDraft key={assistance.draft!} title="AI osnutek za pregled" body={assistance.draft!}/></>}
      {assistance.status!=='draft' && communicationDraft && (!quote || fixedPrice) && <><CommunicationDraft key={communicationDraft.body} title={communicationDraft.title} body={communicationDraft.body} /><p className="text-xs text-amber-800">Quibi API za samostojna sporočila za dopolnitev ali termine ni potrjen. Ta osnutek ni samodejno poslan.</p></>}
      {request.status === "new" && inspectionResult.data?.repair_decision !== "not_ordered" &&
        ["owner", "admin"].includes(access.role) &&
        <ReviewIntakeButton key={request.updated_at} serviceRequestId={serviceRequestId} blockedReason={isHostedQuibiEnvironment(process.env)&&!(link?.sync_status==='ok'&&vehicleLink?.sync_status==='ok')?'Najprej preverite povezavo stranke in pravega vozila v spodnjem razdelku. Če vozila ni, njegovo ustvarjanje potrdi lastnik. Nato sprejmite primer za pripravo ponudbe.':null} />}
      {(request.has_error || request.attention_needed || (link && !["ok", "never_checked"].includes(link.sync_status))) && <section role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <h2 className="font-semibold">Potrebna pozornost</h2>
        {request.has_error && <p>{request.error_reason || "Primer ima zabeleženo napako."}</p>}
        {request.attention_needed && <p>{request.attention_reason?.includes('Samodejna povezava še ni omogočena')?(syncConfigurationProblem??'Prejšnji poskus povezave je bil blokiran. Trenutna konfiguracija je pripravljena; obstoječo povezavo vozila je treba preveriti.'):(request.attention_reason || "Primer potrebuje pregled.")}</p>}
        {link?.sync_status === "error" && <p>Quibi: {link.last_error_code || "QUIBI_READ_FAILED"}. Odprite povezavo in ponovite branje.</p>}
        {["local_changed", "remote_changed", "both_changed"].includes(link?.sync_status ?? "") && <p>Podatki stranke so se spremenili po potrditvi povezave. Preverite oba sistema pred nadaljevanjem.</p>}
      </section>}

      {customer && ['owner','admin'].includes(access.role) && isHostedQuibiEnvironment(process.env) && <AutomaticIntakeSync caseId={serviceRequestId} customerId={link?.sync_status==='ok'?link.external_id:null} vehicleId={vehicleLink?.sync_status==='ok'?vehicleLink.quibi_vehicle_id:null} reason={request.attention_reason??null} configurationProblem={syncConfigurationProblem} identityReviewRequired={resolvedVehicleNeedsReview||!!vehicleLink&&vehicleLink.sync_status!=='ok'} reviewHref={'/dashboard/stranke/'+customer.id+'/quibi'}/>}
      <VehicleResolutionPanel caseId={serviceRequestId}/>
      {customer && link && <QuibiCaseDocuments caseId={serviceRequestId} customerId={customer.id} link={link} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <section id="podatki" className="scroll-mt-20 rounded-xl border bg-white p-4 space-y-2">
          <h2 className="font-semibold">Povpraševanje in podatki</h2>
          {request.problem_description && <p className="text-sm">Težava: {request.problem_description}</p>}
          {request.service_wanted && <p className="text-sm">Želena storitev: {request.service_wanted}</p>}
          {missing.length > 0 && <p className="text-sm text-amber-800">Manjka: {missing.map(field => intakeFieldLabels[field] ?? "dodatni podatek").join(", ")}</p>}
          {request.status === "needs_data" && <CreateCompletionLinkButton serviceRequestId={serviceRequestId} missingFields={missing} contactPolicy={request.source === "manual" && ["manual", "phone", "sms"].includes(request.channel ?? "") ? "manual" : "web"} />}
        </section>
        <section className="rounded-xl border bg-white p-4 space-y-2">
          <h2 className="font-semibold">Stranka in vozilo</h2>
          {customer ? <p className="text-sm"><Link className="font-medium text-blue-700" href={`/dashboard/stranke/${customer.id}`}>{customer.display_name}</Link> · {customer.phone || customer.email || "brez stika"}</p>
            : <p className="text-sm text-amber-800">Stranka še ni povezana s primerom.</p>}
          {vehicle ? <p className="text-sm">{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vozilo"} · {vehicle.registration_current || vehicle.vin || "brez oznake"}</p>
            : <p className="text-sm text-amber-800">Vozilo še ni povezano s primerom.</p>}
        </section>
        <section id="predracun" className="scroll-mt-20 rounded-xl border bg-white p-4 space-y-2">
          <h2 className="font-semibold">{process.env.SELAN_REMOTE_DEMO === "1" ? "Quibi – demo simulacija in predračun" : "Quibi in predračun"}</h2>
          {customer && !fixedPrice && <Link href={`/dashboard/stranke/${customer.id}/quibi`} className="text-sm font-medium text-blue-700">{link ? `Quibi stranka #${link.external_id} · dokumenti in ponovni pregled` : "Poišči in potrdi Quibijevo stranko"} →</Link>}
          {request.status === "new" && !fixedPrice && estimateCatalog.options.length>0 && <p className="text-sm">Iz Quibija so pripravljene postavke iz cenikov ({estimateCatalog.options.length}). Po potrditvi pregleda primera bodo na voljo v pripravi predračuna; stranke in vozila ni treba ponovno vnašati.</p>}
          {request.status === "preparing_offer" && !fixedPrice && step.kind !== "review_quibi_mismatch" && <PrepareOfferButton serviceRequestId={serviceRequestId} alreadyPrepared={prep?.status === "ready_for_provider"} providerReady={writeReady} />}
          {writeRequested && !writeReady && <p role="alert" className="text-sm text-amber-800">Quibi zapisovanje še ni pripravljeno: preverite konfiguracijo in dnevnik operacij. Dokumenta ni mogoče ustvariti.</p>}
          {request.status === "preparing_offer" && !fixedPrice && prep?.status === "ready_for_provider" && link && step.kind !== "review_quibi_mismatch" && !writeReady && !writeRequested &&
            <LinkManualEstimateForm serviceRequestId={serviceRequestId} />}
          {!quote && !fixedPrice && prep?.status === "ready_for_provider" && ["owner", "admin"].includes(access.role) && !(link?.sync_status === "ok" && vehicleLink?.sync_status === "ok") && <p role="status" className="text-sm text-amber-800">Predogled predračuna bo na voljo po potrjeni povezavi stranke in pravega vozila. Najprej preverite podatke v razdelku »Povezava s Quibijem«; podatkov in cen ne vnašajte ponovno.</p>}
          {!quote && !fixedPrice && prep?.status === "ready_for_provider" && link?.sync_status === "ok" && vehicleLink?.sync_status === "ok" && ["owner", "admin"].includes(access.role) &&
            <QuibiDevWritePanel aiEstimateLines={assistance.estimateLines} inspectionFindings={inspectionResult.data?.status === "completed" ? inspectionResult.data.findings : null} serviceRequestId={serviceRequestId} mode={writeReady ? "create" : "prepare"} operationState={createdOperation?.state} lineDescription={estimateLineDescription(request) ?? undefined} choices={writeChoices ?? undefined} catalogOptions={estimateCatalog.options} catalogIssues={estimateCatalog.issues} initialCatalogSource={exactEstimateCatalogMatch(request.service_wanted??'',estimateCatalog.options)??undefined} />}
          {quote ? <p className="text-sm">Zabeležena različica ponudbe #{quote.version_no}: {quote.internal_review_status}. Preverite dejansko dokazilo pred odobritvijo.</p>
            : fixedPrice ? <p className="text-sm">Izbrana je pot z objavljeno končno ceno brez Quibijevega predračuna.</p>
            : <p className="text-sm text-slate-600">Dejanski predračun še ni potrjeno povezan s tem primerom. Cene ni mogoče odobriti ali poslati.</p>}
          {proposedPrice && <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">
            <p className="font-semibold">{proposedPrice.state === "approved" ? "Tadejeva potrjena cena predračuna" : "Predlagana cena iz Quibijevega predračuna"}: {Number(proposedPrice.amount).toLocaleString("sl-SI", { style: "currency", currency: "EUR" })}</p>
            <p>Vir: Quibijev predračun #{proposedPrice.sourceId}, {createdOperation?.quibiId === proposedPrice.sourceId ? "ustvarjen prek Quibi API-ja in potrjeno povezan" : "ročno povezan"} s tem primerom. Stranka in vozilo sta preverjeno povezana; ujemanje storitve potrdi Tadej. Končna cena računa ni potrjena.</p>
          </div>}
          {quote && !proposedPrice && <p role="alert" className="text-sm text-amber-800">{priceReadFailed ? "Predloga cene ni mogoče sveže prebrati iz Quibija." : "Cene ni varno predlagati: preverite povezavo stranke, dokument, vozilo in morebitne spremembe."} Povezava dokumenta s konkretnim vozilom in delovnim nalogom zahteva ročno potrditev.</p>}
          {!quote && link && !fixedPrice && <p className="text-xs text-amber-800">Quibijevi dokumenti stranke so lahko kandidati, vendar API ne potrjuje ujemanja storitve, vozila in delovnega naloga s tem primerom. Cene zato še ni varno samodejno predlagati.</p>}
          {customer && quibiEstimateId && <Link className="text-sm font-medium text-blue-700" href={`/dashboard/stranke/${customer.id}/quibi/predracuni/${quibiEstimateId}`}>
            {process.env.SELAN_REMOTE_DEMO === "1" ? "Odpri demo predračun" : "Podrobnosti predračuna v Selanu"} #{quibiEstimateId} →
          </Link>}
          {customer && quibiEstimateId && <a className="block text-sm font-medium text-blue-700" target="_blank" rel="noreferrer" href={`/api/quibi/dokumenti/${customer.id}/estimate/${quibiEstimateId}/pdf`}>Odpri PDF predračuna iz Quibija</a>}
          {createdOperation?.state === "verified" && createdOperation.quibiId === quibiEstimateId &&
            quote?.internal_review_status === "rejected_for_revision" && ["owner", "admin"].includes(access.role) &&
            <QuibiDevWritePanel serviceRequestId={serviceRequestId} mode="update" quoteId={quote.id} writeEnabled={writeReady} />}
          {quote?.internal_review_status === "unreviewed" && !sendReady && ["owner", "admin"].includes(access.role) && <ReviewManualEstimate key={quote.id} quoteId={quote.id} />}
          {quote && quibiEstimateId && ["owner", "admin"].includes(access.role) &&
            (["unreviewed", "approved_for_send"].includes(quote.internal_review_status) || sendOperation) &&
            <QuibiEstimateWorkflowPanel sendEnabled={sendReady} key={quote.id} serviceRequestId={serviceRequestId} quoteId={quote.id} documentId={quibiEstimateId}
              reviewStatus={quote.internal_review_status} sha256={quote.content_sha256} amount={proposedPrice?.amount}
              allowedRecipients={process.env.QUIBI_MODE==="dev"&&testRecipient?quibiDevTestRecipients(process.env).filter(email=>email!==customer?.email?.toLowerCase()):[]} lines={reviewDetail?.lines ?? []} recipient={operationRecipient ?? testRecipient} dev={process.env.QUIBI_MODE === "dev"}
              operationId={sendOperation?.id} attemptedAt={sendOperation?.attemptedAt}
              operationState={sendOperation?.state} sendId={sendOperation?.sendId} sendStatus={sendOperation?.sendStatus}
              alreadyDelivered={approval?.delivery_status === "delivered"}
              qaIdentityExceptionAvailable={localQaIdentityExceptionAvailable(process.env, serviceRequestId, quote.id, quibiEstimateId, proposedPrice?.amount ?? "")}
              manualIdentityRequired={reviewDetail?.vehicleId !== vehicleLink?.quibi_vehicle_id ||
                reviewDetail?.externalId !== "selan-service-request:" + serviceRequestId} />}
          {internalOrdersEnabled && request.status === "appointment_confirmed" && <CreateWorkOrder caseId={serviceRequestId} />}
          {quote?.internal_review_status === "approved_for_send" && quibiEstimateId && ["owner", "admin"].includes(access.role) &&
            <ManualEstimateHandoff quoteId={quote.id} delivered={approval?.delivery_status === "delivered"} decision={approval?.customer_decision ?? null} syntheticQa={syntheticCaseEvidenceAllowed(process.env,{description:request.problem_description,name:customer?.display_name,email:customer?.email,vin:vehicle?.vin})} realDevWrite={realDevMode} apiDispatch={approval?.delivery_proof_kind === "quibi_mail_server_acceptance"} />}
          {approval?.delivery_status === "delivered" && <p className="text-xs text-slate-600">{!realDevMode && (process.env.SELAN_REMOTE_DEMO === "1" || process.env.SELAN_LOCAL_REVIEW === "1") ? "Demo – ni poslano" : approval.delivery_proof_kind === "quibi_mail_server_acceptance" ? "Quibi API: predano poštnemu strežniku; prejem ni potrjen" : `Ročno poslano prek ${approval.delivery_channel}`}; referenca: {approval.delivery_evidence_reference}. To ni samodejna dostava.</p>}
        </section>
        <details id="potrjeni-termini" className="rounded-xl border bg-white p-4 space-y-2">
          <summary className="cursor-pointer font-semibold">Ročno urejanje terminov (ločeno od poslovnega naloga)</summary>
          {appointments.length === 0 ? <p className="text-sm text-slate-600">Potrjen interni termin še ni zabeležen. Ponujene možnosti so prikazane spodaj.</p> : <ul className="space-y-1 text-sm">{appointments.map((item) =>
            <li key={item.id}>{new Date(item.starts_at).toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana" })} · {item.appointment_type} · interno: {item.status}</li>)}</ul>}
          <p className="text-xs text-amber-800">Termine uredite in preverite ročno. Potrjen termin ni pogoj za pripravo Quibi poslovnega naloga.</p>
        </details>
      </div>
      {!workOrder&&customer&&["owner","admin"].includes(access.role)&&<QuibiCaseBusinessOperations syntheticQa={syntheticCaseEvidenceAllowed(process.env,{description:request.problem_description,name:customer?.display_name,email:customer?.email,vin:vehicle?.vin})} organizationId={access.organizationId} userId={access.userId} caseId={serviceRequestId} customerId={customer.id} status={request.status}/>}
      {activation&&(activation.missing.length>0||!activation.writeEnabled||activation.localOverrideEnabled)&&["owner","admin"].includes(access.role)&&<aside className="space-y-2 rounded border bg-amber-50 p-4 text-sm"><h2 className="font-semibold">Aktivacija poslovnih dejanj DEV</h2>{activation.missing.length>0&&<p>Manjkajo ali niso veljavne nastavitve: {activation.missing.join(", ")}. Skrivnosti ostanejo na strežniku.</p>}{!activation.writeEnabled&&<p>WRITE/SEND sta izključena. Priprava in pregled ne ustvarita dokumenta. Aktivacija zahteva odobreno DEV journal migracijo in dovoljenje za izbrano dejanje.</p>}{activation.localOverrideEnabled&&<p role="alert">Lokalni override ne sme biti omogočen v Preview.</p>}</aside>}
      {workOrder&&<Link className="block rounded-xl border bg-blue-50 p-4 text-blue-800" href={`/dashboard/nalogi/${workOrder.id}`}>Odpri povezani delovni nalog →</Link>}
      {fixedPriceEnabled && (fixedPrice || (!writeRequested && request.status === "preparing_offer" && !quote && !inspectionResult.data)) &&
        <PublishedFinalPrice serviceRequestId={serviceRequestId} path={fixedPrice} canApprove={["owner", "admin"].includes(access.role)} serviceWanted={request.service_wanted} realDevWrite={realDevMode} />}
      <div id="termini" className="scroll-mt-20 space-y-4">
      {!fixedPrice && (inspectionResult.data || ["new", "preparing_offer"].includes(request.status)) &&
        <PreliminaryInspection serviceRequestId={serviceRequestId} caseStatus={request.status}
        status={inspectionResult.data?.status as "requested" | "completed" | undefined ?? null}
        findings={inspectionResult.data?.findings ?? null}
        repairDecision={inspectionResult.data?.repair_decision as "pending" | "ordered" | "not_ordered" | undefined ?? null} realDevWrite={realDevMode} />}
      {inspectionResult.data?.status === "completed" && inspectionResult.data.repair_decision === "not_ordered" && ["owner","admin"].includes(access.role) && <QuibiInspectionInvoicePreparation caseId={serviceRequestId}/>}
      {(inspectionResult.data?.status === "requested" || diagnosisOffer) &&
        <ManualSlotOffer serviceRequestId={serviceRequestId} appointmentType="diagnosis" inactiveReason={inspectionResult.data?.status === "requested" ? undefined : "Predhodni pregled je že opravljen ali ni več naročen. Stare možnosti ne potrjujejo rezervacije; po potrebi umaknite ponudbo."} offer={diagnosisOffer} realDevWrite={realDevMode} />}
      {!repairWork && (request.status === "awaiting_slot_selection" || serviceOffer) &&
        <ManualSlotOffer serviceRequestId={serviceRequestId} appointmentType="service" inactiveReason={request.status === "awaiting_slot_selection" ? undefined : "Stanje primera se je spremenilo. Stare možnosti ne potrjujejo rezervacije; preverite nadaljevanje primera."} syntheticQaAllowed={localSyntheticQaAllowed(process.env)} offer={serviceOffer} realDevWrite={realDevMode} />}
      </div>
    {['owner','admin'].includes(access.role)&&<CaseWorkPanel caseId={serviceRequestId} role={access.role}/>}
</div>;
}
