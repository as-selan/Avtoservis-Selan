"use server";

import { createClient } from "@/lib/supabase/server";
import { requireManualIntakeAccess } from "@/lib/intake/access";
import {
  OFFER_APPROVAL_GENERIC_ERROR,
  QUOTE_INTERNAL_REVIEW_APPROVED_FOR_SEND,
  QUOTE_INTERNAL_REVIEW_REJECTED_FOR_REVISION,
} from "@/lib/offer-approval/constants";

export type OfferApprovalActionResult =
  | {
      ok: true;
      quoteId: string;
      internalReviewStatus: string;
    }
  | { ok: false; message: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;

function approvalErrorMessage(code: string | undefined): string {
  switch (code) {
    case "forbidden":
      return "Nimate dovoljenja za pregled ponudbe.";
    case "not_found":
    case "archived":
    case "not_preparing_offer":
    case "hash_mismatch":
    case "prep_not_ready":
    case "not_unreviewed":
    case "stale_version":
    case "not_approved_for_send":
    case "delivery_unavailable":
      return OFFER_APPROVAL_GENERIC_ERROR;
    default:
      return OFFER_APPROVAL_GENERIC_ERROR;
  }
}

type RpcPayload = {
  ok?: boolean;
  error_code?: string;
  quote_id?: string;
  internal_review_status?: string;
  service_request_status?: string;
};

function isValidQuoteArgs(quoteId: string, contentSha256: string): boolean {
  return (
    typeof quoteId === "string" &&
    UUID_RE.test(quoteId) &&
    typeof contentSha256 === "string" &&
    SHA256_RE.test(contentSha256)
  );
}

/**
 * Owner/admin/reception only. Approves an existing immutable quote version
 * for later customer delivery. Fails closed when no real quote evidence exists.
 * Does not send to the customer and does not invoke OfferDraftProvider.
 */
export async function approveQuoteForSendAction(
  quoteId: string,
  contentSha256: string,
): Promise<OfferApprovalActionResult> {
  const gate = await requireManualIntakeAccess();
  if (!gate.ok) {
    return { ok: false, message: approvalErrorMessage("forbidden") };
  }

  if (!isValidQuoteArgs(quoteId, contentSha256)) {
    return { ok: false, message: approvalErrorMessage("not_found") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_quote_for_send", {
    p_quote_id: quoteId,
    p_content_sha256: contentSha256.toLowerCase(),
  });

  if (error) {
    return { ok: false, message: approvalErrorMessage("unexpected") };
  }

  const payload = (data ?? {}) as RpcPayload;
  if (
    payload.ok !== true ||
    typeof payload.quote_id !== "string" ||
    payload.service_request_status !== "preparing_offer" ||
    payload.internal_review_status !== QUOTE_INTERNAL_REVIEW_APPROVED_FOR_SEND
  ) {
    return {
      ok: false,
      message: approvalErrorMessage(
        payload.ok === true ? "not_preparing_offer" : payload.error_code,
      ),
    };
  }

  return {
    ok: true,
    quoteId: payload.quote_id,
    internalReviewStatus: QUOTE_INTERNAL_REVIEW_APPROVED_FOR_SEND,
  };
}

/**
 * Owner/admin/reception only. Rejects an existing immutable quote version
 * for revision. Fails closed when no real quote evidence exists.
 */
export async function rejectQuoteForRevisionAction(
  quoteId: string,
  contentSha256: string,
): Promise<OfferApprovalActionResult> {
  const gate = await requireManualIntakeAccess();
  if (!gate.ok) {
    return { ok: false, message: approvalErrorMessage("forbidden") };
  }

  if (!isValidQuoteArgs(quoteId, contentSha256)) {
    return { ok: false, message: approvalErrorMessage("not_found") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reject_quote_for_revision", {
    p_quote_id: quoteId,
    p_content_sha256: contentSha256.toLowerCase(),
  });

  if (error) {
    return { ok: false, message: approvalErrorMessage("unexpected") };
  }

  const payload = (data ?? {}) as RpcPayload;
  if (
    payload.ok !== true ||
    typeof payload.quote_id !== "string" ||
    payload.service_request_status !== "preparing_offer" ||
    payload.internal_review_status !==
      QUOTE_INTERNAL_REVIEW_REJECTED_FOR_REVISION
  ) {
    return {
      ok: false,
      message: approvalErrorMessage(
        payload.ok === true ? "not_preparing_offer" : payload.error_code,
      ),
    };
  }

  return {
    ok: true,
    quoteId: payload.quote_id,
    internalReviewStatus: QUOTE_INTERNAL_REVIEW_REJECTED_FOR_REVISION,
  };
}

/**
 * Delivery contract only. Always fails closed in this PREP — no email/provider
 * transport exists. Does not fabricate delivered_at / viewed / awaiting_customer_approval.
 * Does not invoke OfferDraftProvider.
 */
export async function deliverApprovedQuoteAction(
  quoteId: string,
  contentSha256: string,
): Promise<OfferApprovalActionResult> {
  const gate = await requireManualIntakeAccess();
  if (!gate.ok) {
    return { ok: false, message: approvalErrorMessage("forbidden") };
  }

  if (!isValidQuoteArgs(quoteId, contentSha256)) {
    return { ok: false, message: approvalErrorMessage("not_found") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "deliver_approved_quote_to_customer",
    {
      p_quote_id: quoteId,
      p_content_sha256: contentSha256.toLowerCase(),
    },
  );

  if (error) {
    return { ok: false, message: approvalErrorMessage("unexpected") };
  }

  const payload = (data ?? {}) as RpcPayload;
  if (payload.ok === true) {
    // PREP must never treat delivery as successful without a real transport.
    return { ok: false, message: approvalErrorMessage("delivery_unavailable") };
  }

  return {
    ok: false,
    message: approvalErrorMessage(payload.error_code ?? "delivery_unavailable"),
  };
}
