import type { ManualIntakeChannel, ManualIntakeInput } from "@/lib/intake/types";
import {
  blankToNull,
  normalizeIntakeEmail,
  normalizeIntakePhone,
} from "@/lib/intake/normalize";
import { isIntakeFuelDb } from "@/lib/intake/fuel";

const CHANNELS = new Set<ManualIntakeChannel>(["phone", "sms", "manual"]);

export type ClientIntakeValidation =
  | { ok: true; input: ManualIntakeInput }
  | { ok: false; fieldErrors: Record<string, string>; formError?: string };

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

/**
 * Client/server shared validation for manual intake minimum fields.
 * Does not trust organization_id / status / completeness from the browser.
 */
export function validateManualIntakeForm(raw: {
  displayName: string;
  phone: string;
  email: string;
  channel: string;
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
  selectedCustomerId: string | null;
  selectedVehicleId: string | null;
  clientRequestId: string;
}): ClientIntakeValidation {
  const fieldErrors: Record<string, string> = {};

  const displayName = blankToNull(raw.displayName);
  if (!displayName) fieldErrors.fullName = "Obvezno polje";

  if (!blankToNull(raw.clientRequestId)) {
    return {
      ok: false,
      fieldErrors,
      formError: "Manjka identifikator zahteve. Zaprite in znova odprite obrazec.",
    };
  }

  const phone = normalizeIntakePhone(raw.phone);
  const emailRaw = blankToNull(raw.email);
  const email = normalizeIntakeEmail(raw.email);

  if (!phone && !email) {
    fieldErrors.phone = "Vnesite telefon ali e-pošto";
    fieldErrors.email = "Vnesite telefon ali e-pošto";
  } else if (emailRaw && !email) {
    fieldErrors.email = "Neveljavna e-pošta";
  } else if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    fieldErrors.email = "Neveljavna e-pošta";
  }

  const serviceWanted = blankToNull(raw.serviceWanted);
  const problemDescription = blankToNull(raw.problemDescription);
  if (!serviceWanted && !problemDescription) {
    fieldErrors.serviceWanted = "Vnesite storitev ali opis težave";
    fieldErrors.problemDescription = "Vnesite storitev ali opis težave";
  }

  if (!CHANNELS.has(raw.channel as ManualIntakeChannel)) {
    fieldErrors.channel = "Izberite kanal";
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

  const fuelRaw = blankToNull(raw.fuel);
  let fuel: ManualIntakeInput["fuel"] = null;
  if (fuelRaw) {
    if (!isIntakeFuelDb(fuelRaw)) {
      fieldErrors.fuel = "Neveljavna vrsta goriva";
    } else {
      fuel = fuelRaw;
    }
  }

  if (raw.selectedVehicleId && !raw.selectedCustomerId) {
    return {
      ok: false,
      fieldErrors,
      formError:
        "Za izbrano vozilo morate najprej izbrati stranko.",
    };
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    input: {
      displayName: displayName!,
      phone: blankToNull(raw.phone),
      email,
      channel: raw.channel as ManualIntakeChannel,
      vin: blankToNull(raw.vin),
      registration: blankToNull(raw.registration),
      make: blankToNull(raw.make),
      model: blankToNull(raw.model),
      year: yearValue,
      powerKw: powerKwValue,
      engine: blankToNull(raw.engine),
      engineType: blankToNull(raw.engineType),
      fuel,
      mileageReportedKm: mileageValue,
      serviceWanted,
      problemDescription,
      bringsOwnMaterial: raw.bringsOwnMaterial,
      selectedCustomerId: raw.selectedCustomerId,
      selectedVehicleId: raw.selectedVehicleId,
      clientRequestId: raw.clientRequestId.trim(),
    },
  };
}
