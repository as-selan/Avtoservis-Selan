/**
 * Deterministic V1 intake normalization (mirrors private.normalize_intake_* SQL).
 *
 * Phone equals: "041 123 456" = "041123456" = "041-123-456" = "(041) 123 456"
 * Does NOT equate "+38641123456" with "041123456" (no country-code folding).
 *
 * Registration match key: uppercase, strip non-alphanumeric.
 * Human-readable plate is preserved separately for storage.
 */

export function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function normalizeIntakeEmail(
  email: string | null | undefined,
): string | null {
  const trimmed = blankToNull(email);
  return trimmed ? trimmed.toLowerCase() : null;
}

export function normalizeIntakeVin(
  vin: string | null | undefined,
): string | null {
  const trimmed = blankToNull(vin);
  return trimmed ? trimmed.toUpperCase() : null;
}

/** Match key only — not the stored registration_current value. */
export function normalizeIntakeRegistration(
  registration: string | null | undefined,
): string | null {
  const trimmed = blankToNull(registration);
  if (!trimmed) return null;
  const key = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return key === "" ? null : key;
}

export function normalizeIntakePhone(
  phone: string | null | undefined,
): string | null {
  const trimmed = blankToNull(phone);
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) {
    const digits = trimmed.replace(/[^\d]/g, "");
    return digits === "" ? null : `+${digits}`;
  }
  const digits = trimmed.replace(/[^\d]/g, "");
  return digits === "" ? null : digits;
}
