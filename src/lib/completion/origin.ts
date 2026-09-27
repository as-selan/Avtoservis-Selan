/** A completion capability may only be rendered under an explicitly trusted origin. */
export function configuredCompletionOrigin(raw: string | undefined, isolatedCi: boolean): string | null {
  if (!raw || raw !== raw.trim()) return null;
  let value: URL;
  try { value = new URL(raw); } catch { return null; }
  if (value.username || value.password || value.pathname !== "/" || value.search || value.hash) return null;
  if (raw !== value.origin && raw !== `${value.origin}/`) return null;
  if (value.protocol === "https:") return value.origin;
  if (isolatedCi && value.protocol === "http:" && value.hostname === "127.0.0.1") return value.origin;
  return null;
}
