/**
 * Workshop calendar helpers — always Europe/Ljubljana so SSR (often UTC host)
 * and the browser produce identical strings/filters for the same Instant.
 */

export const DASHBOARD_TIME_ZONE = "Europe/Ljubljana";

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function getZonedParts(
  date: Date,
  timeZone = DASHBOARD_TIME_ZONE,
): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const values: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    weekday: WEEKDAY_TO_INDEX[values.weekday] ?? 0,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** YYYY-MM-DD in workshop timezone */
export function toZonedDateString(
  date: Date,
  timeZone = DASHBOARD_TIME_ZONE,
): string {
  const p = getZonedParts(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** HH:mm in workshop timezone */
export function formatZonedClock(
  date: Date,
  timeZone = DASHBOARD_TIME_ZONE,
): string {
  const p = getZonedParts(date, timeZone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/**
 * Instant corresponding to y-m-d h:m in the workshop timezone.
 * Corrects via a few Intl iterations (handles CET/CEST).
 */
export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone = DASHBOARD_TIME_ZONE,
): Date {
  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let i = 0; i < 4; i += 1) {
    const parts = getZonedParts(new Date(utcMillis), timeZone);
    const asIfUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      0,
    );
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    utcMillis += wanted - asIfUtc;
  }

  return new Date(utcMillis);
}

export function startOfZonedDay(
  now: Date,
  timeZone = DASHBOARD_TIME_ZONE,
): Date {
  const p = getZonedParts(now, timeZone);
  return zonedDateTimeToUtc(p.year, p.month, p.day, 0, 0, timeZone);
}
