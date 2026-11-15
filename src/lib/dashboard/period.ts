import type { DashboardPeriodId } from "./types";
import { getZonedParts, toZonedDateString, zonedDateTimeToUtc } from "./zoned-time.ts";

export interface PeriodOption {
  id: DashboardPeriodId;
  label: string;
}

export const DASHBOARD_PERIOD_OPTIONS: PeriodOption[] = [
  { id: "vsi", label: "Vsi datumi" },
  { id: "danes", label: "Danes" },
  { id: "ta_teden", label: "Ta teden" },
  { id: "ta_mesec", label: "Zadnji mesec" },
  { id: "po_zelji", label: "Po izbiri" },
];

/** Last activity is compared using Ljubljana calendar days, including both bounds. */
export function isDateInPeriod(isoDate: string, period: DashboardPeriodId, now: Date, range: {from: string; to: string} = {from: '', to: ''}): boolean {
  if (period === 'vsi') return true;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return false;
  const target = toZonedDateString(date);
  const today = toZonedDateString(now);
  if (period === 'po_zelji') return (!range.from || target >= range.from) && (!range.to || target <= range.to);
  if (period === 'danes') return target === today;
  const p = getZonedParts(now);
  const day = Date.UTC(p.year, p.month - 1, p.day);
  const daysBack = period === 'ta_teden' ? (p.weekday === 0 ? 6 : p.weekday - 1) : 29;
  const start = new Date(day - daysBack * 86400000).toISOString().slice(0, 10);
  const end = period === 'ta_teden' ? new Date(day + (6 - daysBack) * 86400000).toISOString().slice(0, 10) : today;
  return target >= start && target <= end;
}

/** Local-noon Instant for a YYYY-MM-DD workshop date (for appointment filtering). */
export function workshopDateToNoonIso(dateYmd: string): string {
  const year = Number(dateYmd.slice(0, 4));
  const month = Number(dateYmd.slice(5, 7));
  const day = Number(dateYmd.slice(8, 10));
  return zonedDateTimeToUtc(year, month, day, 12, 0).toISOString();
}
