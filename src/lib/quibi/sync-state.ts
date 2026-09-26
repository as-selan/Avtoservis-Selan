export type QuibiSyncStatus = "ok" | "remote_changed" | "error";

export function syncOutcome(confirmed: string, observed: string) {
  return {
    sync_status: confirmed === observed ? "ok" as const : "remote_changed" as const,
    last_seen_fingerprint: observed,
    last_error_code: null,
  };
}

export function readFailureCode(error: unknown): string {
  if (!(error instanceof Error)) return "QUIBI_READ_FAILED";
  if (error.message === "QUIBI_NOT_CONFIGURED") return "QUIBI_NOT_CONFIGURED";
  if (/^QUIBI_HTTP_5\d\d$/.test(error.message)) return "QUIBI_UNAVAILABLE";
  if (/^QUIBI_HTTP_4\d\d$/.test(error.message)) return "QUIBI_ACCESS_DENIED";
  if (/^QUIBI_(API_ERROR|INVALID_RESPONSE|INVALID_CUSTOMER_ID|CUSTOMER_ID_MISMATCH)$/.test(error.message)) {
    return "QUIBI_INVALID_RESPONSE";
  }
  return "QUIBI_READ_FAILED";
}
