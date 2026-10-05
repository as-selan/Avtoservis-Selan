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
