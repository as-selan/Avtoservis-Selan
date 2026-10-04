/** Remote demo is an opt-in deployment, never a fallback for preview or production. */
export function assertRemoteDemoConfiguration(env: Record<string, string | undefined> = process.env): void {
  // Existing previews have previously pointed at production data. Any preview
  // built from this branch must explicitly opt into the isolated demo.
  if (env.VERCEL_ENV === "preview" && env.SELAN_REMOTE_DEMO !== "1") {
    throw new Error("PREVIEW_DEMO_CONFIGURATION_REQUIRED");
  }
  if (env.SELAN_REMOTE_DEMO !== "1") return;
  const ref = env.SELAN_DEMO_SUPABASE_PROJECT_REF;
  if (!ref || !/^[a-z0-9]{20}$/.test(ref) || ref === "verxxsjbewmkgoxwqvxo") {
    throw new Error("DEMO_PROJECT_REF_INVALID");
  }
  if (env.VERCEL_ENV !== "preview" || env.SELAN_LOCAL_REVIEW === "1" ||
      env.NEXT_PUBLIC_SELAN_REMOTE_DEMO !== "1" ||
      env.SELAN_FIXED_PRICE_V1 !== "1" ||
      env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co` ||
      !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("DEMO_ISOLATION_REQUIRED");
  }
  const origin = env.PUBLIC_APP_ORIGIN;
  let parsed: URL;
  try { parsed = new URL(origin ?? ""); } catch { throw new Error("DEMO_EXTERNAL_CONFIG_FORBIDDEN"); }
  if (parsed.protocol !== "https:" || parsed.origin !== origin || parsed.username || parsed.password ||
      origin !== env.COMPLETION_PUBLIC_ORIGIN ||
      env.QUIBI_DEV_USERNAME || env.QUIBI_DEV_PASSWORD || env.QUIBI_E2E_ORIGIN) {
    throw new Error("DEMO_EXTERNAL_CONFIG_FORBIDDEN");
  }
}
