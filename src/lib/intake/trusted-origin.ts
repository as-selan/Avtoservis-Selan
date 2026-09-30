import { configuredCompletionOrigin } from "../completion/origin";

/** Prefer a deployment-configured origin over Next's internal localhost URL. */
export function trustedPublicRequestOrigin(
  configured: string | undefined,
  nextOrigin: string,
  isolatedLocal: boolean,
): string | null {
  if (configured === undefined) return nextOrigin;
  return configuredCompletionOrigin(configured, isolatedLocal);
}
