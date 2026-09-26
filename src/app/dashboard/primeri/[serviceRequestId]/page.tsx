import Link from "next/link";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";
import { canQueryCustomerId } from "@/lib/customers/present";
import { toPresentationRef } from "@/lib/dashboard/adapt-dashboard";
import { nextCaseStep } from "@/lib/cases/next-step";
import { CreateCompletionLinkButton } from "@/components/dashboard/CreateCompletionLinkButton";
import { PrepareOfferButton } from "@/components/dashboard/PrepareOfferButton";

export const dynamic = "force-dynamic";

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

    const [customerResult, vehicleResult, prepResult, linkResult, quoteResult, appointmentResult] = await Promise.all([
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
      db.from("quotes").select("id, version_no, internal_review_status")
        .eq("organization_id", access.organizationId).eq("service_request_id", serviceRequestId)
        .order("version_no", { ascending: false }).limit(1),
      db.from("appointments").select("id, status, appointment_type, starts_at, ends_at")
        .eq("organization_id", access.organizationId).eq("service_request_id", serviceRequestId)
        .order("starts_at", { ascending: true }),
    ]);
    if ([customerResult, vehicleResult, prepResult, linkResult, quoteResult, appointmentResult].some((result) => result.error)) return unavailable;

    const customer = customerResult.data;
    const vehicle = vehicleResult.data;
    const prep = prepResult.data;
    const link = linkResult.data;
    const quote = quoteResult.data?.[0] ?? null;
    const appointments = appointmentResult.data ?? [];
    const step = nextCaseStep({ status: request.status, offerPrepared: prep?.status === "ready_for_provider", quibiLinked: !!link });
    const missing = Array.isArray(request.missing_fields) ? request.missing_fields : [];

    return <div className="space-y-5">
      <Link href="/dashboard" className="text-sm font-medium text-blue-700">← Nazaj na nadzorno ploščo</Link>
      <header><h1 className="text-2xl font-semibold text-slate-900">Primer #{toPresentationRef(request.id)}</h1>
        <p className="mt-1 text-sm text-slate-600">{request.summary}</p>
        <p className="mt-1 text-xs text-slate-500">Vir: {request.source} · Status: {request.status}</p></header>

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <h2 className="font-semibold text-blue-950">Naslednji korak</h2>
        <p className="mt-1 text-sm text-blue-900">{step.label}</p>
        {request.next_action && <p className="mt-1 text-xs text-blue-800">Zabeleženo v primeru: {request.next_action}</p>}
      </section>
      {(request.has_error || request.attention_needed || link?.sync_status === "error") && <section role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <h2 className="font-semibold">Potrebna pozornost</h2>
        {request.has_error && <p>{request.error_reason || "Primer ima zabeleženo napako."}</p>}
        {request.attention_needed && <p>{request.attention_reason || "Primer potrebuje pregled."}</p>}
        {link?.sync_status === "error" && <p>Quibi: {link.last_error_code || "QUIBI_READ_FAILED"}. Odprite povezavo in ponovite branje.</p>}
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
          {customer && <Link href={`/dashboard/stranke/${customer.id}/quibi`} className="text-sm font-medium text-blue-700">{link ? `Quibi stranka #${link.external_id} · dokumenti in ponovni pregled` : "Poišči in potrdi Quibijevo stranko"} →</Link>}
          {request.status === "preparing_offer" && <PrepareOfferButton serviceRequestId={serviceRequestId} alreadyPrepared={prep?.status === "ready_for_provider"} />}
          {quote ? <p className="text-sm">Zabeležena različica ponudbe #{quote.version_no}: {quote.internal_review_status}. Preverite dejansko dokazilo pred odobritvijo.</p>
            : <p className="text-sm text-slate-600">Dejanski predračun še ni potrjeno povezan s tem primerom. Cene ni mogoče odobriti ali poslati.</p>}
        </section>
        <section className="rounded-xl border bg-white p-4 space-y-2">
          <h2 className="font-semibold">Termini</h2>
          {appointments.length === 0 ? <p className="text-sm text-slate-600">Za primer še ni internega termina.</p> : <ul className="space-y-1 text-sm">{appointments.map((item) =>
            <li key={item.id}>{new Date(item.starts_at).toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana" })} · {item.appointment_type} · interno: {item.status}</li>)}</ul>}
          <p className="text-xs text-amber-800">Google Koledar in MyPlanly nista avtomatsko potrjena. Zunanje usklajevanje opravite in preverite ročno.</p>
        </section>
      </div>
    </div>;
}
