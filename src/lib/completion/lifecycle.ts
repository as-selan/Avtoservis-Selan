import type { IntakeMissingField } from "@/lib/intake/types";
import { computeIntakeCompleteness, computeManualIntakeCompleteness } from "@/lib/intake/completeness";
import {
  COMPLETION_NEEDS_DATA_NEXT_ACTION,
  COMPLETION_OFFER_NEXT_ACTION,
} from "@/lib/completion/constants";

export type CompletionLifecycle = {
  status: "needs_data" | "new";
  missing_fields: IntakeMissingField[];
  next_action: string;
};

/**
 * After completion writes, map the shared V1 completeness rule onto the
 * review state (new). Completion never records a staff review.
 */
export function computeCompletionLifecycle(input: {
  phone: string | null;
  email: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
}, contactPolicy: "manual" | "web" = "web"): CompletionLifecycle {
  const completeness = contactPolicy === "manual"
    ? computeManualIntakeCompleteness(input) : computeIntakeCompleteness(input);
  if (completeness.missing_fields.length === 0) {
    return {
      status: "new",
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
