import { WEB_INTAKE_EMAIL_SHAPE } from "@/lib/intake/web-validate";
import {
  blankToNull,
  normalizeIntakeEmail,
  normalizeIntakePhone,
  normalizeIntakeVin,
} from "@/lib/intake/normalize";
import { COMPLETION_MAX_LENGTH } from "@/lib/completion/constants";

export type CompletionFields = {
  phone: string | null;
  email: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
};

export type CompletionValidation =
  | { ok: true; input: CompletionFields }
  | { ok: false };

function tooLong(value: string | null, max: number): boolean {
  return value != null && value.length > max;
}

/**
 * Server/client shared shape checks. Completeness and overwrite rules are
 * server-authoritative; this only rejects malformed values.
 */
export function validateCompletionFields(raw: {
  phone?: string;
  email?: string;
  vin?: string;
  make?: string;
  model?: string;
}): CompletionValidation {
  const phoneRaw = blankToNull(raw.phone ?? null);
  const emailRaw = blankToNull(raw.email ?? null);
  const vinRaw = blankToNull(raw.vin ?? null);
  const make = blankToNull(raw.make ?? null);
  const model = blankToNull(raw.model ?? null);

  if (tooLong(phoneRaw, COMPLETION_MAX_LENGTH.phone)) return { ok: false };
  if (tooLong(emailRaw, COMPLETION_MAX_LENGTH.email)) return { ok: false };
  if (tooLong(vinRaw, COMPLETION_MAX_LENGTH.vin)) return { ok: false };
  if (tooLong(make, COMPLETION_MAX_LENGTH.make)) return { ok: false };
  if (tooLong(model, COMPLETION_MAX_LENGTH.model)) return { ok: false };

  const phone = normalizeIntakePhone(phoneRaw);
  if (phoneRaw != null && phone == null) return { ok: false };

  const email = normalizeIntakeEmail(emailRaw);
  if (emailRaw != null) {
    if (email == null || !WEB_INTAKE_EMAIL_SHAPE.test(emailRaw)) {
      return { ok: false };
    }
  }

  const vin = normalizeIntakeVin(vinRaw);

  return {
    ok: true,
    input: {
      phone,
      email,
      vin,
      make,
      model,
    },
  };
}
