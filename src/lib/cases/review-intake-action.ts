"use server";

import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";
import { prepareOfferAction } from "@/lib/offer-preparation/actions";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function reviewServiceRequestIntake(serviceRequestId: string): Promise<
  { ok: true; prepared: boolean; message: string } | { ok: false; message: string }
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
  // This canonical preparation is idempotent and needs no further business
  // judgement. If it fails, the accepted case remains visible for a retry.
  try {
    const preparation = await prepareOfferAction(serviceRequestId);
    return preparation.ok
      ? { ok: true, prepared: true, message: "Primer je sprejet; podatki za ponudbo so pripravljeni." }
      : { ok: true, prepared: false, message: "Primer je sprejet. Priprava podatkov ni uspela; ponovite jo v primeru." };
  } catch {
    return { ok: true, prepared: false, message: "Primer je sprejet. Priprava podatkov ni uspela; ponovite jo v primeru." };
  }
}
