import {quibiLinkEnvironment} from "@/lib/quibi/workflow-config";
import {DocumentCommunicationDraft} from "@/components/dashboard/DocumentCommunicationDraft";
import Link from "next/link";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { canQueryCustomerId } from "@/lib/customers/present";
import { createClient } from "@/lib/supabase/server";
import { configuredQuibiReadClient } from "@/lib/quibi/client";
import { quibiDocumentStatusLabel, type QuibiEstimateDetail } from "@/lib/quibi/contracts";

export const dynamic = "force-dynamic";

export default async function QuibiEstimatePage({ params }: {
  params: Promise<{ customerId: string; estimateId: string }>;
}) {
  const access = await requirePhase1OperationalAccess();
  const { customerId, estimateId } = await params;
  if (!canQueryCustomerId(customerId) || !/^\d+$/.test(estimateId)) {
    return <p role="alert">Predračun ni na voljo.</p>;
  }
  const db = await createClient();
  const { data: link, error } = await db.from("integration_links")
    .select("external_id, sync_status, quibi_environment")
    .eq("organization_id", access.organizationId)
    .eq("provider", "quibi").eq("entity_type", "customer")
    .eq("entity_id", customerId).maybeSingle();
  if (error || !link || link.quibi_environment !== quibiLinkEnvironment(process.env)) return <p role="alert">Potrjena povezava s Quibijevo stranko manjka.</p>;

  let estimate: QuibiEstimateDetail;
  try {
    const client = configuredQuibiReadClient();
    const listed = await client.estimates(link.external_id);
    if (!listed.some((item) => item.id === estimateId)) throw new Error("QUIBI_ESTIMATE_NOT_LISTED");
    estimate = await client.estimateDetail(estimateId, link.external_id);
  } catch {
    return <p role="alert">Predračuna ni mogoče preverjeno prebrati v Quibiju. Poskusite znova pozneje.</p>;
  }

  const {data:approved}=await db.from("quotes").select("content_sha256").eq("organization_id",access.organizationId).eq("evidence_kind","quibi_manual_estimate").eq("evidence_payload->>external_id",estimateId).eq("internal_review_status","approved_for_send").eq("quibi_environment",link.quibi_environment).order("version_no",{ascending:false}).limit(1).maybeSingle();
  return <div className="space-y-5">
    {approved&&approved.content_sha256!==estimate.contentSha256&&<p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-900">Aktualni SHA dokumenta se razlikuje od odobrenega SHA v Selanu. Prejšnja odobritev ne potrjuje trenutne vsebine. Ne pošiljajte ponovno; najprej razjasnite spremembo.</p>}
    <Link className="text-sm font-medium text-blue-700" href={`/dashboard/stranke/${customerId}/quibi`}>
      ← Nazaj na povezano stranko
    </Link>
    <header>
      <h1 className="text-2xl font-semibold">Quibijev predračun #{estimate.id}</h1>
      <p className="text-sm text-slate-600">Neposreden bralni prikaz iz Quibijevega testnega okolja.</p>
    </header>
    {link.sync_status !== "ok" && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
      Povezava stranke zahteva ponovni pregled. Ne potrjujte cene, dokler ne razrešite neskladja.
    </p>}
    <a className="inline-block rounded border bg-white px-4 py-2 text-blue-700" target="_blank" rel="noreferrer" href={`/api/quibi/dokumenti/${customerId}/estimate/${estimateId}/pdf`}>Odpri dejanski PDF iz Quibija</a>
    <section className="rounded-xl border bg-white p-4 space-y-2">
      <h2 className="font-semibold">Dejanska vsebina dokumenta</h2>
      <p className="text-sm">Status: {quibiDocumentStatusLabel(estimate.status)}</p>
      <p className="text-sm">Znesek, kot ga vrne Quibi: {estimate.amount}</p>
      <ul className="space-y-2 text-sm">{estimate.lines.map((line, index) => <li key={index} className="border-t pt-2">
        {line.description || "Postavka brez opisa"} · količina {line.quantity || "ni navedena"} · cena postavke po Quibiju {line.grossPrice || "ni navedena"}
      </li>)}</ul>
      {estimate.lines.length === 0 && <p className="text-sm text-amber-800">Quibi ne vrača postavk; predračuna ni mogoče vsebinsko preveriti.</p>}
    </section>
    <p className="text-sm text-amber-800">Ta bralni prikaz še ni dokaz o Tadejevi odobritvi, pošiljanju ali potrditvi stranke.</p>
     <DocumentCommunicationDraft kind="Predračun" id={estimate.id} amount={estimate.amount}/>
 </div>;
}
