import {
  CUSTOMER_DECISION_APPROVED,
  CUSTOMER_DECISION_EXPIRED,
  CUSTOMER_DECISION_REJECTED,
  CUSTOMER_DELIVERY_DELIVERED,
  CUSTOMER_DELIVERY_NOT_DELIVERED,
  QUOTE_INTERNAL_REVIEW_APPROVED_FOR_SEND,
  QUOTE_INTERNAL_REVIEW_REJECTED_FOR_REVISION,
  QUOTE_INTERNAL_REVIEW_UNREVIEWED,
} from "@/lib/offer-approval/constants";

export type QuoteInternalReviewStatus =
  | typeof QUOTE_INTERNAL_REVIEW_UNREVIEWED
  | typeof QUOTE_INTERNAL_REVIEW_APPROVED_FOR_SEND
  | typeof QUOTE_INTERNAL_REVIEW_REJECTED_FOR_REVISION;

export type CustomerDeliveryStatus =
  | typeof CUSTOMER_DELIVERY_NOT_DELIVERED
  | typeof CUSTOMER_DELIVERY_DELIVERED;

export type CustomerOfferDecision =
  | typeof CUSTOMER_DECISION_APPROVED
  | typeof CUSTOMER_DECISION_REJECTED
  | typeof CUSTOMER_DECISION_EXPIRED;

/**
 * Provider-neutral immutable quote version reference.
 * Does not include invented prices, labour, parts, VAT, or external IDs.
 * Evidence payload shape is owned by a future real evidence writer.
 */
export type QuoteVersionRef = {
  id: string;
  organizationId: string;
  serviceRequestId: string;
  offerPreparationId: string;
  versionNo: number;
  contentSha256: string;
  internalReviewStatus: QuoteInternalReviewStatus;
};

export type CustomerApprovalRef = {
  id: string;
  organizationId: string;
  serviceRequestId: string;
  quoteId: string;
  contentSha256: string;
  deliveryStatus: CustomerDeliveryStatus;
  customerDecision: CustomerOfferDecision | null;
  /** Nullable until a real view signal exists — never synthesize. */
  viewedAt: string | null;
};
