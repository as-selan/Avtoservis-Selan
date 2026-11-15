/** Accept only the two password-setup email flows; never forward arbitrary URLs. */
export function passwordSetupOtpType(value: string | null): "invite" | "recovery" | null {
  return value === "invite" || value === "recovery" ? value : null;
}

/** Legacy Supabase emails may still return to Site URL (/login). */
export function authLinkRedirectTarget(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const type = passwordSetupOtpType(params.get("type"));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!type || !accessToken || !refreshToken) return null;
  const safe = new URLSearchParams({ type, access_token: accessToken, refresh_token: refreshToken });
  return `${type === "recovery" ? "/auth/recovery" : "/auth/accept-invite"}#${safe.toString()}`;
}

/** A PKCE recovery code from a legacy /login redirect goes to the dedicated callback. */
export function recoveryCodeRedirectTarget(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const code = params.get("code");
  if (!code) return null;
  const safe = new URLSearchParams({ code });
  const flowId = params.get("sb_flow_id");
  if (flowId) safe.set("sb_flow_id", flowId);
  return `/auth/recovery?${safe.toString()}`;
}
