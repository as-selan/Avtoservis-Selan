import { configuredCompletionOrigin } from "../completion/origin.ts";

/** Prefer a deployment-configured origin over Next's internal localhost URL. */
export function trustedPublicRequestOrigin(
  configured: string | undefined,
  nextOrigin: string,
  isolatedLocal: boolean,
  previewHost?: string | null,
  previewAliases: Array<string | undefined> = [],
): string | null {
  // Vercel can serve the same Preview by an immutable deployment URL and a
  // branch alias. Trust only the request Host when it is one of Vercel's own
  // declared aliases; the caller still checks Origin/Referer against it.
  if (previewHost) {
    if (!/^[a-z0-9-]+\.vercel\.app$/.test(previewHost) ||
        !previewAliases.includes(previewHost)) return null;
    return `https://${previewHost}`;
  }
  if (configured === undefined) return nextOrigin;
  return configuredCompletionOrigin(configured, isolatedLocal);
}

/** CLI Preview deployments need no Git metadata; their own declared hosts remain mandatory. */
export function publicIntakeRequestOrigin(env: Record<string, string | undefined>, nextOrigin: string, host: string | null): string | null {
  const preview = env.VERCEL_ENV === "preview";
  if (preview && !host) return null;
  const isolated = (env.CI === "true" && env.SELAN_ISOLATED_E2E === "1") || env.SELAN_LOCAL_REVIEW === "1";
  const configured = configuredCompletionOrigin(env.PUBLIC_APP_ORIGIN, isolated);
  if (preview && configured && new URL(configured).host === host) return configured;
  return trustedPublicRequestOrigin(env.PUBLIC_APP_ORIGIN, nextOrigin,
    (env.CI === "true" && env.SELAN_ISOLATED_E2E === "1") || env.SELAN_LOCAL_REVIEW === "1",
    preview ? host : undefined, preview ? [env.VERCEL_URL, env.VERCEL_BRANCH_URL] : []);
}
