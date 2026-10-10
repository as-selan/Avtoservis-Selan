"use server";

import { createClient as createPrivilegedClient } from "@supabase/supabase-js";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";
import { configuredQuibiReadClient } from "@/lib/quibi/client";
import { quibiLinkEnvironment } from "./workflow-config";
import { customerFingerprint } from "@/lib/quibi/contracts";
import { verifiedVehicleLink } from "@/lib/quibi/price-suggestion";
import { demoEvidenceAllowed } from "@/lib/demo/evidence";

type Result = { ok: true; quoteId: string; versionNo: number } | { ok: false; message: string };
const error = (message: string): { ok: false; message: string } => ({ ok: false, message });

async function caseVehicleIsCurrent(
  db: Awaited<ReturnType<typeof createClient>>,
  quibi: ReturnType<typeof configuredQuibiReadClient>,
  organizationId: string, customerId: string, vehicleId: string | null,
  externalCustomerId: string,
): Promise<string | null> {
  if (!vehicleId) return null;
  const [{ data: vehicle, error: vehicleError }, { data: link, error: linkError }] = await Promise.all([
    db.from("vehicles").select("vin, registration_current, make, model")
      .eq("organization_id", organizationId).eq("id", vehicleId)
      .eq("customer_id", customerId).is("archived_at", null).maybeSingle(),
    db.from("quibi_vehicle_links")
      .select("quibi_customer_id, quibi_vehicle_id, sync_status, local_fingerprint, external_fingerprint,quibi_environment")
      .eq("organization_id", organizationId).eq("customer_id", customerId)
      .eq("vehicle_id", vehicleId).maybeSingle(),
  ]);
  if (vehicleError || linkError || !vehicle || !link || link.sync_status !== "ok" || link.quibi_environment !== quibiLinkEnvironment(process.env)) return null;
  const remoteVehicle = await quibi.vehicle(link.quibi_vehicle_id, externalCustomerId);
  return verifiedVehicleLink({ customerId: externalCustomerId,
    localVehicle: { vin: vehicle.vin ?? "", registration: vehicle.registration_current ?? "",
      make: vehicle.make ?? "", model: vehicle.model ?? "" },
    remoteVehicle, vehicleLink: link }) ? link.quibi_vehicle_id : null;
}

/** Registers a digest and ID only after re-reading the real estimate in Quibi. */
export async function linkManualQuibiEstimate(serviceRequestId: string, estimateId: string, manualMatchConfirmed: boolean): Promise<Result> {
  const access = await requirePhase1OperationalAccess();
  if (manualMatchConfirmed !== true) {
    return error("Pred povezavo ročno potrdite ujemanje stranke, vozila, storitve in delovnega naloga.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(serviceRequestId) || !/^\d+$/.test(estimateId)) {
    return error("Neveljaven primer ali ID predračuna.");
  }
  const db = await createClient();
  const { data: request, error: requestError } = await db.from("service_requests")
    .select("customer_id, vehicle_id, status, service_wanted").eq("organization_id", access.organizationId)
    .eq("id", serviceRequestId).is("archived_at", null).maybeSingle();
  if (requestError || !request || request.status !== "preparing_offer" || !request.customer_id ||
      !request.service_wanted?.trim()) {
    return error("Primer ni pripravljen za povezavo predračuna.");
  }
  const [{ data: customer, error: customerError }, { data: link, error: linkError }] = await Promise.all([
    db.from("customers").select("display_name, phone, email")
      .eq("organization_id", access.organizationId).eq("id", request.customer_id)
      .is("archived_at", null).maybeSingle(),
    db.from("integration_links").select("external_id, local_fingerprint, external_fingerprint, sync_status,quibi_environment")
      .eq("organization_id", access.organizationId).eq("provider", "quibi")
      .eq("entity_type", "customer").eq("entity_id", request.customer_id).maybeSingle(),
  ]);
  if (customerError || linkError || !customer || !link || link.quibi_environment !== quibiLinkEnvironment(process.env) || !["ok", "never_checked"].includes(link.sync_status)) {
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
    const currentVehicleId = await caseVehicleIsCurrent(db, quibi, access.organizationId, request.customer_id,
      request.vehicle_id, link.external_id);
    if (!currentVehicleId) {
      return error("Vozilo ni sveže potrjeno povezano s Quibijem. Preverite vozilo pred povezavo predračuna.");
    }
    const listed = await quibi.estimates(link.external_id);
    if (!listed.some((item) => item.id === estimateId)) {
      return error("Predračun ni na seznamu potrjene Quibijeve stranke.");
    }
    const detail = await quibi.estimateDetail(estimateId, link.external_id);
    if (detail.vehicleId && detail.vehicleId !== currentVehicleId) {
      return error("Predračun pripada drugemu Quibijevemu vozilu. Preverite dokument.");
    }
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
  const payload = (data ?? {}) as { ok?: boolean; quote_id?: string; version_no?: number; error_code?: string };
  if (!writeError && payload.error_code === "document_already_linked") {
    return error("Ta Quibijev predračun je že povezan z drugim servisnim primerom. Preverite ID dokumenta.");
  }
  if (writeError || payload.ok !== true || !payload.quote_id || !payload.version_no) {
    return error("Preverjenega predračuna ni bilo mogoče povezati. Poskusite znova.");
  }
  return { ok: true, quoteId: payload.quote_id, versionNo: payload.version_no };
}

export async function reviewManualQuibiEstimate(
  quoteId: string,
  decision: "approve" | "reject",
): Promise<{ ok: true; reviewStatus: string } | { ok: false; message: string }> {
  const access = await requirePhase1OperationalAccess();
  if (!["owner", "admin"].includes(access.role)) return error("Samo Tadej oziroma skrbnik lahko odloči o ceni.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteId)
      || !["approve", "reject"].includes(decision)) return error("Neveljaven predračun ali odločitev.");
  const db = await createClient();
  const { data: quote, error: quoteError } = await db.from("quotes")
    .select("service_request_id, content_sha256, evidence_kind, evidence_payload")
    .eq("organization_id", access.organizationId).eq("id", quoteId).maybeSingle();
  const evidence = quote?.evidence_payload as { external_id?: unknown; customer_external_id?: unknown } | null;
  if (quoteError || !quote || quote.evidence_kind !== "quibi_manual_estimate"
      || !evidence || typeof evidence.external_id !== "string"
      || typeof evidence.customer_external_id !== "string") {
    return error("Preverjen predračun ni na voljo.");
  }
  const { data: request } = await db.from("service_requests")
    .select("customer_id, vehicle_id, status").eq("organization_id", access.organizationId)
    .eq("id", quote.service_request_id).is("archived_at", null).maybeSingle();
  if (!request || request.status !== "preparing_offer" || !request.customer_id) {
    return error("Primer ni več pripravljen za pregled cene.");
  }
  const { data: link } = await db.from("integration_links")
    .select("external_id, external_fingerprint, sync_status,quibi_environment")
    .eq("organization_id", access.organizationId).eq("provider", "quibi")
    .eq("entity_type", "customer").eq("entity_id", request.customer_id).maybeSingle();
  if (!link || link.quibi_environment !== quibiLinkEnvironment(process.env) || link.external_id !== evidence.customer_external_id || !["ok", "never_checked"].includes(link.sync_status)) {
    return error("Povezavo Quibijeve stranke je treba znova preveriti.");
  }
  try {
    const quibi = configuredQuibiReadClient();
    const remote = await quibi.customer(link.external_id);
    if (customerFingerprint(remote) !== link.external_fingerprint) {
      return error("Quibijevi podatki stranke so se spremenili.");
    }
    const currentVehicleId = await caseVehicleIsCurrent(db, quibi, access.organizationId, request.customer_id,
      request.vehicle_id, link.external_id);
    if (!currentVehicleId) {
      return error("Vozilo ni več preverjeno povezano s Quibijem. Pred odobritvijo preverite vozilo.");
    }
    const detail = await quibi.estimateDetail(evidence.external_id, link.external_id);
    if (detail.vehicleId && detail.vehicleId !== currentVehicleId) {
      return error("Predračun pripada drugemu Quibijevemu vozilu. Preverite dokument.");
    }
    if (detail.contentSha256 !== quote.content_sha256 || detail.lines.length === 0) {
      return error("Vsebina predračuna se je spremenila. Povežite novo različico pred pregledom.");
    }
  } catch {
    return error("Dejanske vsebine predračuna ni mogoče znova preveriti.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return error("Varna strežniška povezava za dokazila ni nastavljena.");
  const trusted = createPrivilegedClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error: writeError } = await trusted.rpc("review_verified_manual_quote", {
    p_organization_id: access.organizationId,
    p_quote_id: quoteId,
    p_content_sha256: quote.content_sha256,
    p_actor_id: access.userId,
    p_decision: decision,
  });
  const payload = (data ?? {}) as { ok?: boolean; review_status?: string };
  if (writeError || payload.ok !== true || !payload.review_status) {
    return error("Odločitve ni bilo mogoče shraniti. Osvežite primer in poskusite znova.");
  }
  return { ok: true, reviewStatus: payload.review_status };
}

export async function recordManualEstimateDelivery(
  quoteId: string, channel: string, reference: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const access = await requirePhase1OperationalAccess();
  if (!demoEvidenceAllowed(reference)) return error("V demo okolju uporabite sintetično referenco QA-SIM-.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteId)
      || !["email", "sms", "in_person", "other"].includes(channel)
      || reference.trim().length < 4 || reference.trim().length > 200) {
    return error("Navedite veljaven način in referenco dejansko poslanega sporočila.");
  }
  const db = await createClient();
  const { data: quote, error: quoteError } = await db.from("quotes")
    .select("service_request_id, content_sha256, evidence_kind, evidence_payload, internal_review_status")
    .eq("organization_id", access.organizationId).eq("id", quoteId).maybeSingle();
  const evidence = quote?.evidence_payload as { external_id?: unknown; customer_external_id?: unknown } | null;
  if (quoteError || !quote || quote.internal_review_status !== "approved_for_send"
      || quote.evidence_kind !== "quibi_manual_estimate"
      || !evidence || typeof evidence.external_id !== "string"
      || typeof evidence.customer_external_id !== "string") {
    return error("Predračun še ni odobren za pošiljanje.");
  }
  const { data: request } = await db.from("service_requests")
    .select("customer_id, vehicle_id, status").eq("organization_id", access.organizationId)
    .eq("id", quote.service_request_id).is("archived_at", null).maybeSingle();
  if (!request || request.status !== "preparing_offer" || !request.customer_id) {
    return error("Primer ni v stanju za prvo evidentiranje dostave.");
  }
  const [{ data: customer }, { data: link }] = await Promise.all([
    db.from("customers").select("display_name, phone, email")
      .eq("organization_id", access.organizationId).eq("id", request.customer_id)
      .is("archived_at", null).maybeSingle(),
    db.from("integration_links").select("external_id, local_fingerprint, external_fingerprint, sync_status")
      .eq("organization_id", access.organizationId).eq("provider", "quibi")
      .eq("entity_type", "customer").eq("entity_id", request.customer_id).maybeSingle(),
  ]);
  if (!customer || !link || link.external_id !== evidence.customer_external_id
      || !["ok", "never_checked"].includes(link.sync_status)
      || customerFingerprint({ name: customer.display_name, phone: customer.phone ?? "", email: customer.email ?? "" }) !== link.local_fingerprint) {
    return error("Povezavo stranke s Quibijem je treba znova preveriti.");
  }
  try {
    const quibi = configuredQuibiReadClient();
    const remote = await quibi.customer(link.external_id);
    if (customerFingerprint(remote) !== link.external_fingerprint) {
      return error("Quibijevi podatki stranke so se spremenili.");
    }
    const currentVehicleId = await caseVehicleIsCurrent(db, quibi, access.organizationId, request.customer_id,
      request.vehicle_id, link.external_id);
    if (!currentVehicleId) {
      return error("Vozilo ni več preverjeno povezano s Quibijem. Pred dostavo preverite vozilo.");
    }
    const listed = await quibi.estimates(link.external_id);
    if (!listed.some((item) => item.id === evidence.external_id)) {
      return error("Predračun ni več na seznamu potrjene stranke.");
    }
    const detail = await quibi.estimateDetail(evidence.external_id, link.external_id);
    if (detail.vehicleId && detail.vehicleId !== currentVehicleId) {
      return error("Predračun pripada drugemu Quibijevemu vozilu. Preverite dokument.");
    }
    if (detail.lines.length === 0 || detail.contentSha256 !== quote.content_sha256) {
      return error("Quibijev predračun se je spremenil. Pred pošiljanjem povežite in odobrite novo različico.");
    }
  } catch {
    return error("Dejanskega Quibijevega predračuna ni bilo mogoče preveriti pred dostavo.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return error("Varna strežniška povezava za dokazila ni nastavljena.");
  const trusted = createPrivilegedClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error: writeError } = await trusted.rpc("record_manual_estimate_delivery", {
    p_organization_id: access.organizationId, p_quote_id: quoteId,
    p_content_sha256: quote.content_sha256, p_actor_id: access.userId,
    p_channel: channel, p_reference: reference.trim(),
  });
  if (writeError || (data as { ok?: boolean } | null)?.ok !== true) {
    return error("Dostave ni bilo mogoče shraniti. Preverite različico in poskusite znova.");
  }
  return { ok: true };
}

export async function recordManualEstimateDecision(
  quoteId: string, decision: "approved" | "rejected", reference: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const access = await requirePhase1OperationalAccess();
  if (!demoEvidenceAllowed(reference)) return error("V demo okolju uporabite sintetično referenco QA-SIM-.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteId)
      || !["approved", "rejected"].includes(decision)
      || reference.trim().length < 4 || reference.trim().length > 200) {
    return error("Navedite veljavno odločitev in referenco strankinega odgovora.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return error("Varna strežniška povezava za dokazila ni nastavljena.");
  const trusted = createPrivilegedClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error: writeError } = await trusted.rpc("record_manual_estimate_decision", {
    p_organization_id: access.organizationId, p_quote_id: quoteId,
    p_actor_id: access.userId, p_decision: decision, p_reference: reference.trim(),
  });
  if (writeError || (data as { ok?: boolean } | null)?.ok !== true) {
    return error("Odločitve ni bilo mogoče shraniti. Preverite stanje primera.");
  }
  return { ok: true };
}
