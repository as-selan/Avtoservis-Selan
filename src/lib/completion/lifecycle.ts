import type { IntakeMissingField } from "@/lib/intake/types";
import { computeIntakeCompleteness } from "@/lib/intake/completeness";
import {
  COMPLETION_NEEDS_DATA_NEXT_ACTION,
  COMPLETION_OFFER_NEXT_ACTION,
} from "@/lib/completion/constants";

export type CompletionLifecycle = {
  status: "needs_data" | "preparing_offer";
  missing_fields: IntakeMissingField[];
  next_action: string;
};

/**
 * After completion writes, map the shared V1 completeness rule onto the
 * Phase 7 STOP state (preparing_offer). Intake still uses status `new`.
 */
export function computeCompletionLifecycle(input: {
  phone: string | null;
  email: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
}): CompletionLifecycle {
  const completeness = computeIntakeCompleteness(input);
  if (completeness.missing_fields.length === 0) {
    return {
      status: "preparing_offer",
      missing_fields: [],
      next_action: COMPLETION_OFFER_NEXT_ACTION,
    };
  }
  return {
    status: "needs_data",
    missing_fields: completeness.missing_fields,
    next_action: COMPLETION_NEEDS_DATA_NEXT_ACTION,
  };
}
