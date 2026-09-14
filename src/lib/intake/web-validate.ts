import { WEB_INTAKE_MAX_LENGTH } from "@/lib/intake/web-limits";
import type { FuelType } from "@/lib/dashboard/types";
import { isIntakeFuelDb, mapUiFuelToDb } from "@/lib/intake/fuel";
import {
  blankToNull,
  normalizeIntakeEmail,
  normalizeIntakePhone,
} from "@/lib/intake/normalize";
import type { IntakeFuelDb } from "@/lib/intake/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pragmatic email shape; SQL RPC uses the same rule (not a full RFC parser). */
export const WEB_INTAKE_EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type WebIntakeInput = {
  displayName: string;
  phone: string | null;
  email: string | null;
  vin: string | null;
  registration: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  powerKw: number | null;
  engine: string | null;
  engineType: string | null;
  fuel: IntakeFuelDb | null;
  mileageReportedKm: number | null;
  serviceWanted: string | null;
  problemDescription: string | null;
  bringsOwnMaterial: boolean;
  clientRequestId: string;
};

export type WebIntakeValidation =
  | { ok: true; input: WebIntakeInput }
  | { ok: false; fieldErrors: Record<string, string>; formError?: string };

function tooLong(value: string | null, max: number): boolean {
  return value != null && value.length > max;
}

function parseOptionalInt(
  raw: string | null | undefined,
  opts: { min?: number; max?: number; exclusiveMin?: number },
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = blankToNull(raw ?? null);
  if (trimmed == null) return { ok: true, value: null };
  if (!/^-?\d+$/.test(trimmed)) return { ok: false };
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return { ok: false };
  if (opts.min != null && n < opts.min) return { ok: false };
  if (opts.max != null && n > opts.max) return { ok: false };
  if (opts.exclusiveMin != null && n <= opts.exclusiveMin) return { ok: false };
  return { ok: true, value: n };
}

function parseFuel(raw: string | null): IntakeFuelDb | null | "invalid" {
  const trimmed = blankToNull(raw);
  if (!trimmed) return null;
  const fromUi = mapUiFuelToDb(trimmed as FuelType);
  if (fromUi) return fromUi;
  if (isIntakeFuelDb(trimmed)) return trimmed;
  return "invalid";
}

/**
 * Server/client shared validation for public website intake.
 * Does not accept organization_id / source / status / completeness.
 */
export function validateWebIntakeForm(raw: {
  displayName: string;
  phone: string;
  email: string;
  vin: string;
  registration: string;
  make: string;
  model: string;
  year: string;
  powerKw: string;
  engine: string;
  engineType: string;
  fuel: string;
  mileage: string;
  serviceWanted: string;
  problemDescription: string;
  bringsOwnMaterial: boolean;
  clientRequestId: string;
}): WebIntakeValidation {
  const fieldErrors: Record<string, string> = {};

  if (!UUID_RE.test(raw.clientRequestId.trim())) {
    return {
      ok: false,
      fieldErrors,
      formError: "Zahteve ni mogoče poslati. Osvežite stran in poskusite znova.",
    };
  }

  const displayName = blankToNull(raw.displayName);
  if (!displayName) fieldErrors.displayName = "Obvezno polje";
  else if (tooLong(displayName, WEB_INTAKE_MAX_LENGTH.displayName)) {
    fieldErrors.displayName = "Predolgo";
  }

  if (tooLong(blankToNull(raw.phone), WEB_INTAKE_MAX_LENGTH.phone)) {
    fieldErrors.phone = "Predolgo";
  }
  if (tooLong(blankToNull(raw.email), WEB_INTAKE_MAX_LENGTH.email)) {
    fieldErrors.email = "Predolgo";
  }
  if (tooLong(blankToNull(raw.vin), WEB_INTAKE_MAX_LENGTH.vin)) {
    fieldErrors.vin = "Predolgo";
  }
  if (tooLong(blankToNull(raw.registration), WEB_INTAKE_MAX_LENGTH.registration)) {
    fieldErrors.registration = "Predolgo";
  }
  if (tooLong(blankToNull(raw.make), WEB_INTAKE_MAX_LENGTH.make)) {
    fieldErrors.make = "Predolgo";
  }
  if (tooLong(blankToNull(raw.model), WEB_INTAKE_MAX_LENGTH.model)) {
    fieldErrors.model = "Predolgo";
  }
  if (tooLong(blankToNull(raw.engine), WEB_INTAKE_MAX_LENGTH.engine)) {
    fieldErrors.engine = "Predolgo";
  }
  if (tooLong(blankToNull(raw.engineType), WEB_INTAKE_MAX_LENGTH.engineType)) {
    fieldErrors.engineType = "Predolgo";
  }
  if (tooLong(blankToNull(raw.serviceWanted), WEB_INTAKE_MAX_LENGTH.serviceWanted)) {
    fieldErrors.serviceWanted = "Predolgo";
  }
  if (
    tooLong(
      blankToNull(raw.problemDescription),
      WEB_INTAKE_MAX_LENGTH.problemDescription,
    )
  ) {
    fieldErrors.problemDescription = "Predolgo";
  }

  const phone = normalizeIntakePhone(raw.phone);
  const emailRaw = blankToNull(raw.email);
  const email = normalizeIntakeEmail(raw.email);

  if (!phone && !email) {
    fieldErrors.phone = fieldErrors.phone ?? "Vnesite telefon ali e-pošto";
    fieldErrors.email = fieldErrors.email ?? "Vnesite telefon ali e-pošto";
  } else if (emailRaw && !email) {
    fieldErrors.email = "Neveljavna e-pošta";
  } else if (emailRaw && !WEB_INTAKE_EMAIL_SHAPE.test(emailRaw)) {
    fieldErrors.email = "Neveljavna e-pošta";
  }

  const serviceWanted = blankToNull(raw.serviceWanted);
  const problemDescription = blankToNull(raw.problemDescription);
  if (!serviceWanted && !problemDescription) {
    fieldErrors.serviceWanted =
      fieldErrors.serviceWanted ?? "Vnesite storitev ali opis težave";
    fieldErrors.problemDescription =
      fieldErrors.problemDescription ?? "Vnesite storitev ali opis težave";
  }

  let yearValue: number | null = null;
  const yearParsed = parseOptionalInt(raw.year, { min: 1886, max: 2100 });
  if (!yearParsed.ok) fieldErrors.year = "Neveljaven letnik";
  else yearValue = yearParsed.value;

  let mileageValue: number | null = null;
  const mileageParsed = parseOptionalInt(raw.mileage, { min: 0 });
  if (!mileageParsed.ok) fieldErrors.mileage = "Neveljavni kilometri";
  else mileageValue = mileageParsed.value;

  let powerKwValue: number | null = null;
  const powerKwParsed = parseOptionalInt(raw.powerKw, { exclusiveMin: 0 });
  if (!powerKwParsed.ok) fieldErrors.powerKw = "Neveljavna moč (kW)";
  else powerKwValue = powerKwParsed.value;

  const fuelParsed = parseFuel(raw.fuel);
  if (fuelParsed === "invalid") fieldErrors.fuel = "Neveljavna vrsta goriva";

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    input: {
      displayName: displayName!,
      phone: blankToNull(raw.phone),
      email,
      vin: blankToNull(raw.vin),
      registration: blankToNull(raw.registration),
      make: blankToNull(raw.make),
      model: blankToNull(raw.model),
      year: yearValue,
      powerKw: powerKwValue,
      engine: blankToNull(raw.engine),
      engineType: blankToNull(raw.engineType),
      fuel: fuelParsed === "invalid" ? null : fuelParsed,
      mileageReportedKm: mileageValue,
      serviceWanted,
      problemDescription,
      bringsOwnMaterial: raw.bringsOwnMaterial === true,
      clientRequestId: raw.clientRequestId.trim(),
    },
  };
}
