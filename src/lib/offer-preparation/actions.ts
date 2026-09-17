"use server";

import { createClient } from "@/lib/supabase/server";
import { requireManualIntakeAccess } from "@/lib/intake/access";
import {
  OFFER_PREP_GENERIC_ERROR,
  OFFER_PREP_READY_NEXT_ACTION,
  OFFER_PROVIDER_UNCONFIGURED_MESSAGE,
} from "@/lib/offer-preparation/constants";

export type PrepareOfferActionResult =
  | {
      ok: true;
      offerPreparationId: string;
      readyMessage: string;
      unconfiguredMessage: string;
    }
  | { ok: false; message: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function prepareErrorMessage(code: string | undefined): string {
  switch (code) {
    case "forbidden":
      return "Nimate dovoljenja za pripravo ponudbe.";
    case "not_preparing_offer":
    case "archived":
    case "not_found":
    case "incomplete_data":
      return "Ponudbe trenutno ni mogoče pripraviti za ta zahtevek.";
    default:
      return OFFER_PREP_GENERIC_ERROR;
  }
}

type RpcPayload = {
  ok?: boolean;
  error_code?: string;
  offer_preparation_id?: string;
  service_request_status?: string;
};

/**
 * Owner/admin/reception only. Creates or returns the canonical offer_preparation.
 * Does not send to the customer, does not change service_request off preparing_offer,
 * and does not invoke OfferDraftProvider.
 */
export async function prepareOfferAction(
  serviceRequestId: string,
): Promise<PrepareOfferActionResult> {
  const gate = await requireManualIntakeAccess();
  if (!gate.ok) {
    return { ok: false, message: prepareErrorMessage("forbidden") };
  }

  if (typeof serviceRequestId !== "string" || !UUID_RE.test(serviceRequestId)) {
    return { ok: false, message: prepareErrorMessage("unexpected") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("prepare_service_request_offer", {
    p_service_request_id: serviceRequestId,
  });

  if (error) {
    return { ok: false, message: prepareErrorMessage("unexpected") };
  }

  const payload = (data ?? {}) as RpcPayload;
  if (payload.ok !== true || typeof payload.offer_preparation_id !== "string") {
    return { ok: false, message: prepareErrorMessage(payload.error_code) };
  }

  if (payload.service_request_status !== "preparing_offer") {
    return { ok: false, message: prepareErrorMessage("not_preparing_offer") };
  }

  return {
    ok: true,
    offerPreparationId: payload.offer_preparation_id,
    readyMessage: OFFER_PREP_READY_NEXT_ACTION,
    unconfiguredMessage: OFFER_PROVIDER_UNCONFIGURED_MESSAGE,
  };
}
