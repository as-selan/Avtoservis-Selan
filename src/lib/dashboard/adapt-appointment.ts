import type { AppointmentDemo, AppointmentType } from "./types";
import {
  formatZonedClock,
  getZonedParts,
  startOfZonedDay,
  toZonedDateString,
} from "./zoned-time";

/** Canonical M3/appointments foundation `appointment_type` values. */
export type AppointmentDbType = "intake" | "service" | "diagnosis";

const DB_TO_UI_TYPE: Record<AppointmentDbType, AppointmentType> = {
  intake: "sprejem",
  service: "servis",
  diagnosis: "diagnoza",
};

export type AppointmentRow = {
  id: string;
  customer_id: string;
  vehicle_id: string | null;
  appointment_type: string;
  starts_at: string;
};

export type AppointmentCustomerRow = {
  id: string;
  display_name: string;
};

export type AppointmentVehicleRow = {
  id: string;
  make: string | null;
  model: string | null;
  registration_current: string | null;
};

const FALLBACK_CUSTOMER = "Neznana stranka";
const FALLBACK_VEHICLE = "Neznano vozilo";

export function isAppointmentDbType(value: string): value is AppointmentDbType {
  return Object.prototype.hasOwnProperty.call(DB_TO_UI_TYPE, value);
}

/**
 * Map every allowed DB appointment_type to Dashboard presentation type.
 * Unknown values throw — never silently fall through.
 */
export function mapDbAppointmentTypeToUi(type: string): AppointmentType {
  if (!isAppointmentDbType(type)) {
    throw new Error(`Unknown appointment_type: ${type}`);
  }
  return DB_TO_UI_TYPE[type];
}

function formatVehicleLabel(vehicle: AppointmentVehicleRow | undefined): string {
  if (!vehicle) return FALLBACK_VEHICLE;
  const makeModel = [vehicle.make, vehicle.model]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(" ");
  const registration = vehicle.registration_current?.trim() || "";
  if (makeModel && registration) return `${makeModel} · ${registration}`;
  if (makeModel) return makeModel;
  if (registration) return registration;
  return FALLBACK_VEHICLE;
}

/** Compact Slovenian-facing date label for the Termini card. */
export function formatAppointmentDateLabel(
  startsAt: Date,
  now: Date,
): string {
  const dayStart = startOfZonedDay(startsAt);
  const todayStart = startOfZonedDay(now);
  if (dayStart.getTime() === todayStart.getTime()) {
    return "Danes";
  }
  const p = getZonedParts(startsAt);
  return `${p.day}. ${p.month}.`;
}

export function adaptAppointmentToDashboard(
  row: AppointmentRow,
  customer: AppointmentCustomerRow | undefined,
  vehicle: AppointmentVehicleRow | undefined,
  now: Date,
): AppointmentDemo {
  const startsAt = new Date(row.starts_at);
  if (Number.isNaN(startsAt.getTime())) {
    throw new Error("Invalid appointment starts_at");
  }

  return {
    id: row.id,
    dateLabel: formatAppointmentDateLabel(startsAt, now),
    time: formatZonedClock(startsAt),
    customerName: customer?.display_name?.trim() || FALLBACK_CUSTOMER,
    vehicleLabel: formatVehicleLabel(vehicle),
    type: mapDbAppointmentTypeToUi(row.appointment_type),
    date: toZonedDateString(startsAt),
  };
}
