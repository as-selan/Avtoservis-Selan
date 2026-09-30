"use server";

import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function reviewServiceRequestIntake(serviceRequestId: string): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const access = await requirePhase1OperationalAccess();
  if (!uuid.test(serviceRequestId) || !["owner", "admin"].includes(access.role)) {
    return { ok: false, message: "Sprejem primera lahko potrdi samo lastnik ali skrbnik." };
  }
  const db = await createClient();
  const { data, error } = await db.rpc("review_service_request_intake", {
    p_service_request_id: serviceRequestId,
  });
  const payload = data as { ok?: boolean; error_code?: string } | null;
  if (error || payload?.ok !== true) {
    const messages: Record<string, string> = {
      incomplete_data: "Preverite kontaktne podatke, stranko, vozilo in morebitni nedokončani pregled.",
      stage_changed: "Stanje primera se je spremenilo. Osvežite stran.",
      owner_required: "Sprejem primera lahko potrdi samo lastnik ali skrbnik.",
      not_found: "Primera ni več mogoče najti.",
    };
    return { ok: false, message: messages[payload?.error_code ?? ""] ?? "Sprejema ni bilo mogoče shraniti." };
  }
  return { ok: true };
}
