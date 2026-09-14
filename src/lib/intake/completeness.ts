import type { IntakeCompleteness, IntakeMissingField } from "@/lib/intake/types";
import { blankToNull } from "@/lib/intake/normalize";

/**
 * V1 completeness — mirrored from private.compute_manual_intake_completeness.
 * RPC remains authoritative at write time. Adjust here + SQL together when
 * Quibi required fields are known.
 *
 * status = new only when phone, email, vin, make, and model are all present.
 * Website intake uses the same contract via computeIntakeCompleteness.
 */
export function computeManualIntakeCompleteness(input: {
  phone: string | null;
  email: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
}): IntakeCompleteness {
  const missing: IntakeMissingField[] = [];
  if (!blankToNull(input.phone)) missing.push("phone");
  if (!blankToNull(input.email)) missing.push("email");
  if (!blankToNull(input.vin)) missing.push("vin");
  if (!blankToNull(input.make)) missing.push("make");
  if (!blankToNull(input.model)) missing.push("model");

  if (missing.length === 0) {
    return {
      status: "new",
      missing_fields: [],
      next_action: "Preveri podatke pred pripravo ponudbe.",
    };
  }

  return {
    status: "needs_data",
    missing_fields: missing,
    next_action: "Pridobi manjkajoče podatke stranke ali vozila.",
  };
}

/** Alias — website and manual intake share the V1 completeness contract. */
export const computeIntakeCompleteness = computeManualIntakeCompleteness;
