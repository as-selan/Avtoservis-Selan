"use server";

import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";

type Action = "prepare" | "approve" | "communicate" | "accept" | "reject";
type Result = { ok: true; status: string } | { ok: false; message: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const messages: Record<string, string> = {
  not_eligible: "Primer ni pripravljen za izjemo z objavljeno končno ceno. Preverite podatke, pregled in obstoječe predračune.",
  already_prepared: "Za ta primer je že zabeležena druga objavljena cena. Spremembo naj pregleda skrbnik.",
  owner_required: "Končno ceno lahko potrdi samo lastnik ali skrbnik.",
  reference_required: "Vnesite sledljivo referenco dejanskega sporočila ali odgovora.",
  stage_changed: "Stanje primera se je spremenilo. Osvežite stran pred nadaljevanjem.",
  not_prepared: "Najprej zabeležite objavljeno končno ceno.",
};

export async function advancePublishedFixedPriceCase(
  serviceRequestId: string, action: Action,
  input?: { serviceLabel?: string; finalPrice?: string; publishedUrl?: string; reference?: string },
): Promise<Result> {
  const access = await requirePhase1OperationalAccess();
  if (!uuid.test(serviceRequestId) || !["prepare", "approve", "communicate", "accept", "reject"].includes(action)) {
    return { ok: false, message: "Neveljaven servisni primer ali korak." };
  }
  if (action === "approve" && !["owner", "admin"].includes(access.role)) {
    return { ok: false, message: messages.owner_required };
  }
  const label = input?.serviceLabel?.trim() ?? "";
  const price = input?.finalPrice?.trim() ?? "";
  const url = input?.publishedUrl?.trim() ?? "";
  const reference = input?.reference?.trim() ?? "";
  if (action === "prepare" && (
    label.length < 4 || label.length > 200 || !/^\d{1,10}(?:[.,]\d{1,2})?$/.test(price) ||
    !/^https:\/\/[^\s]{4,500}$/.test(url)
  )) return { ok: false, message: "Vnesite storitev, točno objavljeno končno ceno v EUR in spletni naslov HTTPS." };
  if (["communicate", "accept", "reject"].includes(action) && (reference.length < 4 || reference.length > 200)) {
    return { ok: false, message: messages.reference_required };
  }
  const db = await createClient();
  const { data, error } = await db.rpc("advance_published_fixed_price_case", {
    p_service_request_id: serviceRequestId, p_action: action,
    p_service_label: action === "prepare" ? label : null,
    p_final_price_eur: action === "prepare" ? Number(price.replace(",", ".")) : null,
    p_published_url: action === "prepare" ? url : null,
    p_reference: reference || null,
  });
  const payload = data as { ok?: boolean; error_code?: string; status?: string } | null;
  if (error || payload?.ok !== true || typeof payload.status !== "string") {
    return { ok: false, message: messages[payload?.error_code ?? ""] ?? "Koraka ni bilo mogoče shraniti. Preverite stanje primera." };
  }
  return { ok: true, status: payload.status };
}
