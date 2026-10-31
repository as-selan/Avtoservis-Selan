const ljubljana = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Ljubljana", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Rejects nonexistent or ambiguous wall times around daylight-saving changes. */
export function ljubljanaWallTimeToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const matches = ["+01:00", "+02:00"].map((offset) => new Date(`${value}:00${offset}`))
    .filter((date) => !Number.isNaN(date.getTime()))
    .filter((date) => {
      const fields = Object.fromEntries(ljubljana.formatToParts(date).map((part) => [part.type, part.value]));
      return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}` === value;
    });
  return matches.length === 1 ? matches[0].toISOString() : null;
}
