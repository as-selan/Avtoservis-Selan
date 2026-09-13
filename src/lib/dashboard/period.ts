import type { DashboardPeriodId } from "./types";
import { DASHBOARD_APPOINTMENT_WINDOW_DAYS } from "./appointment-window";
import { getZonedParts, startOfZonedDay, zonedDateTimeToUtc } from "./zoned-time";

export interface PeriodOption {
  id: DashboardPeriodId;
  label: string;
}

export const DASHBOARD_PERIOD_OPTIONS: PeriodOption[] = [
  { id: "vsi", label: "Vsi datumi" },
  { id: "danes", label: "Danes" },
  { id: "ta_teden", label: "Ta teden" },
  { id: "ta_mesec", label: "Ta mesec" },
  { id: "po_zelji", label: "Po želji" },
];

export const DASHBOARD_PERIOD_HELP =
  `Velja za workflow, aktivne naloge, pozornost in aktivnost. Termini prikazujejo naslednjih ${DASHBOARD_APPOINTMENT_WINDOW_DAYS} dni.`;

/**
 * Period window helper for dashboard filtering (Europe/Ljubljana calendar).
 * Used with real service_request timestamps and a shared reference `now`.
 */
export function isDateInPeriod(
  isoDate: string,
  period: DashboardPeriodId,
  now: Date,
): boolean {
  if (period === "vsi" || period === "po_zelji") {
    return true;
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return true;
  }

  const todayParts = getZonedParts(now);
  const targetParts = getZonedParts(date);

  if (period === "danes") {
    return (
      targetParts.year === todayParts.year &&
      targetParts.month === todayParts.month &&
      targetParts.day === todayParts.day
    );
  }

  if (period === "ta_teden") {
    const todayStart = startOfZonedDay(now);
    const isoWeekday = todayParts.weekday === 0 ? 7 : todayParts.weekday;
    const weekStart = new Date(
      todayStart.getTime() - (isoWeekday - 1) * 24 * 60 * 60 * 1000,
    );
    const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
    const weekEndExclusive = new Date(weekEnd.getTime() + 24 * 60 * 60 * 1000);
    const targetStart = startOfZonedDay(date);
    return targetStart >= weekStart && targetStart < weekEndExclusive;
  }

  if (period === "ta_mesec") {
    return (
      targetParts.year === todayParts.year &&
      targetParts.month === todayParts.month
    );
  }

  return true;
}

/** Local-noon Instant for a YYYY-MM-DD workshop date (for appointment filtering). */
export function workshopDateToNoonIso(dateYmd: string): string {
  const year = Number(dateYmd.slice(0, 4));
  const month = Number(dateYmd.slice(5, 7));
  const day = Number(dateYmd.slice(8, 10));
  return zonedDateTimeToUtc(year, month, day, 12, 0).toISOString();
}
