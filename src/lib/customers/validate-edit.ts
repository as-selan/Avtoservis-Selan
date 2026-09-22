import { blankToNull, normalizeIntakeEmail } from "@/lib/intake/normalize";
import { isIntakeFuelDb } from "@/lib/intake/fuel";
import type { IntakeFuelDb } from "@/lib/intake/types";

export type CustomerTypeValue = "individual" | "business";

export type CustomerEditInput = {
  customer_type: CustomerTypeValue;
  display_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

export type VehicleEditInput = {
  registration_current: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  power_kw: number | null;
  engine: string | null;
  engine_type: string | null;
  fuel: IntakeFuelDb | null;
  notes: string | null;
  mileage_latest_km: number | null;
};

export type EditValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; fieldErrors: Record<string, string> };

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

function isValidEmailShape(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateCustomerEdit(raw: {
  customerType: string;
  displayName: string;
  phone: string;
  email: string;
  notes: string;
}): EditValidationResult<CustomerEditInput> {
  const fieldErrors: Record<string, string> = {};

  if (raw.customerType !== "individual" && raw.customerType !== "business") {
    fieldErrors.customerType = "Izberite tip stranke";
  }

  const displayName = blankToNull(raw.displayName);
  if (!displayName) {
    fieldErrors.displayName = "Ime je obvezno";
  }

  const emailRaw = blankToNull(raw.email);
  const email = normalizeIntakeEmail(raw.email);
  if (emailRaw && (!email || !isValidEmailShape(emailRaw))) {
    fieldErrors.email = "Neveljavna e-pošta";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    value: {
      customer_type: raw.customerType as CustomerTypeValue,
      display_name: displayName!,
      phone: blankToNull(raw.phone),
      email,
      notes: blankToNull(raw.notes),
    },
  };
}

export function validateVehicleEdit(raw: {
  registration: string;
  vin: string;
  make: string;
  model: string;
  year: string;
  powerKw: string;
  engine: string;
  engineType: string;
  fuel: string;
  notes: string;
  mileage: string;
}): EditValidationResult<VehicleEditInput> {
  const fieldErrors: Record<string, string> = {};

  const fuelRaw = blankToNull(raw.fuel);
  if (fuelRaw && !isIntakeFuelDb(fuelRaw)) {
    fieldErrors.fuel = "Izberite veljavno gorivo";
  }

  const yearParsed = parseOptionalInt(raw.year, { min: 1886, max: 2100 });
  if (!yearParsed.ok) fieldErrors.year = "Neveljaven letnik";

  const powerParsed = parseOptionalInt(raw.powerKw, { exclusiveMin: 0 });
  if (!powerParsed.ok) fieldErrors.powerKw = "Neveljavna moč";

  const mileageParsed = parseOptionalInt(raw.mileage, { min: 0 });
  if (!mileageParsed.ok) fieldErrors.mileage = "Neveljavni kilometri";

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    value: {
      registration_current: blankToNull(raw.registration),
      vin: blankToNull(raw.vin),
      make: blankToNull(raw.make),
      model: blankToNull(raw.model),
      year: yearParsed.ok ? yearParsed.value : null,
      power_kw: powerParsed.ok ? powerParsed.value : null,
      engine: blankToNull(raw.engine),
      engine_type: blankToNull(raw.engineType),
      fuel: fuelRaw && isIntakeFuelDb(fuelRaw) ? fuelRaw : null,
      notes: blankToNull(raw.notes),
      mileage_latest_km: mileageParsed.ok ? mileageParsed.value : null,
    },
  };
}

/** Map Postgres unique-violation payloads to a VIN form error when applicable. */
export function isVinUniqueViolation(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}): boolean {
  if (error.code !== "23505") return false;
  const hay = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return hay.includes("vin");
}
