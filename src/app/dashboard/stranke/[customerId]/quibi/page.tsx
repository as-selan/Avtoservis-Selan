import Link from "next/link";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { loadCustomerDetail } from "@/lib/customers/load-customer-detail";
import { createClient } from "@/lib/supabase/server";
import { confirmQuibiCustomerLink, refreshQuibiCustomerLink } from "@/lib/quibi/actions";
import { configuredQuibiReadClient } from "@/lib/quibi/client";
import { customerFingerprint, type QuibiCustomer, type QuibiDocument } from "@/lib/quibi/contracts";

export const dynamic = "force-dynamic";

export default async function QuibiCustomerPage({ params, searchParams }: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ q?: string; result?: string; error?: string; refresh?: string }>;
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

  let matches: QuibiCustomer[] = [];
  let remote: QuibiCustomer | null = null;
  let orders: QuibiDocument[] = [];
  let estimates: QuibiDocument[] = [];
  let readError = "";
  try {
    if (link) {
      const client = configuredQuibiReadClient();
      [remote, orders, estimates] = await Promise.all([
        client.customer(link.external_id), client.workOrders(link.external_id), client.estimates(link.external_id),
      ]);
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
      <p className="text-sm text-slate-600">Ročno potrjena povezava in bralni pregled testnega okolja.</p></div>
    {query.result === "linked" && <p role="status" className="text-green-700">Povezava je shranjena.</p>}
    {query.result === "changed" && <p role="alert" className="text-amber-800">Podatki v Quibiju so se od prikaza spremenili. Ponovno preverite stranko.</p>}
    {query.result === "already" && <p role="alert" className="text-amber-800">Ta stranka ali Quibijev ID je že povezan.</p>}
    {query.refresh === "ok" && <p role="status" className="text-green-700">Quibijeva povezava je znova preverjena.</p>}
    {query.refresh === "remote_changed" && <p role="alert" className="text-amber-800">Quibijevi podatki so se spremenili; preverite jih ročno.</p>}
    {query.refresh === "local_changed" && <p role="alert" className="text-amber-800">Selanovi podatki so se spremenili; preverite jih ročno.</p>}
    {query.refresh === "both_changed" && <p role="alert" className="text-amber-800">Podatki so se spremenili v obeh sistemih; preverite jih ročno.</p>}
    {(query.result === "error" || query.error || query.result === "missing") && <p role="alert" className="text-red-700">Povezave ni bilo mogoče shraniti.</p>}
    {readError && <p role="alert" className="text-red-700">{readError}</p>}
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
      <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Delovni nalogi v Quibiju</h2>
        <ul className="mt-2 space-y-1 text-sm">{orders.map((doc) => <li key={doc.id}>Nalog #{doc.id}</li>)}</ul>
        {orders.length === 0 && !readError && <p className="text-sm text-slate-600">Ni prikazanih nalogov.</p>}
      </section>
      <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Predračuni v Quibiju</h2>
        <ul className="mt-2 space-y-1 text-sm">{estimates.map((doc) => <li key={doc.id}>
          <Link className="font-medium text-blue-700" href={`/dashboard/stranke/${customerId}/quibi/predracuni/${doc.id}`}>Predračun #{doc.id} · preveri vsebino</Link>
        </li>)}</ul>
        {estimates.length === 0 && !readError && <p className="text-sm text-slate-600">Ni prikazanih predračunov.</p>}
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
