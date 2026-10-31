import {
  getZonedParts,
  startOfZonedDay,
  zonedDateTimeToUtc,
} from "./zoned-time";

/**
 * Dashboard Termini presentation window length (calendar days, inclusive of today).
 * Configuration only — not a database/model limit.
 */
export const DASHBOARD_APPOINTMENT_WINDOW_DAYS = 14;

/** Max confirmed appointments shown on the Dashboard Termini card. */
export const DASHBOARD_APPOINTMENT_LIST_LIMIT = 5;

/**
 * Add calendar days to a workshop civil date (Europe/Ljubljana parts).
 * Uses UTC civil arithmetic on y/m/d — not raw 24h offsets (DST-safe).
 */
export function addZonedCalendarDays(
  now: Date,
  days: number,
): { year: number; month: number; day: number } {
  const p = getZonedParts(now);
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * Confirmed-appointment query window:
 * [start of today, start of calendar day `windowDays` after today)
 * in Europe/Ljubljana.
 */
export function getAppointmentDashboardWindow(
  now: Date,
  windowDays: number = DASHBOARD_APPOINTMENT_WINDOW_DAYS,
): { start: Date; endExclusive: Date } {
  const start = startOfZonedDay(now);
  const endParts = addZonedCalendarDays(now, windowDays);
  const endExclusive = zonedDateTimeToUtc(
    endParts.year,
    endParts.month,
    endParts.day,
    0,
    0,
  );
  return { start, endExclusive };
}
