export type QuibiSyncStatus = "ok" | "local_changed" | "remote_changed" | "both_changed" | "error";

export function syncOutcome(confirmedRemote: string, observedRemote: string, confirmedLocal: string, observedLocal: string) {
  const remoteChanged = confirmedRemote !== observedRemote;
  const localChanged = confirmedLocal !== observedLocal;
  const sync_status: QuibiSyncStatus = remoteChanged && localChanged ? "both_changed"
    : remoteChanged ? "remote_changed" : localChanged ? "local_changed" : "ok";
  return {
    sync_status,
    last_seen_fingerprint: observedRemote,
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
