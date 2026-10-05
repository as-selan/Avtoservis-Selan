/** Permit only the reviewed hosted project and an explicit Quibi mode in preproduction. */
function preproductionEnvironment(): Record<string, string | undefined> {
  // Direct accesses let Next.js inline the public branch flags from next.config.
  return {
    APP_ENV: process.env.APP_ENV,
    QUIBI_MODE: process.env.QUIBI_MODE,
    SELAN_REMOTE_DEMO: process.env.SELAN_REMOTE_DEMO,
    NEXT_PUBLIC_SELAN_REMOTE_DEMO: process.env.NEXT_PUBLIC_SELAN_REMOTE_DEMO,
    VERCEL_ENV: process.env.VERCEL_ENV,
    SELAN_LOCAL_REVIEW: process.env.SELAN_LOCAL_REVIEW,
    QUIBI_E2E_ORIGIN: process.env.QUIBI_E2E_ORIGIN,
    QUIBI_DEV_USERNAME: process.env.QUIBI_DEV_USERNAME,
    QUIBI_DEV_PASSWORD: process.env.QUIBI_DEV_PASSWORD,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SELAN_FIXED_PRICE_V1: process.env.SELAN_FIXED_PRICE_V1,
    PUBLIC_APP_ORIGIN: process.env.PUBLIC_APP_ORIGIN,
    COMPLETION_PUBLIC_ORIGIN: process.env.COMPLETION_PUBLIC_ORIGIN,
  };
}

export function assertPreproductionQuibiConfiguration(env: Record<string, string | undefined> = preproductionEnvironment()): void {
  if (env.APP_ENV !== "preproduction") return;
  const dev = env.QUIBI_MODE === "dev";
  const origin = env.PUBLIC_APP_ORIGIN;
  let parsed: URL;
  try { parsed = new URL(origin ?? ""); } catch { throw new Error("PREPRODUCTION_CONFIGURATION_REQUIRED"); }
  if (env.VERCEL_ENV !== "preview" || !dev ||
      env.SELAN_REMOTE_DEMO === "1" || env.NEXT_PUBLIC_SELAN_REMOTE_DEMO === "1" ||
      !env.QUIBI_DEV_USERNAME || !env.QUIBI_DEV_PASSWORD ||
      env.SELAN_LOCAL_REVIEW === "1" || env.QUIBI_E2E_ORIGIN ||
      env.NEXT_PUBLIC_SUPABASE_URL !== "https://verxxsjbewmkgoxwqvxo.supabase.co" ||
      !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY ||
      env.SELAN_FIXED_PRICE_V1 !== "1" || parsed.protocol !== "https:" ||
      parsed.origin !== origin || parsed.username || parsed.password ||
      origin !== env.COMPLETION_PUBLIC_ORIGIN) {
    throw new Error("PREPRODUCTION_CONFIGURATION_REQUIRED");
  }
}

export function assertRemoteDemoConfiguration(env: Record<string, string | undefined> = process.env): void {
  // Explicit demo previews require an isolated project. The reviewed DEV
  // Preview uses assertPreproductionQuibiConfiguration instead.
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
