import {VehicleHistory} from '@/components/customers/VehicleHistory';
import {ClosedCaseSummary} from '@/components/dashboard/ClosedCaseSummary';
import {ApproveCaseEstimate} from '@/components/dashboard/ApproveCaseEstimate';
import {canStartPreliminaryInspection} from '@/lib/cases/workspace';
import {redirect} from 'next/navigation';
import {lookupCaseReference} from '@/lib/cases/reference-lookup';
import {canConfirmQuibiVehicleCreate} from '@/lib/quibi/vehicle-create-permission';
import {automaticDraftPresentation} from '@/lib/quibi/automatic-draft-state';
import {AutomaticPreparationRefresh} from '@/components/dashboard/AutomaticPreparationRefresh';
import {scheduleIntakeSynchronization} from '@/lib/quibi/automatic-intake-sync';
import type {AutomaticEstimateDraft,AutomaticDraftState} from '@/lib/quibi/automatic-estimate-draft';
import {requestedEstimateRows,canonicalEstimateOptions} from '@/lib/quibi/estimate-editor';
import {EstimatePreparationWorkspace} from '@/components/dashboard/EstimatePreparationWorkspace';
import {currentCaseIdentity,visibleIdentityNotice} from '@/lib/cases/identity-notice';
import {CaseOverview} from '@/components/dashboard/CaseOverview';
import {CaseWorkspace} from '@/components/dashboard/CaseWorkspace';
import {caseJourney,type JourneyInput} from '@/lib/cases/journey';
import {CaseJourney} from '@/components/dashboard/CaseJourney';
import {loadCaseWork} from '@/lib/case-work/read';
import {isHostedQuibiEnvironment,hostedQuibiEnvironment,quibiJournalTable} from '@/lib/quibi/deployment-policy';
import {requiresResolvedVehicleConfirmation} from '@/lib/quibi/vehicle-identity';
import {VehicleResolutionPanel} from '@/components/dashboard/VehicleResolutionPanel';
import {savedIntakeCanResumeCreate,intakeSyncConfigurationProblem,INTAKE_ACTOR_ACCESS_PROBLEM} from '@/lib/quibi/intake-sync-configuration';
import {CaseWorkPanel} from '@/components/dashboard/CaseWorkPanel';
import {quibiDevTestRecipients} from '@/lib/quibi/write-contract';
import {syntheticCaseEvidenceAllowed} from '@/lib/quibi/synthetic-case-evidence';
import {loadEstimateCatalog,exactEstimateCatalogMatch,type EstimateCatalogOption} from '@/lib/quibi/estimate-catalog';
import {automaticCustomerMatch} from '@/lib/quibi/automatic-intake-workflow';
import {customerFingerprint} from '@/lib/quibi/contracts';
import {AutomaticIntakeSync} from '@/components/dashboard/AutomaticIntakeSync';
import {internalWorkOrdersEnabled} from '@/lib/work-orders/availability';
import {QuibiCaseBusinessOperations,QuibiInspectionInvoicePreparation} from '@/components/dashboard/QuibiCaseBusinessOperations';
import {QuibiCaseDocuments} from '@/components/dashboard/QuibiCaseDocuments';
import {localSyntheticQaAllowed} from "@/lib/appointments/synthetic-qa-policy";
import {ReviewManualEstimate} from "@/components/dashboard/ReviewManualEstimate";
import {hasRecordedCustomerApproval} from '@/lib/quibi/business-form-state';
import {currentIntakeCompleteness} from '@/lib/intake/completeness';
import {configuredIntakeProvider} from '@/lib/assistance/configured-intake-provider';
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
import { ManualEstimateHandoff } from "@/components/dashboard/ManualEstimateHandoff";
import { PreliminaryInspection } from "@/components/dashboard/PreliminaryInspection";
import { ManualSlotOffer } from "@/components/dashboard/ManualSlotOffer";
import { PublishedFinalPrice } from "@/components/dashboard/PublishedFinalPrice";
import { ReviewIntakeButton } from "@/components/dashboard/ReviewIntakeButton";
import { CommunicationDraft } from "@/components/dashboard/CommunicationDraft";
import { configuredQuibiReadClient } from "@/lib/quibi/client";
import { verifiedCasePrice } from "@/lib/quibi/price-suggestion";
import { quibiDevEstimateChoices, quibiEstimateDefaults, type QuibiChoice } from "@/lib/quibi/write-options";
import { quibiWorkflowJournal } from "@/lib/quibi/write-journal";
import { QuibiDevWritePanel } from "@/components/dashboard/QuibiDevWritePanel";
import { configuredQuibiWorkflowWriteClient } from "@/lib/quibi/write-client";
import { QuibiEstimateWorkflowPanel } from "@/components/dashboard/QuibiEstimateWorkflowPanel";
import { quibiLinkEnvironment, quibiWorkflowConfig, workflowRecipient } from "@/lib/quibi/workflow-config";
import type { QuibiEstimateDetail } from "@/lib/quibi/contracts";
import { pollQuibiEstimateSend } from "@/lib/quibi/unified-actions";
import type { Operation } from "@/lib/quibi/write-workflow";

export const maxDuration=300;
export const dynamic = "force-dynamic";
const fixedPriceEnabled = process.env.SELAN_FIXED_PRICE_V1 === "1";

const unavailable = <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">Primera trenutno ni mogoče prikazati.</div>;

export default async function CasePage({ params }: { params: Promise<{ serviceRequestId: string }> }) {
  const access = await requirePhase1OperationalAccess();
  const { serviceRequestId } = await params;
  if (!canQueryCustomerId(serviceRequestId)) {
    const referenceDb=await createClient();
    const resolved=await lookupCaseReference(referenceDb,access.organizationId,serviceRequestId);
    if(resolved)redirect('/dashboard/primeri/'+resolved);
    return <div role="alert">Kratka oznaka nima enega nedvoumnega dostopnega zadetka. <Link className="text-blue-700 underline" href="/dashboard">Poišči primer na nadzorni plošči</Link>.</div>;
  }

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
      db.from("offer_preparations").select("id, status, auto_state, auto_draft, auto_run, updated_at")
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

    let syncConfigurationProblem=intakeSyncConfigurationProblem(process.env,'read');
    if(!syncConfigurationProblem){const actor=await db.from('organization_memberships').select('role,is_active').eq('organization_id',access.organizationId).eq('profile_id',process.env.QUIBI_INTAKE_SYNC_ACTOR_ID!).maybeSingle();if(actor.error||!actor.data?.is_active||!['owner','admin'].includes(actor.data.role))syncConfigurationProblem=INTAKE_ACTOR_ACCESS_PROBLEM;}
    const customer = customerResult.data;
    const vehicle = vehicleResult.data;
    const prep = prepResult.data;
    const automaticDraft=prep?.auto_draft as AutomaticEstimateDraft|null;
    const automaticState=prep?.auto_state as AutomaticDraftState|null;
    if(!quoteResult.data?.length&&['new','needs_data','preparing_offer'].includes(request.status))scheduleIntakeSynchronization(serviceRequestId);
    const link = linkResult.data;
    const quote = quoteResult.data?.[0] ?? null;
    const fixedPrice = fixedPriceResult.data;
    const vehicleLink = vehicleLinkResult.data;
    const vehicleResolution=await db.from('case_vehicle_resolution_events').select('id,after_state').eq('organization_id',access.organizationId).eq('case_id',serviceRequestId);
    const canonicalCustomerChoice=!!vehicleResolution.data?.some(e=>e.after_state?.remote?.kind==='customer'&&e.after_state?.customerId===request.customer_id&&e.after_state?.vehicleId===request.vehicle_id);
    const resolvedVehicleNeedsReview=requiresResolvedVehicleConfirmation(!!vehicleResolution.data?.some(e=>e.after_state?.remote?.kind!=='customer'),vehicleLink?.sync_status);
    const quoteEvidence = quote?.evidence_payload as { external_id?: unknown } | null;
    const quibiEstimateId = quote?.evidence_kind === "quibi_manual_estimate" &&
      typeof quoteEvidence?.external_id === "string" && /^\d+$/.test(quoteEvidence.external_id)
      ? quoteEvidence.external_id : null;
    const appointments = appointmentResult.data ?? [];
    const latestApproval = approvalResult.data?.[0] ?? null;
    let approval = latestApproval && latestApproval.quote_id === quote?.id && latestApproval.revoked_at===null && latestApproval.content_sha256===quote?.content_sha256 ? latestApproval : null;
    const diagnosisOffer = slotOffersResult.data?.find((item) => item.appointment_type === "diagnosis") ?? null;
    const serviceOffer = slotOffersResult.data?.find((item) => item.appointment_type === "service") ?? null;
    let writeRequested = false;
    try { quibiWorkflowConfig(process.env, "write"); writeRequested = true; } catch { /* disabled */ }
    const realDevMode = writeRequested && process.env.QUIBI_E2E_WRITE_ENABLED !== "1" && process.env.SELAN_REMOTE_DEMO !== "1" &&
      process.env.NEXT_PUBLIC_SELAN_REMOTE_DEMO !== "1";
    let sendReady=false;try{quibiWorkflowConfig(process.env,'send');sendReady=true}catch{}
    let testRecipient: string | null = null;
    let reviewDetail: QuibiEstimateDetail | null = null;
    let writeReady = false;
    let writeChoices: { saleTypes: QuibiChoice[]; units: QuibiChoice[]; vatRates: QuibiChoice[];warehouses?:QuibiChoice[]; defaults?:ReturnType<typeof quibiEstimateDefaults> } | null = null;
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
    if (!quote && !createdOperation?.quibiId && !fixedPrice && ["new","preparing_offer"].includes(request.status) && ["owner","admin"].includes(access.role) && !writeChoices) {
      try {
        const read=configuredQuibiReadClient();
        const [saleTypes,units,vatRates,warehouses]=await Promise.all([read.catalog('saleTypes'),read.catalog('units'),read.catalog('vat'),read.catalog('warehouses')]);
        writeChoices={saleTypes,units,vatRates,warehouses,defaults:quibiEstimateDefaults({saleTypes,units,vatRates,warehouses})};
      } catch { /* fail closed: catalog errors do not enable dispatch */ }
    }
    let customerPriceListId:string|null|undefined;
    let estimateCatalog:{options:EstimateCatalogOption[];issues:string[]}={options:[],issues:[]};
    if(!quote&&!fixedPrice&&['owner','admin'].includes(access.role)&&['new','preparing_offer'].includes(request.status)){
      try{const read=configuredQuibiReadClient();estimateCatalog=await loadEstimateCatalog(read);if(link?.sync_status==='ok'){try{customerPriceListId=(await read.customer(link.external_id)).priceListId;}catch{/* Fresh server review remains authoritative. */}}if(customerPriceListId)estimateCatalog.options.sort((a,b)=>Number(b.priceListId===customerPriceListId)-Number(a.priceListId===customerPriceListId));}
      catch{estimateCatalog.issues=['Quibijevih cenikov ni mogoče prebrati. Podatki niso nadomeščeni z lokalnim cenikom.'];}
    }
    if(automaticDraft){const saved=new Map(automaticDraft.options.map(option=>[option.key,option]));estimateCatalog.options=[...estimateCatalog.options.filter(option=>!saved.has(option.key)),...saved.values()];if(customerPriceListId===undefined)customerPriceListId=automaticDraft.customerPriceListId;}
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
    let businessHasWorkOrder=false,businessHasInvoice=false,businessWorkOrderId:string|undefined;
    if(isHostedQuibiEnvironment(process.env)&&!internalOrdersEnabled&&['owner','admin'].includes(access.role)){const {data,error}=await db.from(quibiJournalTable(hostedQuibiEnvironment(process.env))).select('kind,state,quibi_id,quibi_content_sha256,request_body,send_status,created_at').eq('organization_id',access.organizationId).eq('service_request_id',serviceRequestId).in('kind',['work_order','invoice','work_order_update','invoice_update','send']);if(!error){businessNextAction=quibiBusinessNextAction(data??[]);businessHasInvoice=(data??[]).some(r=>r.kind==='invoice'&&r.state==='verified'&&r.quibi_id);const verifiedOrders=(data??[]).filter(r=>r.kind==='work_order'&&r.state==='verified'&&r.quibi_id);businessHasWorkOrder=verifiedOrders.length===1;businessWorkOrderId=businessHasWorkOrder?verifiedOrders[0].quibi_id??undefined:undefined;}}
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
      estimateContext:{requestedServices:requestedEstimateRows(request.service_wanted,request.problem_description,[]).map(r=>r.requestedService!),inspectionFindings:inspectionResult.data?.status==='completed'?inspectionResult.data.findings??undefined:undefined,
        mechanicNotes:aiNotes?.error?undefined:aiNotes?.data?.map(n=>n.body),vehicle:vehicle?{make:vehicle.make??'',model:vehicle.model??''}:undefined,
        catalog:canonicalEstimateOptions(estimateCatalog.options,customerPriceListId).length<=500?canonicalEstimateOptions(estimateCatalog.options,customerPriceListId).map(o=>({key:o.key,code:o.code,name:o.name,unit:o.unitLabel})):[]}},aiProvider);
    const recipient = customer?.display_name || "stranka";
    const communicationDraft = step.kind === "send_estimate" && fixedPrice?.status === "approved" && !!request.service_wanted &&
        fixedPrice.service_label.trim().replace(/\s+/g, " ").toLocaleLowerCase("sl-SI") === request.service_wanted.trim().replace(/\s+/g, " ").toLocaleLowerCase("sl-SI")
        ? { title: "Odobrena objavljena cena", body: `Pozdravljeni, ${recipient}. Za storitev ${fixedPrice.service_label} je objavljena končna cena ${Number(fixedPrice.final_price_eur).toLocaleString("sl-SI", { style: "currency", currency: "EUR" })}. Vir: ${fixedPrice.published_url}. Prosimo, sporočite, ali storitev naročate. Lep pozdrav, Avtoservis Selan` }
        : step.kind === "send_estimate" && proposedPrice?.state === "approved" && quibiEstimateId
          ? { title: "Odobreni predračun", body: `Pozdravljeni, ${recipient}. Pripravili smo predračun za vaš servisni primer. Odobrena cena predračuna je ${Number(proposedPrice.amount).toLocaleString("sl-SI", { style: "currency", currency: "EUR" })}. Predračun Quibi #${quibiEstimateId} priložite po ročnem preverjanju dokumenta. Prosimo, sporočite svojo odločitev. Lep pozdrav, Avtoservis Selan` }
          : null;

    const identityConfirmed=currentCaseIdentity({environment:isHostedQuibiEnvironment(process.env)?hostedQuibiEnvironment(process.env):null,customerId:link?.external_id??null,vehicleId:vehicleLink?.quibi_vehicle_id??null,customerSyncStatus:link?.sync_status??null,vehicleSyncStatus:vehicleLink?.sync_status??null,customerEnvironment:link?.quibi_environment??null,vehicleEnvironment:vehicleLink?.quibi_environment??null,resolvedVehicleNeedsReview});
    const currentAttention=visibleIdentityNotice(request.attention_reason,identityConfirmed);
    const currentError=visibleIdentityNotice(request.error_reason,identityConfirmed);
    const syntheticQa=syntheticCaseEvidenceAllowed(process.env,{caseId:serviceRequestId,description:request.problem_description,name:customer?.display_name,email:customer?.email,vin:vehicle?.vin});
    let intakeCustomerChoices:import('@/components/dashboard/AutomaticIntakeSync').IntakeCustomerChoice[]=[];
    if(customer&&!link&&['owner','admin'].includes(access.role)&&isHostedQuibiEnvironment(process.env)&&['new','needs_data','preparing_offer'].includes(request.status))try{
      const norm=(s:string)=>s.trim().toLocaleLowerCase('sl-SI'),phone=(s:string)=>s.replace(/[^0-9]/g,'');
      const identityRead=configuredQuibiReadClient();
      const remoteCustomers='customers' in identityRead?await identityRead.customers():[];
      let automaticMatch:string|null=null;try{automaticMatch=automaticCustomerMatch({name:customer.display_name,phone:customer.phone??'',email:customer.email??''},remoteCustomers);}catch{}
      intakeCustomerChoices=(automaticMatch?[]:remoteCustomers).filter(c=>norm(c.name)===norm(customer.display_name)||!!customer.phone&&phone(c.phone)===phone(customer.phone)||!!customer.email&&norm(c.email)===norm(customer.email)).slice(0,8).map(c=>({id:c.id,name:c.name,phone:c.phone,email:c.email,fingerprint:customerFingerprint(c)}));
    }catch{}
    const normalizeContact=(s:string)=>s.trim().toLowerCase(),normalizePhone=(s:string)=>s.replace(/[^0-9]/g,'');
    const allowNewCustomer=!!customer&&!link&&intakeCustomerChoices.length>0&&!!(customer.phone||customer.email)&&intakeCustomerChoices.every(c=>!(customer.phone&&normalizePhone(customer.phone)===normalizePhone(c.phone))&&!(customer.email&&normalizeContact(customer.email)===normalizeContact(c.email)));
    const automaticPartyCreation=(savedIntakeCanResumeCreate(request)||canonicalCustomerChoice)&&!intakeSyncConfigurationProblem(process.env,'write')&&(!automaticState||automaticState==='preparing');
    const newVehicleRequired=!automaticPartyCreation&&!!customer&&link?.sync_status==='ok'&&!vehicleLink&&!quote&&['new','needs_data'].includes(request.status);
    const operatorApprovalReady=quote?.internal_review_status==='unreviewed'&&createdOperation?.state==='verified'&&createdOperation.quibiId===quibiEstimateId&&createdOperation.quibiContentSha256===quote.content_sha256;
    const journeyInput:JourneyInput={operatorApprovalReady,syntheticQa,canCreateVehicle:canConfirmQuibiVehicleCreate(access.role,process.env),newVehicleRequired,automaticDraftState:!quote&&!fixedPrice?automaticState:undefined,automaticPreparation:!quote&&!fixedPrice&&['new','preparing_offer','needs_data'].includes(request.status),status:request.status,role:access.role,stepKind:step.kind,
        intakeComplete:missing.length===0&&!!customer&&!!vehicle,identityReady:link?.sync_status==='ok'&&vehicleLink?.sync_status==='ok'&&!resolvedVehicleNeedsReview&&(!isHostedQuibiEnvironment(process.env)||(link.quibi_environment===hostedQuibiEnvironment(process.env)&&vehicleLink.quibi_environment===hostedQuibiEnvironment(process.env))),
        hosted:isHostedQuibiEnvironment(process.env),offerPrepared:prep?.status==='ready_for_provider',quoteReviewed:quote?.internal_review_status==='approved_for_send',
        customerApproved:!!approval&&!!quote&&hasRecordedCustomerApproval(approval,quote.content_sha256),dispatched:approval?.delivery_status==='delivered'||sendOperation?.sendStatus==='sent',
        hasWorkOrder:!!workOrder||!!repairWork||businessHasWorkOrder,hasAssignedWork:!!workOrder||!!repairWork,repairPhase:repairWork?.phase?.id,hasInvoice:!!repairWork?.invoice,internalOrdersEnabled,inspectionPending:inspectionResult.data?.status==='requested',fixedPriceStatus:fixedPrice?.status,workOrderHref:workOrder?'/dashboard/nalogi/'+workOrder.id:undefined,writeReady,devNoEmail:quibiLinkEnvironment(process.env)==="dev",sendReady:sendReady&&!!testRecipient&&!!proposedPrice&&!!quibiEstimateId&&!!reviewDetail?.lines.length,sendAttempted:!!sendOperation,sendState:sendOperation?.sendStatus,
      };
    const caseStatus=repairWork?.phase?.label??(intakeCustomerChoices.length?'Izberi pravo stranko':null)??(businessHasWorkOrder&&!businessHasInvoice&&!['closed','declined','cancelled'].includes(request.status)?'Delovni nalog pripravljen – dodeli mehaniku':newVehicleRequired?'Novo vozilo – potrebna potrditev':journeyInput.customerApproved?'Priprava delovnega naloga':operatorApprovalReady||quote?.internal_review_status==='approved_for_send'||!quote&&!!createdOperation?.quibiId?'Čaka odobritev stranke':quote?'Predračun čaka pregled':!fixedPrice&&automaticState?automaticDraftPresentation(automaticState).label:getStatusLabel(mapDbStatusToUiStatus(request.status,workOrder?.status)));
    const casePrepared=repairWork?'Delovni nalog #'+repairWork.quibiId:businessWorkOrderId?'Delovni nalog #'+businessWorkOrderId:quibiEstimateId?'Predračun #'+quibiEstimateId:createdOperation?.quibiId?'Predračun #'+createdOperation.quibiId:newVehicleRequired?'Stranka je povezana. Podatki vozila so shranjeni.':automaticDraft?'Postavke so pripravljene za pregled.':'Podatki povpraševanja so shranjeni.';
    const workspaceSections=[
      {id:"podatki",title:"Povpraševanje, stranka in vozilo",content:(<>
      <div className="grid gap-4 lg:grid-cols-2">
        <section tabIndex={-1} id="podatki" className="scroll-mt-20 rounded-xl border bg-white p-4 space-y-2">
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
      {request.status === "new" && !automaticDraft && identityConfirmed && inspectionResult.data?.repair_decision !== "not_ordered" &&
        ["owner", "admin"].includes(access.role) &&
        <ReviewIntakeButton key={request.updated_at} serviceRequestId={serviceRequestId} blockedReason={isHostedQuibiEnvironment(process.env)&&!(link?.sync_status==='ok'&&vehicleLink?.sync_status==='ok')?'Najprej preverite povezavo stranke in pravega vozila v razdelku »Povezava s Quibijem«. Če vozila ni, njegovo ustvarjanje potrdi lastnik. Nato sprejmite primer za pripravo ponudbe.':null} />}
        </section>
      </div>

      </>)},
      {id:"quibi-povezava",title:"Povezava s Quibijem",content:(<>
      <div id="quibi-povezava" tabIndex={-1} className="scroll-mt-20 space-y-3">
      {customer && ['owner','admin'].includes(access.role) && isHostedQuibiEnvironment(process.env) && <AutomaticIntakeSync allowNewCustomer={allowNewCustomer} choices={intakeCustomerChoices} identityConfirmed={identityConfirmed} caseId={serviceRequestId} customerId={link?.sync_status==='ok'?link.external_id:null} vehicleId={vehicleLink?.sync_status==='ok'?vehicleLink.quibi_vehicle_id:null} reason={request.attention_reason??null} configurationProblem={syncConfigurationProblem} identityReviewRequired={resolvedVehicleNeedsReview||!!vehicleLink&&vehicleLink.sync_status!=='ok'} reviewHref={'/dashboard/stranke/'+customer.id+'/quibi'}/>}
      {!automaticPartyCreation&&<VehicleResolutionPanel identityConfirmed={identityConfirmed} focused={newVehicleRequired} caseId={serviceRequestId}/>}
      </div>

      </>)},
      {id:"predracun",title:"Priprava predračuna",content:(<>
        <section tabIndex={-1} id="predracun" className="scroll-mt-20 rounded-xl border bg-white p-4 space-y-2">
          <h2 className="font-semibold">Predračun</h2>
          {customer && !fixedPrice && <details className="text-sm"><summary>Podrobnosti povezave</summary><Link href={`/dashboard/stranke/${customer.id}/quibi`} className="text-sm font-medium text-blue-700">{link ? `Quibi stranka #${link.external_id} · dokumenti in ponovni pregled` : "Poišči in potrdi Quibijevo stranko"} →</Link></details>}
          {!createdOperation?.quibiId && !quote && !fixedPrice && !automaticDraft && (!automaticState||automaticState==='preparing') && <p role="status" className="text-sm">Selan pripravlja predračun. Podatkov ni treba ponovno vnašati.</p>}
          {!quote&&createdOperation?.state==='uncertain'&&createdOperation.quibiId&&['owner','admin'].includes(access.role)&&<ApproveCaseEstimate documentId={createdOperation.quibiId} caseId={serviceRequestId} syntheticQa={syntheticQa}/>}
          {!createdOperation?.quibiId && writeRequested && !writeReady && <p role="alert" className="text-sm text-amber-800">Quibi zapisovanje še ni pripravljeno: preverite konfiguracijo in dnevnik operacij. Dokumenta ni mogoče ustvariti.</p>}
          {!quote && !fixedPrice && prep?.status === "ready_for_provider" && ["owner", "admin"].includes(access.role) && !(link?.sync_status === "ok" && vehicleLink?.sync_status === "ok") && <p role="status" className="text-sm text-amber-800">Predogled predračuna bo na voljo po potrjeni povezavi stranke in pravega vozila. Najprej preverite podatke v razdelku »Povezava s Quibijem«; podatkov in cen ne vnašajte ponovno.</p>}
          {!quote && !createdOperation?.quibiId && !fixedPrice && ["new","preparing_offer"].includes(request.status) && (!!automaticDraft||!isHostedQuibiEnvironment(process.env)) && link?.sync_status === "ok" && vehicleLink?.sync_status === "ok" && ["owner", "admin"].includes(access.role) &&
            <EstimatePreparationWorkspace historySuggestions={automaticDraft?.historySuggestions} historyIssues={automaticDraft?.historyIssues} draftPersistence={prep?.auto_run&&automaticDraft?{run:prep.auto_run,updatedAt:prep.updated_at}:undefined} key={prep?.auto_run??serviceRequestId} initialRows={automaticDraft?.rows} intakeReviewRequired={request.status==='new'} aiServiceMatches={assistance.serviceMatches} requestedService={request.service_wanted} requestDescription={request.problem_description} offerPrepared={prep?.status === "ready_for_provider"} customerPriceListId={customerPriceListId} aiEstimateLines={assistance.estimateLines} inspectionFindings={inspectionResult.data?.status === "completed" ? inspectionResult.data.findings : null} serviceRequestId={serviceRequestId} mode={writeReady ? "create" : "prepare"} operationState={createdOperation?.state} choices={writeChoices ?? undefined} catalogOptions={estimateCatalog.options} catalogIssues={estimateCatalog.issues} initialCatalogSource={exactEstimateCatalogMatch(request.service_wanted??'',estimateCatalog.options)??undefined} />}
          {quote ? <p className="text-sm">Zabeležena različica ponudbe #{quote.version_no}: {quote.internal_review_status}. Preverite dejansko dokazilo pred odobritvijo.</p>
            : createdOperation?.quibiId ? <p className="text-sm">Predračun #{createdOperation.quibiId} je že ustvarjen. Uporabite naslednje dejanje zgoraj; novega dokumenta ne ustvarjajte.</p> : fixedPrice ? <p className="text-sm">Izbrana je pot z objavljeno končno ceno brez Quibijevega predračuna.</p>
            : <p className="text-sm text-slate-600">Primer še nima ustvarjenega predračuna. Pregled zgoraj še ne ustvari dokumenta in ga ne pošlje stranki.</p>}
        </section>

      </>)},
      {id:"pregled-predracuna",title:"Pregled in pošiljanje predračuna",content:(<>
<section className="rounded-xl border bg-white p-4 space-y-3"><h2 className="font-semibold">Pregled in pošiljanje predračuna</h2>
          <div id="pregled-predracuna" tabIndex={-1} className="scroll-mt-20 space-y-3">
          {proposedPrice && <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">
            <p className="font-semibold">{proposedPrice.state === "approved" ? "Tadejeva potrjena cena predračuna" : "Predlagana cena iz Quibijevega predračuna"}: {Number(proposedPrice.amount).toLocaleString("sl-SI", { style: "currency", currency: "EUR" })}</p>
            <p>Vir: Quibijev predračun #{proposedPrice.sourceId}, {createdOperation?.quibiId === proposedPrice.sourceId ? "ustvarjen v Quibiju in povezan" : "ročno povezan"} s tem primerom. Stranka in vozilo sta preverjeno povezana; ujemanje storitve potrdi Tadej. Končna cena računa ni potrjena.</p>
          </div>}
          {quote && !proposedPrice && <p role="alert" className="text-sm text-amber-800">{priceReadFailed ? "Predloga cene ni mogoče sveže prebrati iz Quibija." : "Cene ni varno predlagati: preverite povezavo stranke, dokument, vozilo in morebitne spremembe."} Povezava dokumenta s konkretnim vozilom in delovnim nalogom zahteva ročno potrditev.</p>}
          {!quote && link && !fixedPrice && <p className="text-xs text-amber-800">Ujemanje storitve in vozila z dokumenti še ni potrjeno. Pred uporabo preverite ustrezno storitev in ceno.</p>}
          {customer && quibiEstimateId && <Link className="text-sm font-medium text-blue-700" href={`/dashboard/stranke/${customer.id}/quibi/predracuni/${quibiEstimateId}`}>
            {process.env.SELAN_REMOTE_DEMO === "1" ? "Odpri predračun" : "Podrobnosti predračuna v Selanu"} #{quibiEstimateId} →
          </Link>}
          {customer && quibiEstimateId && <a className="block text-sm font-medium text-blue-700" target="_blank" rel="noreferrer" href={`/api/quibi/dokumenti/${customer.id}/estimate/${quibiEstimateId}/pdf`}>Odpri PDF predračuna iz Quibija</a>}
          {createdOperation?.state === "verified" && createdOperation.quibiId === quibiEstimateId &&
            quote?.internal_review_status === "rejected_for_revision" && ["owner", "admin"].includes(access.role) &&
            <QuibiDevWritePanel serviceRequestId={serviceRequestId} mode="update" quoteId={quote.id} writeEnabled={writeReady} />}
          {quote?.internal_review_status === "unreviewed" && !operatorApprovalReady && ["owner", "admin"].includes(access.role) && <ReviewManualEstimate key={quote.id} quoteId={quote.id} />}
          {quote && quibiEstimateId && ["owner", "admin"].includes(access.role) &&
            (["unreviewed", "approved_for_send"].includes(quote.internal_review_status) || sendOperation) &&
            <QuibiEstimateWorkflowPanel sendEnabled={sendReady} key={quote.id} serviceRequestId={serviceRequestId} quoteId={quote.id} documentId={quibiEstimateId}
              reviewStatus={quote.internal_review_status} sha256={quote.content_sha256} amount={proposedPrice?.amount}
              allowedRecipients={process.env.QUIBI_MODE==="dev"&&testRecipient?quibiDevTestRecipients(process.env).filter(email=>email!==customer?.email?.toLowerCase()):[]} taxTotals={reviewDetail?.taxTotals} lines={reviewDetail?.lines ?? []} recipient={operationRecipient ?? testRecipient} dev={process.env.QUIBI_MODE === "dev"}
              operationId={sendOperation?.id} attemptedAt={sendOperation?.attemptedAt}
              operationState={sendOperation?.state} sendId={sendOperation?.sendId} sendStatus={sendOperation?.sendStatus}
              alreadyDelivered={approval?.delivery_status === "delivered"}
              qaIdentityExceptionAvailable={localQaIdentityExceptionAvailable(process.env, serviceRequestId, quote.id, quibiEstimateId, proposedPrice?.amount ?? "")}
              manualIdentityRequired={reviewDetail?.vehicleId !== vehicleLink?.quibi_vehicle_id ||
                reviewDetail?.externalId !== "selan-service-request:" + serviceRequestId} />}

          </div>
{!quote&&<p className="text-sm text-slate-600">Najprej pripravite predračun in preverite povezani dokument. Predogled še ni ustvarjen dokument.</p>}</section>
      </>)},
      {id:"odobritev",title:"Odločitev stranke",content:(<>
<section className="rounded-xl border bg-white p-4 space-y-3"><h2 className="font-semibold">Odobritev popravila</h2>
          <div id="odobritev" tabIndex={-1} className="scroll-mt-20">
          {operatorApprovalReady&&createdOperation?.quibiId&&['owner','admin'].includes(access.role)&&<ApproveCaseEstimate caseId={serviceRequestId} documentId={createdOperation.quibiId} backgroundRead={false} syntheticQa={syntheticQa}/>}
          {quote?.internal_review_status === "approved_for_send" && quibiEstimateId && ["owner", "admin"].includes(access.role) &&
            <ManualEstimateHandoff quoteId={quote.id} delivered={approval?.delivery_status === "delivered"} decision={approval?.customer_decision ?? null} syntheticQa={syntheticQa} realDevWrite={realDevMode} apiDispatch={approval?.delivery_proof_kind === "quibi_mail_server_acceptance"} />}
          {approval?.delivery_status === "delivered" && <p className="text-xs text-slate-600">{!realDevMode && (process.env.SELAN_REMOTE_DEMO === "1" || process.env.SELAN_LOCAL_REVIEW === "1") ? "Ni poslano" : approval.delivery_proof_kind === "quibi_mail_server_acceptance" ? "Predano poštnemu strežniku; prejem ni potrjen" : `Ročno poslano prek ${approval.delivery_channel}`}; referenca: {approval.delivery_evidence_reference}. To ni samodejna dostava.</p>}
          </div>{quote?.internal_review_status!=="approved_for_send"&&<p className="text-sm text-slate-600">Najprej interno preglejte in odobrite predračun. Šele nato zabeležite dejanski odgovor stranke za isto različico.</p>}</section>
      </>)},
      {id:"poslovni-nalog",title:"Delovni nalog",content:(<>
      <div id="poslovni-nalog" tabIndex={-1} className="scroll-mt-20">
          {internalOrdersEnabled && request.status === "appointment_confirmed" && <CreateWorkOrder caseId={serviceRequestId} />}
      {!workOrder&&customer&&["owner","admin"].includes(access.role)&&<QuibiCaseBusinessOperations repairReviewed={['invoice_review','handover','closed'].includes(repairWork?.phase?.id??'')} syntheticQa={syntheticQa} organizationId={access.organizationId} userId={access.userId} caseId={serviceRequestId} customerId={customer.id} status={request.status}/>}
      </div>

      </>)},
      {id:"popravilo",title:"Popravilo in zaključek",content:(<>
    <div id="popravilo" tabIndex={-1} className="scroll-mt-20">{['owner','admin'].includes(access.role)&&<CaseWorkPanel compactContext caseId={serviceRequestId} role={access.role}/>}</div>

      </>)},
      {id:"objavljena-cena",title:"Objavljena končna cena",content:(<>
      <div id="objavljena-cena" tabIndex={-1} className="scroll-mt-20">
      {fixedPriceEnabled && (fixedPrice || (!writeRequested && request.status === "preparing_offer" && !quote && !inspectionResult.data)) &&
        <PublishedFinalPrice serviceRequestId={serviceRequestId} path={fixedPrice} canApprove={["owner", "admin"].includes(access.role)} serviceWanted={request.service_wanted} realDevWrite={realDevMode} />}
      </div>

      </>)},
      {id:"termini",title:"Pregled in ročno urejanje terminov",content:(<>
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
        <details id="potrjeni-termini" className="rounded-xl border bg-white p-4 space-y-2">
          <summary className="cursor-pointer font-semibold">Ročno urejanje terminov (ločeno od poslovnega naloga)</summary>
          {appointments.length === 0 ? <p className="text-sm text-slate-600">Potrjen interni termin še ni zabeležen. Ponujene možnosti so prikazane spodaj.</p> : <ul className="space-y-1 text-sm">{appointments.map((item) =>
            <li key={item.id}>{new Date(item.starts_at).toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana" })} · {item.appointment_type} · interno: {item.status}</li>)}</ul>}
          <p className="text-xs text-amber-800">Termine uredite in preverite ročno. Potrjen termin ni pogoj za pripravo Quibi poslovnega naloga.</p>
        </details>
      </>)}
    ];

    const caseClosed=repairWork?.phase?.id==='closed';
    return <div className={`mx-auto max-w-5xl space-y-5 ${syntheticQa||repairWork?.review?.simulated?'test-case-context':''}`}>
      {process.env.SELAN_LOCAL_REVIEW === "1" && !realDevMode && <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        <details><summary>Podrobnosti povezave</summary>Lokalni QA: reference QA-SIM pomenijo simuliran preizkus. Nobeno sporočilo ni dejansko poslano in noben termin ni rezerviran v MyPlanlyju. {process.env.QUIBI_E2E_WRITE_ENABLED === "1" ? "Quibi je lokalna simulacija." : process.env.QUIBI_MODE === "dev" ? "Quibi DEV: podatki so prebrani iz testnega okolja." : "Quibi je lokalna simulacija."}</details>
      </div>}
      <Link href="/dashboard" className="text-sm font-medium text-blue-700">← Nazaj na nadzorno ploščo</Link>
      <header><h1 className="text-2xl font-semibold text-slate-900">{caseClosed?'Zaključeno':'Primer #'+toPresentationRef(request.id)}</h1>{(syntheticQa||repairWork?.review?.simulated)&&<span data-test-case-badge className="inline-block rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">Testni primer</span>}

        {!caseClosed&&<p className="mt-1 text-xs text-slate-500">Vir: {({ web_form: "splet", phone: "telefon", sms: "sporočilo", manual: "ročni vnos", other: "drugo" } as Record<string, string>)[request.source] ?? "drugo"} · Poslovna faza: {repairWork?.phase?.label??getStatusLabel(mapDbStatusToUiStatus(request.status,workOrder?.status))}</p>}</header>

      {caseClosed&&repairWork&&<ClosedCaseSummary work={repairWork} customer={customer?.display_name||"Stranka"}/>}
      {!caseClosed&&<CaseOverview mechanicName={repairWork?.mechanicName} mechanicEmail={repairWork?.mechanicEmail} status={caseStatus} prepared={casePrepared} customer={customer?.display_name || "Stranka še ni povezana"} vehicle={vehicle ? [vehicle.make,vehicle.model,vehicle.registration_current || vehicle.vin].filter(Boolean).join(" · ") || "Vozilo brez oznake" : "Vozilo še ni povezano"} request={[request.problem_description,request.service_wanted].filter(Boolean).join("\n") || request.summary || "Opis še ni vnesen"} missing={[...(!customer?["povezava stranke"]:[]),...(!vehicle?["povezava vozila"]:[]),...missing.map(field=>intakeFieldLabels[field]??"dodatni podatek")]}/> }
      {!caseClosed&&<><AutomaticPreparationRefresh active={!createdOperation?.quibiId&&!quote&&!fixedPrice&&(!identityConfirmed||!automaticState||automaticState==='preparing'||identityConfirmed&&!automaticDraft||newVehicleRequired&&automaticState==='failed')}/><CaseJourney inlineAction={!quote&&createdOperation?.state==='uncertain'&&!!createdOperation.quibiId} explanation={step.label} input={journeyInput}/></>}
      <CaseWorkspace collapsed={caseClosed} activeHref={caseJourney(journeyInput).action.href} progressKey={JSON.stringify([request.id,caseJourney(journeyInput).action,prep?.status,quote?.id,quote?.internal_review_status,approval?.customer_decision,sendOperation?.sendStatus,journeyInput.repairPhase])} sections={workspaceSections.filter(section=>section.id===caseJourney(journeyInput).action.href.slice(1)||!(['termini','poslovni-nalog','popravilo','pregled-predracuna','odobritev','objavljena-cena'].includes(section.id))||section.id==='termini'&&!!(canStartPreliminaryInspection({status:request.status,hasQuote:!!quote,hasFixedPrice:!!fixedPrice,hasWorkOrder:!!(workOrder||businessHasWorkOrder||repairWork)})||inspectionResult.data||diagnosisOffer||serviceOffer||appointments.length||['ambiguous','missing_price'].includes(automaticState??''))||section.id==='poslovni-nalog'&&!!(journeyInput.customerApproved||businessHasWorkOrder||workOrder)||section.id==='popravilo'&&!!(workOrder||businessHasWorkOrder||repairWork)||['pregled-predracuna','odobritev'].includes(section.id)&&!!quote||section.id==='objavljena-cena'&&!!(fixedPrice||fixedPriceEnabled&&!writeRequested&&request.status==='preparing_offer'&&!quote&&!inspectionResult.data))} details={<>{repairWork&&<details className="text-xs text-slate-500"><summary>Ločena izvorna stanja</summary><p>Stanje povpraševanja: {getStatusLabel(mapDbStatusToUiStatus(request.status,workOrder?.status))}. To stanje ne potrjuje trenutne faze popravila, računa, plačila ali prevzema.</p></details>}
      {((request.has_error&&(!request.error_reason||currentError)) || (request.attention_needed&&(!request.attention_reason||currentAttention)) || (link && !["ok", "never_checked"].includes(link.sync_status))) && <section role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <h2 className="font-semibold">Potrebna pozornost</h2>
        {request.has_error && (!request.error_reason||currentError) && <p>{currentError || "Primer ima zabeleženo napako."}</p>}
        {request.attention_needed && (!request.attention_reason||currentAttention) && <p>{currentAttention?.includes('Samodejna povezava še ni omogočena')?(syncConfigurationProblem??'Prejšnji poskus povezave je bil blokiran. Trenutna konfiguracija je pripravljena; obstoječo povezavo vozila je treba preveriti.'):(currentAttention || "Primer potrebuje pregled.")}</p>}
        {link?.sync_status === "error" && <p>Quibi: {link.last_error_code || "QUIBI_READ_FAILED"}. Odprite povezavo in ponovite branje.</p>}
        {["local_changed", "remote_changed", "both_changed"].includes(link?.sync_status ?? "") && <p>Podatki stranke so se spremenili po potrditvi povezave. Preverite oba sistema pred nadaljevanjem.</p>}
      </section>}


      {(assistance.status==='draft'||!!communicationDraft&&(!quote||!!fixedPrice))&&<details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-medium">Pomoč AI in osnutki sporočil</summary>
      {assistance.status==='failed'&&<p role="status" className="text-xs text-slate-500">AI analize trenutno ni mogoče pridobiti. Nadaljujte s preverjenimi podatki Quibija.</p>}
      {assistance.status==='draft'&&<><section className="space-y-2 rounded-xl border bg-white p-4"><h2 className="font-semibold">AI analiza za pregled</h2>{assistance.analysis&&<p className="whitespace-pre-wrap text-sm">{assistance.analysis}</p>}{assistance.serviceSuggestions.length>0&&<><p className="text-sm">Predlogi storitev — preverite z dejanskimi artikli v Quibiju:</p><ul className="list-disc pl-5 text-sm">{assistance.serviceSuggestions.map((suggestion,i)=><li key={i}>{suggestion}</li>)}</ul></>}</section><CommunicationDraft key={assistance.draft!} title="AI osnutek za pregled" body={assistance.draft!}/></>}
      {assistance.status!=='draft' && communicationDraft && (!quote || fixedPrice) && <><CommunicationDraft key={communicationDraft.body} title={communicationDraft.title} body={communicationDraft.body} /><p className="text-xs text-amber-800">Quibi API za samostojna sporočila za dopolnitev ali termine ni potrjen. Ta osnutek ni samodejno poslan.</p></>}
      </details>}
      {identityConfirmed&&customer&&<Link className="block text-sm text-blue-700" href={`/dashboard/stranke/${customer.id}/quibi`}>Preglej povezavo stranke in vozila</Link>}
      {customer && link && <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-medium">Povezani dokumenti in zgodovina Quibija</summary><QuibiCaseDocuments caseId={serviceRequestId} customerId={customer.id} link={link} /></details>}
      </>}/>
      <VehicleHistory scope={{caseId:serviceRequestId}}/>
      {!caseClosed&&workOrder&&<Link className="block rounded-xl border bg-blue-50 p-4 text-blue-800" href={`/dashboard/nalogi/${workOrder.id}`}>Odpri povezani delovni nalog →</Link>}
</div>;
}
