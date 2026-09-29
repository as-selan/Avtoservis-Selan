"use server";

import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";
import { canAdvancePreliminaryInspection } from "./eligibility";

type Action = "request" | "complete" | "repair_ordered" | "repair_not_ordered";

export async function recordPreliminaryInspection(
  serviceRequestId: string, action: Action, findings?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const access = await requirePhase1OperationalAccess();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serviceRequestId)
      || !["request", "complete", "repair_ordered", "repair_not_ordered"].includes(action)
      || (action === "complete" && (!findings || findings.trim().length < 4 || findings.trim().length > 2000))) {
    return { ok: false, message: "Vnesite veljavne podatke o dejansko opravljenem pregledu." };
  }
  const db = await createClient();
  const { data: request, error: requestError } = await db.from("service_requests")
    .select("status").eq("organization_id", access.organizationId)
    .eq("id", serviceRequestId).is("archived_at", null).maybeSingle();
  if (requestError || !request || !canAdvancePreliminaryInspection(request.status, action)) {
    return { ok: false, message: "Stanje primera ne dopušča tega koraka predhodnega pregleda." };
  }
  const { data, error } = await db.rpc("record_preliminary_inspection", {
    p_service_request_id: serviceRequestId,
    p_action: action,
    p_findings: action === "complete" ? findings?.trim() : null,
  });
  const payload = data as { ok?: boolean; error_code?: string } | null;
  if (error || payload?.ok !== true) {
    const known: Record<string, string> = {
      inspection_not_requested: "Najprej označite, da je predhodni pregled potreben.",
      inspection_not_completed: "Odločitev o popravilu lahko zabeležite šele po opravljenem pregledu.",
      already_completed: "Ugotovitve pregleda so že shranjene; za popravek je potreben skrbniški pregled.",
      decision_already_recorded: "Odločitev o popravilu je že zabeležena; ne prepišem je brez pregleda.",
    };
    return { ok: false, message: known[payload?.error_code ?? ""] ?? "Pregleda ni bilo mogoče shraniti. Preverite stanje primera." };
  }
  return { ok: true };
}
