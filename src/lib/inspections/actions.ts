"use server";

import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";

type Action = "request" | "complete" | "repair_ordered" | "repair_not_ordered";

export async function recordPreliminaryInspection(
  serviceRequestId: string, action: Action, findings?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requirePhase1OperationalAccess();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serviceRequestId)
      || !["request", "complete", "repair_ordered", "repair_not_ordered"].includes(action)
      || (action === "complete" && (!findings || findings.trim().length < 4 || findings.trim().length > 2000))) {
    return { ok: false, message: "Vnesite veljavne podatke o dejansko opravljenem pregledu." };
  }
  const db = await createClient();
  const { data, error } = await db.rpc("record_preliminary_inspection", {
    p_service_request_id: serviceRequestId,
    p_action: action,
    p_findings: action === "complete" ? findings?.trim() : null,
  });
  if (error || (data as { ok?: boolean } | null)?.ok !== true) {
    return { ok: false, message: "Pregleda ni bilo mogoče shraniti. Preverite stanje primera." };
  }
  return { ok: true };
}
