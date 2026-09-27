"use server";

import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; message: string };
const invalid = (message: string): Result => ({ ok: false, message });
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

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
  return error || (data as { ok?: boolean } | null)?.ok !== true
    ? invalid("Terminov ni bilo mogoče predlagati. Preverite primer in obstoječe ponudbe terminov.")
    : { ok: true };
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
  return error || (data as { ok?: boolean } | null)?.ok !== true
    ? invalid("Koraka termina ni bilo mogoče shraniti. Preverite stanje ponudbe in razpoložljivost.")
    : { ok: true };
}
