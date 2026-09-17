import { COMPLETION_PATH } from "@/lib/completion/constants";

/**
 * Capability lives in the URL fragment so the raw token is not sent as a
 * request path or query string.
 */
export function buildCompletionUrl(origin: string, rawToken: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}${COMPLETION_PATH}#token=${rawToken}`;
}

export function readCompletionTokenFromHash(hash: string): string | null {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!trimmed) return null;
  const params = new URLSearchParams(trimmed);
  const token = params.get("token");
  if (!token || token.trim() === "") return null;
  return token;
}
