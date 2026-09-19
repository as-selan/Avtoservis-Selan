/** Human-safe generic error — no PII / internal codes. */
export const OFFER_APPROVAL_GENERIC_ERROR =
  "Pregleda ali pošiljanja ponudbe trenutno ni mogoče opraviti.";

export const QUOTE_INTERNAL_REVIEW_UNREVIEWED = "unreviewed" as const;
export const QUOTE_INTERNAL_REVIEW_APPROVED_FOR_SEND =
  "approved_for_send" as const;
export const QUOTE_INTERNAL_REVIEW_REJECTED_FOR_REVISION =
  "rejected_for_revision" as const;

export const CUSTOMER_DELIVERY_NOT_DELIVERED = "not_delivered" as const;
export const CUSTOMER_DELIVERY_DELIVERED = "delivered" as const;

export const CUSTOMER_DECISION_APPROVED = "approved" as const;
export const CUSTOMER_DECISION_REJECTED = "rejected" as const;
export const CUSTOMER_DECISION_EXPIRED = "expired" as const;
