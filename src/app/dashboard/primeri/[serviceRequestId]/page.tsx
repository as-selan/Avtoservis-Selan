import Link from "next/link";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";
import { canQueryCustomerId } from "@/lib/customers/present";
import { toPresentationRef } from "@/lib/dashboard/adapt-dashboard";
import { nextCaseStep } from "@/lib/cases/next-step";
import { CreateCompletionLinkButton } from "@/components/dashboard/CreateCompletionLinkButton";
import { PrepareOfferButton } from "@/components/dashboard/PrepareOfferButton";
import { LinkManualEstimateForm } from "@/components/dashboard/LinkManualEstimateForm";
import { ReviewManualEstimate } from "@/components/dashboard/ReviewManualEstimate";
import { ManualEstimateHandoff } from "@/components/dashboard/ManualEstimateHandoff";
import { PreliminaryInspection } from "@/components/dashboard/PreliminaryInspection";
import { ManualSlotOffer } from "@/components/dashboard/ManualSlotOffer";
import { PublishedFinalPrice } from "@/components/dashboard/PublishedFinalPrice";
import { ReviewIntakeButton } from "@/components/dashboard/ReviewIntakeButton";
import { CommunicationDraft } from "@/components/dashboard/CommunicationDraft";
import { configuredQuibiReadClient } from "@/lib/quibi/client";
import { verifiedCasePrice } from "@/lib/quibi/price-suggestion";

export const dynamic = "force-dynamic";
const fixedPriceEnabled = process.env.SELAN_FIXED_PRICE_V1 === "1";

const unavailable = <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">Primera trenutno ni mogoče prikazati.</div>;

export default async function CasePage({ params }: { params: Promise<{ serviceRequestId: string }> }) {
  const access = await requirePhase1OperationalAccess();
  const { serviceRequestId } = await params;
  if (!canQueryCustomerId(serviceRequestId)) return unavailable;

    const db = await createClient();
    const { data: request, error: requestError } = await db.from("service_requests")
      .select("id, customer_id, vehicle_id, status, source, summary, problem_description, service_wanted, missing_fields, next_action, attention_needed, attention_reason, has_error, error_reason, created_at, updated_at")
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
      request.customer_id ? db.from("integration_links").select("external_id, sync_status, last_error_code")
        .eq("organization_id", access.organizationId).eq("provider", "quibi")
        .eq("entity_type", "customer").eq("entity_id", request.customer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db.from("quotes").select("id, version_no, internal_review_status, evidence_kind, evidence_payload, content_sha256")
        .eq("organization_id", access.organizationId).eq("service_request_id", serviceRequestId)
        .order("version_no", { ascending: false }).limit(1),
      db.from("appointments").select("id, status, appointment_type, starts_at, ends_at")
        .eq("organization_id", access.organizationId).eq("service_request_id", serviceRequestId)
        .order("starts_at", { ascending: true }),
      db.from("customer_approvals").select("quote_id, delivery_status, delivered_at, delivery_channel, delivery_evidence_reference, customer_decision, decided_at, decision_evidence_reference")
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
        .select("quibi_customer_id, quibi_vehicle_id, local_fingerprint, external_fingerprint, sync_status")
        .eq("organization_id", access.organizationId).eq("vehicle_id", request.vehicle_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if ([customerResult, vehicleResult, prepResult, linkResult, quoteResult, appointmentResult, approvalResult, inspectionResult, slotOffersResult, fixedPriceResult, vehicleLinkResult].some((result) => result.error)) return unavailable;

    const customer = customerResult.data;
    const vehicle = vehicleResult.data;
    const prep = prepResult.data;
    const link = linkResult.data;
    const quote = quoteResult.data?.[0] ?? null;
    const fixedPrice = fixedPriceResult.data;
    const vehicleLink = vehicleLinkResult.data;
    const quoteEvidence = quote?.evidence_payload as { external_id?: unknown } | null;
    const quibiEstimateId = quote?.evidence_kind === "quibi_manual_estimate" &&
      typeof quoteEvidence?.external_id === "string" && /^\d+$/.test(quoteEvidence.external_id)
      ? quoteEvidence.external_id : null;
    const appointments = appointmentResult.data ?? [];
    const latestApproval = approvalResult.data?.[0] ?? null;
    const approval = latestApproval?.quote_id === quote?.id ? latestApproval : null;
    const diagnosisOffer = slotOffersResult.data?.find((item) => item.appointment_type === "diagnosis") ?? null;
    const serviceOffer = slotOffersResult.data?.find((item) => item.appointment_type === "service") ?? null;
    let proposedPrice: ReturnType<typeof verifiedCasePrice> = null;
    let priceReadFailed = false;
    if (quote && link?.sync_status === "ok" && quibiEstimateId && vehicle && vehicleLink) {
      try {
        const quibi = configuredQuibiReadClient();
        const remoteVehicle = await quibi.vehicle(vehicleLink.quibi_vehicle_id, link.external_id);
        const listed = await quibi.estimates(link.external_id);
        if (listed.some((document) => document.id === quibiEstimateId)) {
          proposedPrice = verifiedCasePrice({ quote, customerId: link.external_id,
            detail: await quibi.estimateDetail(quibiEstimateId, link.external_id),
            localVehicle: { vin: vehicle.vin ?? "", registration: vehicle.registration_current ?? "",
              make: vehicle.make ?? "", model: vehicle.model ?? "" },
            remoteVehicle, vehicleLink });
        }
      } catch { priceReadFailed = true; }
    }
    const step = nextCaseStep({ status: request.status, offerPrepared: prep?.status === "ready_for_provider",
      quibiLinked: !!link, quibiSyncStatus: link?.sync_status, quoteReviewStatus: quote?.internal_review_status,
      deliveryStatus: approval?.delivery_status, customerDecision: approval?.customer_decision,
      fixedPriceStatus: fixedPrice?.status,
      inspectionRepairDecision: inspectionResult.data?.repair_decision,
      slotOfferStatus: serviceOffer?.status });
    const missing = Array.isArray(request.missing_fields) ? request.missing_fields : [];
    const recipient = customer?.display_name || "stranka";
    const communicationDraft = request.status === "needs_data" && missing.length > 0
      ? { title: "Dopolnitev podatkov", body: `Pozdravljeni, ${recipient}. Za nadaljevanje vašega servisnega povpraševanja potrebujemo še: ${missing.join(", ")}. Prosimo, dopolnite podatke prek povezave, ki vam jo bomo poslali posebej. Lep pozdrav, Avtoservis Selan` }
      : step.kind === "send_estimate" && fixedPrice?.status === "approved"
        ? { title: "Odobrena objavljena cena", body: `Pozdravljeni, ${recipient}. Za storitev ${fixedPrice.service_label} je objavljena končna cena ${Number(fixedPrice.final_price_eur).toLocaleString("sl-SI", { style: "currency", currency: "EUR" })}. Vir: ${fixedPrice.published_url}. Prosimo, sporočite, ali storitev naročate. Lep pozdrav, Avtoservis Selan` }
        : step.kind === "send_estimate" && proposedPrice?.state === "approved" && quibiEstimateId
          ? { title: "Odobreni predračun", body: `Pozdravljeni, ${recipient}. Pripravili smo predračun za vaš servisni primer. Odobrena cena predračuna je ${Number(proposedPrice.amount).toLocaleString("sl-SI", { style: "currency", currency: "EUR" })}. Predračun Quibi #${quibiEstimateId} priložite po ročnem preverjanju dokumenta. Prosimo, sporočite svojo odločitev. Lep pozdrav, Avtoservis Selan` }
          : step.kind === "manual_scheduling" && serviceOffer?.status === "proposed"
            ? { title: "Trije predlagani termini", body: `Pozdravljeni, ${recipient}. Za servis vam predlagamo naslednje termine:\n1. ${new Date(serviceOffer.slot_1).toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana" })}\n2. ${new Date(serviceOffer.slot_2).toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana" })}\n3. ${new Date(serviceOffer.slot_3).toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana" })}\nProsimo, sporočite svojo izbiro. Termini do dejanske potrditve rezervacije niso zagotovljeni. Lep pozdrav, Avtoservis Selan` }
            : null;

    return <div className="space-y-5">
      <Link href="/dashboard" className="text-sm font-medium text-blue-700">← Nazaj na nadzorno ploščo</Link>
      <header><h1 className="text-2xl font-semibold text-slate-900">Primer #{toPresentationRef(request.id)}</h1>
        <p className="mt-1 text-sm text-slate-600">{request.summary}</p>
        <p className="mt-1 text-xs text-slate-500">Vir: {request.source} · Status: {request.status}</p></header>

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <h2 className="font-semibold text-blue-950">Naslednji korak</h2>
        <p className="mt-1 text-sm text-blue-900">{step.label}</p>
        {request.next_action && ["new", "needs_data", "preparing_offer"].includes(request.status) &&
          !inspectionResult.data?.repair_decision &&
          <p className="mt-1 text-xs text-blue-800">Zabeleženo v primeru: {request.next_action}</p>}
      </section>
      {communicationDraft && <CommunicationDraft title={communicationDraft.title} body={communicationDraft.body} />}
      {request.status === "new" && inspectionResult.data?.repair_decision !== "not_ordered" &&
        ["owner", "admin"].includes(access.role) &&
        <ReviewIntakeButton serviceRequestId={serviceRequestId} />}
      {(request.has_error || request.attention_needed || (link && !["ok", "never_checked"].includes(link.sync_status))) && <section role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <h2 className="font-semibold">Potrebna pozornost</h2>
        {request.has_error && <p>{request.error_reason || "Primer ima zabeleženo napako."}</p>}
        {request.attention_needed && <p>{request.attention_reason || "Primer potrebuje pregled."}</p>}
        {link?.sync_status === "error" && <p>Quibi: {link.last_error_code || "QUIBI_READ_FAILED"}. Odprite povezavo in ponovite branje.</p>}
        {["local_changed", "remote_changed", "both_changed"].includes(link?.sync_status ?? "") && <p>Podatki stranke so se spremenili po potrditvi povezave. Preverite oba sistema pred nadaljevanjem.</p>}
      </section>}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-4 space-y-2">
          <h2 className="font-semibold">Povpraševanje in podatki</h2>
          {request.problem_description && <p className="text-sm">Težava: {request.problem_description}</p>}
          {request.service_wanted && <p className="text-sm">Želena storitev: {request.service_wanted}</p>}
          {missing.length > 0 && <p className="text-sm text-amber-800">Manjka: {missing.join(", ")}</p>}
          {request.status === "needs_data" && <CreateCompletionLinkButton serviceRequestId={serviceRequestId} />}
        </section>
        <section className="rounded-xl border bg-white p-4 space-y-2">
          <h2 className="font-semibold">Stranka in vozilo</h2>
          {customer ? <p className="text-sm"><Link className="font-medium text-blue-700" href={`/dashboard/stranke/${customer.id}`}>{customer.display_name}</Link> · {customer.phone || customer.email || "brez stika"}</p>
            : <p className="text-sm text-amber-800">Stranka še ni povezana s primerom.</p>}
          {vehicle ? <p className="text-sm">{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vozilo"} · {vehicle.registration_current || vehicle.vin || "brez oznake"}</p>
            : <p className="text-sm text-amber-800">Vozilo še ni povezano s primerom.</p>}
        </section>
        <section className="rounded-xl border bg-white p-4 space-y-2">
          <h2 className="font-semibold">Quibi in predračun</h2>
          {customer && !fixedPrice && <Link href={`/dashboard/stranke/${customer.id}/quibi`} className="text-sm font-medium text-blue-700">{link ? `Quibi stranka #${link.external_id} · dokumenti in ponovni pregled` : "Poišči in potrdi Quibijevo stranko"} →</Link>}
          {request.status === "preparing_offer" && !fixedPrice && step.kind !== "review_quibi_mismatch" && <PrepareOfferButton serviceRequestId={serviceRequestId} alreadyPrepared={prep?.status === "ready_for_provider"} />}
          {request.status === "preparing_offer" && !fixedPrice && prep?.status === "ready_for_provider" && link && step.kind !== "review_quibi_mismatch" &&
            <LinkManualEstimateForm serviceRequestId={serviceRequestId} />}
          {quote ? <p className="text-sm">Zabeležena različica ponudbe #{quote.version_no}: {quote.internal_review_status}. Preverite dejansko dokazilo pred odobritvijo.</p>
            : fixedPrice ? <p className="text-sm">Izbrana je pot z objavljeno končno ceno brez Quibijevega predračuna.</p>
            : <p className="text-sm text-slate-600">Dejanski predračun še ni potrjeno povezan s tem primerom. Cene ni mogoče odobriti ali poslati.</p>}
          {proposedPrice && <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">
            <p className="font-semibold">{proposedPrice.state === "approved" ? "Tadejeva potrjena cena predračuna" : "Predlagana cena iz Quibijevega predračuna"}: {Number(proposedPrice.amount).toLocaleString("sl-SI", { style: "currency", currency: "EUR" })}</p>
            <p>Vir: Quibijev predračun #{proposedPrice.sourceId}, ročno povezan s tem primerom. Stranka in vozilo sta preverjeno povezana; Quibi ne potrjuje, da dokument pripada prav temu delovnemu nalogu. Tadejev pregled je obvezen. Končna cena računa ni potrjena.</p>
          </div>}
          {quote && !proposedPrice && <p role="alert" className="text-sm text-amber-800">{priceReadFailed ? "Predloga cene ni mogoče sveže prebrati iz Quibija." : "Cene ni varno predlagati: preverite povezavo stranke, dokument, vozilo in morebitne spremembe."} Povezava dokumenta s konkretnim vozilom in delovnim nalogom zahteva ročno potrditev.</p>}
          {!quote && link && !fixedPrice && <p className="text-xs text-amber-800">Quibijevi dokumenti stranke so lahko kandidati, vendar API ne potrjuje ujemanja storitve, vozila in delovnega naloga s tem primerom. Cene zato še ni varno samodejno predlagati.</p>}
          {customer && quibiEstimateId && <Link className="text-sm font-medium text-blue-700" href={`/dashboard/stranke/${customer.id}/quibi/predracuni/${quibiEstimateId}`}>
            Odpri dejanski Quibijev predračun #{quibiEstimateId} →
          </Link>}
          {quote?.internal_review_status === "unreviewed" && quibiEstimateId && ["owner", "admin"].includes(access.role) &&
            <ReviewManualEstimate quoteId={quote.id} />}
          {quote?.internal_review_status === "approved_for_send" && quibiEstimateId &&
            <ManualEstimateHandoff quoteId={quote.id} delivered={approval?.delivery_status === "delivered"} decision={approval?.customer_decision ?? null} />}
          {approval?.delivery_status === "delivered" && <p className="text-xs text-slate-600">Ročno poslano prek {approval.delivery_channel}; referenca: {approval.delivery_evidence_reference}. To ni samodejna dostava.</p>}
        </section>
        <section className="rounded-xl border bg-white p-4 space-y-2">
          <h2 className="font-semibold">Termini</h2>
          {appointments.length === 0 ? <p className="text-sm text-slate-600">Za primer še ni internega termina.</p> : <ul className="space-y-1 text-sm">{appointments.map((item) =>
            <li key={item.id}>{new Date(item.starts_at).toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana" })} · {item.appointment_type} · interno: {item.status}</li>)}</ul>}
          <p className="text-xs text-amber-800">Google Koledar in MyPlanly nista avtomatsko potrjena. Zunanje usklajevanje opravite in preverite ročno.</p>
        </section>
      </div>
      {fixedPriceEnabled && (fixedPrice || (request.status === "preparing_offer" && !quote && !inspectionResult.data)) &&
        <PublishedFinalPrice serviceRequestId={serviceRequestId} path={fixedPrice} canApprove={["owner", "admin"].includes(access.role)} />}
      {!fixedPrice && (inspectionResult.data || ["new", "preparing_offer"].includes(request.status)) &&
        <PreliminaryInspection serviceRequestId={serviceRequestId} caseStatus={request.status}
        status={inspectionResult.data?.status as "requested" | "completed" | undefined ?? null}
        findings={inspectionResult.data?.findings ?? null}
        repairDecision={inspectionResult.data?.repair_decision as "pending" | "ordered" | "not_ordered" | undefined ?? null} />}
      {(inspectionResult.data?.status === "requested" || diagnosisOffer) &&
        <ManualSlotOffer serviceRequestId={serviceRequestId} appointmentType="diagnosis" offer={diagnosisOffer} />}
      {(request.status === "awaiting_slot_selection" || serviceOffer) &&
        <ManualSlotOffer serviceRequestId={serviceRequestId} appointmentType="service" offer={serviceOffer} />}
    </div>;
}
