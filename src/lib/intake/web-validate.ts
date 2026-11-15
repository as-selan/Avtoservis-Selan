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
const STANDARD_VIN = /^[A-HJ-NPR-Z0-9]{17}$/;
const NONSTANDARD_CHASSIS = /^[A-Z0-9][A-Z0-9/-]{0,31}$/;
const NONSTANDARD_VIN_NOTE = "Nestandardna številka šasije: stranka je označila izjemo za vozilo brez standardnega 17-mestnega VIN.";

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
  nonstandardVin: boolean;
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

  const phoneRaw = blankToNull(raw.phone);
  const phone = normalizeIntakePhone(raw.phone);
  const emailRaw = blankToNull(raw.email);
  const email = normalizeIntakeEmail(raw.email);

  if (!phone) {
    fieldErrors.phone = fieldErrors.phone ?? "Vnesite telefonsko številko";
  } else if (!phoneRaw || !/^\+?[\d\s().-]+$/.test(phoneRaw) || !/^\+?\d{6,15}$/.test(phone)) {
    fieldErrors.phone = "Vnesite veljavno telefonsko številko";
  }
  if (!emailRaw) {
    fieldErrors.email = fieldErrors.email ?? "Vnesite e-poštni naslov";
  } else if (!email) {
    fieldErrors.email = "Neveljavna e-pošta";
  } else if (!WEB_INTAKE_EMAIL_SHAPE.test(emailRaw)) {
    fieldErrors.email = "Neveljavna e-pošta";
  }

  const vin = blankToNull(raw.vin)?.toUpperCase() ?? null;
  if (!vin) fieldErrors.vin = fieldErrors.vin ?? "Vnesite VIN ali številko šasije";
  else if (raw.nonstandardVin && !NONSTANDARD_CHASSIS.test(vin)) {
    fieldErrors.vin = "Nestandardna številka šasije sme vsebovati črke, številke, / in -";
  } else if (!raw.nonstandardVin && !STANDARD_VIN.test(vin)) {
    fieldErrors.vin = "Standardni VIN mora imeti 17 znakov brez I, O in Q; za izjemo označite možnost spodaj";
  }
  if (!blankToNull(raw.make)) fieldErrors.make = fieldErrors.make ?? "Vnesite znamko vozila";
  if (!blankToNull(raw.model)) fieldErrors.model = fieldErrors.model ?? "Vnesite model vozila";

  const serviceWanted = blankToNull(raw.serviceWanted);
  const problemDescription = blankToNull(raw.problemDescription);
  if (!serviceWanted && !problemDescription) {
    fieldErrors.serviceWanted =
      fieldErrors.serviceWanted ?? "Vnesite storitev ali opis težave";
    fieldErrors.problemDescription =
      fieldErrors.problemDescription ?? "Vnesite storitev ali opis težave";
  }
  const recordedProblem = raw.nonstandardVin
    ? [problemDescription, NONSTANDARD_VIN_NOTE].filter(Boolean).join("\n\n")
    : problemDescription;
  if (tooLong(recordedProblem, WEB_INTAKE_MAX_LENGTH.problemDescription)) {
    fieldErrors.problemDescription = "Opis je predolg za shranjevanje označene izjeme";
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
      vin,
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
      problemDescription: recordedProblem,
      bringsOwnMaterial: raw.bringsOwnMaterial === true,
      clientRequestId: raw.clientRequestId.trim(),
    },
  };
}
