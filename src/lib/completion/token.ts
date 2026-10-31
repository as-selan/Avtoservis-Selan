import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

export type GeneratedCompletionToken = {
  rawToken: string;
  tokenHash: string;
};

/**
 * Capability token: 32 cryptographically random bytes, base64url raw token.
 * Persist only the SHA-256 hex digest. Never store or log the raw token.
 */
export function generateCompletionToken(): GeneratedCompletionToken {
  const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");
  return {
    rawToken,
    tokenHash: hashCompletionToken(rawToken),
  };
}

export function hashCompletionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function isCompletionTokenHash(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
