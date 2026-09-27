"use server";

import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; message: string };
const invalid = (message: string): Result => ({ ok: false, message });
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const slotErrors: Record<string, string> = {
  case_not_ready: "Najprej povežite stranko s primerom.",
  stage_not_ready: "Primer še ni v ustreznem koraku za ta termin.",
  stage_changed: "Stanje primera se je spremenilo. Osvežite primer pred nadaljevanjem.",
  active_offer_exists: "Za ta primer že obstaja aktivna ponudba terminov. Najprej jo dokončajte ali umaknite.",
  slot_expired: "Eden od terminov je že potekel. Ponudbo umaknite in preverite nove možnosti.",
  invalid_status: "Ta korak ni več na voljo. Osvežite primer.",
  booking_already_confirmed: "Termin je že potrjen. Za spremembo je potreben ločen postopek.",
};
function rpcResult(data: unknown, error: unknown, fallback: string): Result {
  if (error) return invalid(fallback);
  const payload = data as { ok?: boolean; error_code?: string } | null;
  if (payload?.ok === true) return { ok: true };
  return invalid(slotErrors[payload?.error_code ?? ""] ?? fallback);
}

export async function proposeManualSlots(
  serviceRequestId: string, appointmentType: "diagnosis" | "service",
  slots: string[], availabilityReference: string,
): Promise<Result> {
  await requirePhase1OperationalAccess();
  if (!uuid(serviceRequestId) || !["diagnosis", "service"].includes(appointmentType)
      || !Array.isArray(slots) || slots.length !== 3 || slots.some((slot) => typeof slot !== "string")
      || new Set(slots).size !== 3
      || slots.some((slot) => !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(slot)
        || Number.isNaN(Date.parse(slot)) || Date.parse(slot) <= Date.now())
      || typeof availabilityReference !== "string"
      || availabilityReference.trim().length < 4 || availabilityReference.trim().length > 200) {
    return invalid("Vnesite tri različne prihodnje termine in referenco dejanskega preverjanja razpoložljivosti.");
  }
  const db = await createClient();
  const { data, error } = await db.rpc("propose_manual_slots", {
    p_service_request_id: serviceRequestId, p_appointment_type: appointmentType,
    p_slot_1: slots[0], p_slot_2: slots[1], p_slot_3: slots[2],
    p_availability_reference: availabilityReference.trim(),
  });
  return rpcResult(data, error, "Terminov ni bilo mogoče predlagati. Poskusite znova.");
}

export async function advanceManualSlotOffer(
  offerId: string, action: "send" | "select" | "confirm" | "cancel",
  reference: string, selectedSlot?: number,
): Promise<Result> {
  await requirePhase1OperationalAccess();
  if (!uuid(offerId) || !["send", "select", "confirm", "cancel"].includes(action)
      || typeof reference !== "string"
      || reference.trim().length < 4 || reference.trim().length > 200
      || (action === "select" && ![1, 2, 3].includes(selectedSlot ?? 0))) {
    return invalid("Navedite veljavno dejansko referenco in izbiro termina.");
  }
  const db = await createClient();
  const { data, error } = await db.rpc("advance_manual_slot_offer", {
    p_offer_id: offerId, p_action: action, p_reference: reference.trim(),
    p_selected_slot: action === "select" ? selectedSlot : null,
  });
  return rpcResult(data, error, "Koraka termina ni bilo mogoče shraniti. Poskusite znova.");
}
