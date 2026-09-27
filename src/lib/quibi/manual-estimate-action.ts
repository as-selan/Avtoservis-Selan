"use server";

import { createClient as createPrivilegedClient } from "@supabase/supabase-js";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";
import { configuredQuibiReadClient } from "@/lib/quibi/client";
import { customerFingerprint } from "@/lib/quibi/contracts";

type Result = { ok: true; quoteId: string; versionNo: number } | { ok: false; message: string };
const error = (message: string): Result => ({ ok: false, message });

/** Registers a digest and ID only after re-reading the real estimate in Quibi. */
export async function linkManualQuibiEstimate(serviceRequestId: string, estimateId: string): Promise<Result> {
  const access = await requirePhase1OperationalAccess();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(serviceRequestId) || !/^\d+$/.test(estimateId)) {
    return error("Neveljaven primer ali ID predračuna.");
  }
  const db = await createClient();
  const { data: request, error: requestError } = await db.from("service_requests")
    .select("customer_id, status").eq("organization_id", access.organizationId)
    .eq("id", serviceRequestId).is("archived_at", null).maybeSingle();
  if (requestError || !request || request.status !== "preparing_offer" || !request.customer_id) {
    return error("Primer ni pripravljen za povezavo predračuna.");
  }
  const [{ data: customer, error: customerError }, { data: link, error: linkError }] = await Promise.all([
    db.from("customers").select("display_name, phone, email")
      .eq("organization_id", access.organizationId).eq("id", request.customer_id)
      .is("archived_at", null).maybeSingle(),
    db.from("integration_links").select("external_id, local_fingerprint, external_fingerprint, sync_status")
      .eq("organization_id", access.organizationId).eq("provider", "quibi")
      .eq("entity_type", "customer").eq("entity_id", request.customer_id).maybeSingle(),
  ]);
  if (customerError || linkError || !customer || !link || !["ok", "never_checked"].includes(link.sync_status)) {
    return error("Najprej preverite povezavo stranke s Quibijem.");
  }
  if (customerFingerprint({ name: customer.display_name, phone: customer.phone ?? "", email: customer.email ?? "" }) !== link.local_fingerprint) {
    return error("Podatki stranke v Selanu so se spremenili. Ponovno preverite povezavo.");
  }

  let digest: string;
  try {
    const quibi = configuredQuibiReadClient();
    const remote = await quibi.customer(link.external_id);
    if (customerFingerprint(remote) !== link.external_fingerprint) {
      return error("Podatki stranke v Quibiju so se spremenili. Ponovno preverite povezavo.");
    }
    const listed = await quibi.estimates(link.external_id);
    if (!listed.some((item) => item.id === estimateId)) {
      return error("Predračun ni na seznamu potrjene Quibijeve stranke.");
    }
    const detail = await quibi.estimateDetail(estimateId, link.external_id);
    if (detail.lines.length === 0) return error("Predračun nima preverljivih postavk.");
    digest = detail.contentSha256;
  } catch {
    return error("Branje dejanskega Quibijevega predračuna ni uspelo.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return error("Varna strežniška povezava za dokazila ni nastavljena.");
  const trusted = createPrivilegedClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error: writeError } = await trusted.rpc("register_manual_quibi_estimate", {
    p_organization_id: access.organizationId,
    p_service_request_id: serviceRequestId,
    p_quibi_customer_id: link.external_id,
    p_external_id: estimateId,
    p_content_sha256: digest,
    p_actor_id: access.userId,
  });
  const payload = (data ?? {}) as { ok?: boolean; quote_id?: string; version_no?: number };
  if (writeError || payload.ok !== true || !payload.quote_id || !payload.version_no) {
    return error("Preverjenega predračuna ni bilo mogoče povezati. Poskusite znova.");
  }
  return { ok: true, quoteId: payload.quote_id, versionNo: payload.version_no };
}
