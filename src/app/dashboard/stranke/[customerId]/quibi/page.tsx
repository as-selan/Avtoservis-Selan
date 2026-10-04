import Link from "next/link";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { loadCustomerDetail } from "@/lib/customers/load-customer-detail";
import { createClient } from "@/lib/supabase/server";
import { confirmQuibiCustomerLink, refreshQuibiCustomerLink, confirmQuibiVehicleLink, refreshQuibiVehicleLink } from "@/lib/quibi/actions";
import { configuredQuibiReadClient } from "@/lib/quibi/client";
import { customerFingerprint, vehicleFingerprint, quibiDocumentStatusLabel, type QuibiCustomer, type QuibiDocument, type QuibiVehicle } from "@/lib/quibi/contracts";

export const dynamic = "force-dynamic";

export default async function QuibiCustomerPage({ params, searchParams }: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ q?: string; result?: string; error?: string; refresh?: string; vehicleResult?: string; vehicleRefresh?: string }>;
}) {
  const access = await requirePhase1OperationalAccess();
  const { customerId } = await params;
  const query = await searchParams;
  const local = await loadCustomerDetail(access.organizationId, customerId);
  if (!local.ok) return <p role="alert">Stranka ni na voljo.</p>;

  const db = await createClient();
  const { data: link, error: linkError } = await db.from("integration_links")
    .select("external_id, local_fingerprint, external_fingerprint, confirmed_at, sync_status, last_checked_at, last_error_code")
    .eq("organization_id", access.organizationId).eq("entity_type", "customer")
    .eq("provider", "quibi").eq("entity_id", customerId).maybeSingle();
  if (linkError) return <p role="alert">Povezav Quibi trenutno ni mogoče prebrati.</p>;

  const { data: vehicleLinks, error: vehicleLinksError } = link
    ? await db.from("quibi_vehicle_links")
      .select("vehicle_id, quibi_vehicle_id, local_fingerprint, external_fingerprint, sync_status, last_error_code, last_checked_at")
      .eq("organization_id", access.organizationId).eq("customer_id", customerId)
    : { data: [], error: null };
  if (vehicleLinksError) return <p role="alert">Povezav vozil Quibi trenutno ni mogoče prebrati.</p>;

  let matches: QuibiCustomer[] = [];
  let remote: QuibiCustomer | null = null;
  let orders: QuibiDocument[] = [];
  let estimates: QuibiDocument[] = [];
  let invoices: QuibiDocument[] = [];
  let remoteVehicles: QuibiVehicle[] = [];
  let readError = "";
  let invoiceReadError = false;
  try {
    if (link) {
      const client = configuredQuibiReadClient();
      [remote, orders, estimates, remoteVehicles] = await Promise.all([
        client.customer(link.external_id), client.workOrders(link.external_id), client.estimates(link.external_id),
        client.vehicles(link.external_id),
      ]);
      try { invoices = await client.invoices(link.external_id); } catch { invoiceReadError = true; }
    } else if (typeof query.q === "string" && query.q.trim().length >= 2 && query.q.length <= 100) {
      matches = await configuredQuibiReadClient().searchCustomers(query.q);
    }
  } catch (error) {
    readError = error instanceof Error && error.message === "QUIBI_NOT_CONFIGURED"
      ? "Quibi testne poverilnice na strežniku niso nastavljene."
      : "Branje Quibija ni uspelo. Povezava in dokumenti niso bili spremenjeni.";
  }

  const localFingerprint = customerFingerprint({ name: local.customer.displayName, phone: local.customer.phone ?? "", email: local.customer.email ?? "" });
  const localChanged = !!link && localFingerprint !== link.local_fingerprint;
  const remoteChanged = !!link && !!remote && customerFingerprint(remote) !== link.external_fingerprint;
  const fieldsDiffer = !!remote && localFingerprint !== customerFingerprint(remote);
  const href = `/dashboard/stranke/${customerId}`;

  return <div className="space-y-5">
    <Link href={href} className="text-sm font-medium text-blue-700">← Nazaj na stranko</Link>
    <div><h1 className="text-2xl font-semibold">Quibi · {local.customer.displayName}</h1>
      <p className="text-sm text-slate-600">{process.env.SELAN_REMOTE_DEMO === "1"
        ? "Quibi demo – podatki so simulirani. Povezave veljajo samo za sintetične testne primere."
        : "Quibi DEV – dejanski podatki iz testnega okolja. Povezava je ročno potrjena; zapisovanje in pošiljanje v Quibi nista avtomatska."}</p></div>
    {query.result === "linked" && <p role="status" className="text-green-700">Povezava je shranjena.</p>}
    {query.result === "changed" && <p role="alert" className="text-amber-800">Podatki v Quibiju so se od prikaza spremenili. Ponovno preverite stranko.</p>}
    {query.result === "already" && <p role="alert" className="text-amber-800">Ta stranka ali Quibijev ID je že povezan.</p>}
    {query.refresh === "ok" && <p role="status" className="text-green-700">Quibijeva povezava je znova preverjena.</p>}
    {query.refresh === "remote_changed" && <p role="alert" className="text-amber-800">Quibijevi podatki so se spremenili; preverite jih ročno.</p>}
    {query.refresh === "local_changed" && <p role="alert" className="text-amber-800">Selanovi podatki so se spremenili; preverite jih ročno.</p>}
    {query.refresh === "both_changed" && <p role="alert" className="text-amber-800">Podatki so se spremenili v obeh sistemih; preverite jih ročno.</p>}
    {(query.result === "error" || query.error || query.result === "missing") && <p role="alert" className="text-red-700">Povezave ni bilo mogoče shraniti.</p>}
    {readError && <p role="alert" className="text-red-700">{readError}</p>}
    {query.vehicleResult === "linked" && <p role="status" className="text-green-700">Vozilo je povezano s potrjenim Quibijevim ID-jem.</p>}
    {query.vehicleResult === "changed" && <p role="alert" className="text-amber-800">Vozilo v Quibiju se je med pregledom spremenilo. Preverite ga znova.</p>}
    {query.vehicleResult === "customer_changed" && <p role="alert" className="text-amber-800">Povezava stranke se je spremenila. Najprej preverite stranko.</p>}
    {query.vehicleResult === "disabled" && <p role="alert" className="text-amber-800">Quibijevo vozilo je onemogočeno; povezava ni bila ustvarjena.</p>}
    {query.vehicleResult === "already" && <p role="alert" className="text-amber-800">Eno od teh vozil je že povezano.</p>}
    {query.vehicleResult && ["error", "invalid", "missing"].includes(query.vehicleResult) && <p role="alert" className="text-red-700">Povezave vozila ni bilo mogoče shraniti.</p>}
    {query.vehicleRefresh === "ok" && <p role="status" className="text-green-700">Povezava vozila je znova preverjena.</p>}
    {query.vehicleRefresh && ["local_changed", "remote_changed", "both_changed"].includes(query.vehicleRefresh) && <p role="alert" className="text-amber-800">Podatki vozila so se spremenili ({query.vehicleRefresh}); preverite oba zapisa.</p>}
    {query.vehicleRefresh === "error" && <p role="alert" className="text-red-700">Ponovni pregled vozila ni uspel.</p>}
    {link ? <>
      <section className="rounded-xl border bg-white p-4 space-y-2">
        <h2 className="font-semibold">Potrjena povezava: Quibi #{link.external_id}</h2>
        <p className="text-sm">Potrjeno: {new Date(link.confirmed_at).toLocaleString("sl-SI")}</p>
        <p className="text-sm">Zadnji zabeleženi pregled: {link.last_checked_at ? new Date(link.last_checked_at).toLocaleString("sl-SI") : "še ni izveden"}</p>
        {link.sync_status === "error" && <p role="alert" className="text-red-700">Zadnja sinhronizacija ni uspela ({link.last_error_code ?? "QUIBI_READ_FAILED"}). Preverite dostop in poskusite znova.</p>}
        {link.sync_status === "remote_changed" && <p role="alert" className="text-amber-800">Pri zadnjem pregledu je bila zaznana sprememba v Quibiju.</p>}
        {link.sync_status === "local_changed" && <p role="alert" className="text-amber-800">Pri zadnjem pregledu je bila zaznana sprememba v Selanu.</p>}
        {link.sync_status === "both_changed" && <p role="alert" className="text-amber-800">Pri zadnjem pregledu so bile zaznane spremembe v obeh sistemih.</p>}
        <form action={refreshQuibiCustomerLink}>
          <input type="hidden" name="customerId" value={customerId} />
          <button className="rounded border border-blue-700 px-3 py-2 text-sm text-blue-700">Ponovno preveri Quibi</button>
        </form>
        {remote && <p className="text-sm">Quibi: {remote.name} · {remote.phone || "brez telefona"} · {remote.email || "brez e-pošte"}</p>}
        {localChanged && <p role="alert" className="text-amber-800">Selanovi podatki so se po povezavi spremenili.</p>}
        {remoteChanged && <p role="alert" className="text-amber-800">Quibijevi podatki so se po povezavi spremenili.</p>}
        {fieldsDiffer && <p role="alert" className="text-amber-800">Podatki stranke v obeh sistemih se razlikujejo. Potrebno je ročno preverjanje.</p>}
      </section>
      <section className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="font-semibold">Vozila v Quibiju</h2>
        <p className="text-sm text-slate-600">Številka šasije je v Quibijevem polju internastevilka. Lahko se ponovi, zato povezavo potrdite po ID-ju, stranki in podatkih vozila.</p>
        {!readError && remoteVehicles.length === 0 && <p className="text-sm text-slate-600">Pri potrjeni stranki ni prikazanih vozil.</p>}
        {remoteVehicles.map((item) => {
          const linked = (vehicleLinks ?? []).find((row) => row.quibi_vehicle_id === item.id);
          return <div key={item.id} className="rounded border p-3 space-y-2 text-sm">
            <p className="font-medium">Quibi #{item.id} · {item.registration || "brez registracije"} · {item.make} {item.model}</p>
            <p>VIN: {item.vin || "ni naveden"}{item.disabled ? " · onemogočeno v Quibiju" : ""}</p>
            {linked ? <p className="text-green-700">Povezano s Selanovim vozilom.</p>
              : !item.disabled && (vehicleLinks ?? []).length < local.customer.vehicles.length && <div className="space-y-2">
                {local.customer.vehicles.filter((vehicle) => !(vehicleLinks ?? []).some((row) => row.vehicle_id === vehicle.id)).map((vehicle) =>
                  <form key={vehicle.id} action={confirmQuibiVehicleLink} className="rounded border border-slate-200 p-2 space-y-2">
                    <p>Selan: {vehicle.registration || "brez registracije"} · {vehicle.make || ""} {vehicle.model || ""} · VIN {vehicle.vin || "ni naveden"}</p>
                    <input type="hidden" name="customerId" value={customerId} />
                    <input type="hidden" name="vehicleId" value={vehicle.id} />
                    <input type="hidden" name="externalId" value={item.id} />
                    <input type="hidden" name="remoteFingerprint" value={vehicleFingerprint(item)} />
                    <label className="flex gap-2"><input type="checkbox" name="confirmed" value="yes" required />Preveril sem, da gre za isto vozilo.</label>
                    <button className="rounded border border-blue-700 px-3 py-2 text-blue-700">Poveži vozili</button>
                  </form>)}
              </div>}
          </div>;
        })}
        {(vehicleLinks ?? []).map((row) => {
          const localVehicle = local.customer.vehicles.find((vehicle) => vehicle.id === row.vehicle_id);
          const remoteVehicle = remoteVehicles.find((vehicle) => vehicle.id === row.quibi_vehicle_id);
          const localDrift = !!localVehicle && vehicleFingerprint({ vin: localVehicle.vin ?? "", registration: localVehicle.registration ?? "", make: localVehicle.make ?? "", model: localVehicle.model ?? "" }) !== row.local_fingerprint;
          const remoteDrift = !!remoteVehicle && vehicleFingerprint(remoteVehicle) !== row.external_fingerprint;
          return <div key={row.vehicle_id} className="rounded border border-blue-200 p-3 space-y-1 text-sm">
            <p className="font-medium">Selan {localVehicle?.registration || row.vehicle_id} ↔ Quibi #{row.quibi_vehicle_id}</p>
            {!localVehicle && <p role="alert" className="text-red-700">Vozilo ni več pri tej stranki. Preverite povezavo.</p>}
            {row.sync_status === "error" && <p role="alert" className="text-red-700">Zadnji pregled ni uspel ({row.last_error_code ?? "QUIBI_READ_FAILED"}).</p>}
            {row.sync_status !== "error" && !["never_checked", "ok"].includes(row.sync_status) && <p role="alert" className="text-amber-800">Zaznana sprememba: {row.sync_status}.</p>}
            {(localDrift || remoteDrift) && <p role="alert" className="text-amber-800">Trenutni podatki se razlikujejo od potrjene povezave.</p>}
            <form action={refreshQuibiVehicleLink}>
              <input type="hidden" name="customerId" value={customerId} /><input type="hidden" name="vehicleId" value={row.vehicle_id} />
              <button className="rounded border border-blue-700 px-3 py-1 text-blue-700">Ponovno preveri vozilo</button>
            </form>
          </div>;
        })}
      </section>
      <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Delovni nalogi v Quibiju</h2>
        <ul className="mt-2 space-y-1 text-sm">{orders.map((doc) => <li key={doc.id}>Nalog #{doc.id} · {quibiDocumentStatusLabel(doc.status)}</li>)}</ul>
        {orders.length === 0 && !readError && <p className="text-sm text-slate-600">Ni prikazanih nalogov.</p>}
      </section>
      <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Predračuni v Quibiju</h2>
        <ul className="mt-2 space-y-1 text-sm">{estimates.map((doc) => <li key={doc.id}>
          <Link className="font-medium text-blue-700" href={`/dashboard/stranke/${customerId}/quibi/predracuni/${doc.id}`}>Predračun #{doc.id} · preveri vsebino</Link>
          {` · ${quibiDocumentStatusLabel(doc.status)}`}
        </li>)}</ul>
        {estimates.length === 0 && !readError && <p className="text-sm text-slate-600">Ni prikazanih predračunov.</p>}
      </section>
      <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Računi v Quibiju</h2>
        <p className="text-sm text-slate-600">Bralni pregled. Končni znesek računa ni Tadejeva odobrena cena predračuna.</p>
        {invoiceReadError && <p role="alert" className="text-red-700">Računov trenutno ni mogoče prebrati.</p>}
        <ul className="mt-2 space-y-1 text-sm">{invoices.map((doc) => <li key={doc.id}>Račun #{doc.id} · {quibiDocumentStatusLabel(doc.status)}{doc.amount ? ` · znesek v Quibiju: ${doc.amount}` : ""}</li>)}</ul>
        {invoices.length === 0 && !invoiceReadError && !readError && <p className="text-sm text-slate-600">Ni prikazanih računov.</p>}
      </section>
    </> : <section className="rounded-xl border bg-white p-4 space-y-4">
      <h2 className="font-semibold">Poišči obstoječo stranko v Quibiju</h2>
      <p className="text-sm text-slate-600">Selan: {local.customer.displayName} · {local.customer.phone || "brez telefona"} · {local.customer.email || "brez e-pošte"}</p>
      <form method="get" className="flex gap-2"><input name="q" defaultValue={query.q ?? ""} minLength={2} maxLength={100} required
        aria-label="Ime, telefon, e-pošta ali Quibi ID" className="rounded border px-3 py-2 flex-1" />
        <button className="rounded bg-blue-700 px-4 py-2 text-white">Poišči</button></form>
      {matches.map((candidate) => <div key={candidate.id} className="rounded border p-3 space-y-2">
        <p className="font-medium">#{candidate.id} · {candidate.name}</p>
        <p className="text-sm">{candidate.phone || "brez telefona"} · {candidate.email || "brez e-pošte"}</p>
        <form action={confirmQuibiCustomerLink} className="space-y-2">
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="externalId" value={candidate.id} />
          <input type="hidden" name="remoteFingerprint" value={customerFingerprint(candidate)} />
          <label className="flex gap-2 text-sm"><input type="checkbox" name="confirmed" value="yes" required />Ročno sem preveril, da gre za isto stranko.</label>
          <button className="rounded border border-blue-700 px-3 py-2 text-sm text-blue-700">Potrdi povezavo</button>
        </form>
      </div>)}
      {query.q && matches.length === 0 && !readError && <p className="text-sm text-slate-600">Ni ujemanj.</p>}
    </section>}
  </div>;
}
