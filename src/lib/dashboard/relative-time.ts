import { startOfZonedDay } from "./zoned-time";

/**
 * Short Slovenian relative label for dashboard timestamps.
 * Uses workshop calendar day for "včeraj".
 */
export function formatRelativeUpdatedLabel(
  isoDate: string,
  now: Date = new Date(),
): string {
  const then = new Date(isoDate);
  if (Number.isNaN(then.getTime())) {
    return "—";
  }

  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 0) {
    return "pravkar";
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "pravkar";
  if (minutes < 60) return `pred ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    if (hours === 1) return "pred 1 uro";
    if (hours === 2) return "pred 2 urama";
    return `pred ${hours} urami`;
  }

  const thenStart = startOfZonedDay(then);
  const todayStart = startOfZonedDay(now);
  const dayDiff = Math.round(
    (todayStart.getTime() - thenStart.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (dayDiff === 1) return "včeraj";
  if (dayDiff === 2) return "pred 2 dnevoma";
  if (dayDiff > 2) return `pred ${dayDiff} dnevi`;
  return `pred ${hours} urami`;
}
