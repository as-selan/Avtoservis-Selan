/** Accept only the two password-setup email flows; never forward arbitrary URLs. */
export function passwordSetupOtpType(value: string | null): "invite" | "recovery" | null {
  return value === "invite" || value === "recovery" ? value : null;
}

/** The default Supabase email may return to Site URL (/login) with a session fragment. */
export function authLinkRedirectTarget(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const type = passwordSetupOtpType(params.get("type"));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!type || !accessToken || !refreshToken) return null;
  const safe = new URLSearchParams({ type, access_token: accessToken, refresh_token: refreshToken });
  return `/auth/accept-invite#${safe.toString()}`;
}
