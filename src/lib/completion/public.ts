import {
  COMPLETION_ALLOWED_BODY_KEYS,
  COMPLETION_COMPLETED_MESSAGE,
  COMPLETION_MAX_BODY_BYTES,
  COMPLETION_PARTIAL_MESSAGE,
  COMPLETION_UNAVAILABLE_MESSAGE,
} from "@/lib/completion/constants";
import type { CompletionFields } from "@/lib/completion/validate";
import type { IntakeMissingField } from "@/lib/intake/types";
import {
  isJsonContentType,
  isSameOriginRequest,
  readBoundedRequestBody,
  utf8ByteLength,
} from "@/lib/intake/web-public";

export { isJsonContentType, isSameOriginRequest, readBoundedRequestBody };

const ALLOWED_KEYS = new Set<string>(COMPLETION_ALLOWED_BODY_KEYS);

const MISSING_FIELDS: ReadonlySet<string> = new Set([
  "phone",
  "email",
  "vin",
  "make",
  "model",
]);

export type CompletionPublicUnavailable = {
  ok: false;
  message: string;
};

export type CompletionPublicResolve = {
  ok: true;
  completed: boolean;
  missing_fields: IntakeMissingField[];
  message?: string;
};

export type CompletionPublicResponse =
  | CompletionPublicUnavailable
  | CompletionPublicResolve;

export function publicCompletionUnavailable(): CompletionPublicUnavailable {
  return { ok: false, message: COMPLETION_UNAVAILABLE_MESSAGE };
}

export function publicCompletionResolve(opts: {
  completed: boolean;
  missing_fields: IntakeMissingField[];
}): CompletionPublicResolve {
  if (opts.completed) {
    return {
      ok: true,
      completed: true,
      missing_fields: [],
      message: COMPLETION_COMPLETED_MESSAGE,
    };
  }
  return {
    ok: true,
    completed: false,
    missing_fields: opts.missing_fields,
    message:
      opts.missing_fields.length === 0
        ? COMPLETION_COMPLETED_MESSAGE
        : COMPLETION_PARTIAL_MESSAGE,
  };
}

function asMissingFields(value: unknown): IntakeMissingField[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is IntakeMissingField =>
      typeof item === "string" && MISSING_FIELDS.has(item),
  );
}

/**
 * Public responses may only expose ok / completed / missing field names / message.
 * Strip IDs, PII, attention, org, and any RPC extras.
 */
export function sanitizeCompletionPublicResponse(
  value: unknown,
): CompletionPublicResponse {
  if (
    value &&
    typeof value === "object" &&
    "ok" in value &&
    (value as { ok: unknown }).ok === true
  ) {
    const record = value as {
      completed?: unknown;
      missing_fields?: unknown;
    };
    const completed = record.completed === true;
    const missing = completed ? [] : asMissingFields(record.missing_fields);
    return publicCompletionResolve({
      completed: completed || missing.length === 0,
      missing_fields: missing,
    });
  }
  return publicCompletionUnavailable();
}

export function isOversizedCompletionContentLength(request: Request): boolean {
  const raw = request.headers.get("content-length");
  if (!raw) return false;
  const n = Number(raw);
  if (!Number.isFinite(n)) return true;
  return n > COMPLETION_MAX_BODY_BYTES;
}

export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)/i.exec(header.trim());
  if (!match) return null;
  return match[1] ?? null;
}

export type ParsedCompletionBody =
  | { ok: true; action: "resolve" }
  | {
      ok: true;
      action: "submit";
      raw: {
        phone: string;
        email: string;
        vin: string;
        make: string;
        model: string;
      };
    }
  | { ok: false };

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseCompletionBody(text: string): ParsedCompletionBody {
  if (utf8ByteLength(text) > COMPLETION_MAX_BODY_BYTES) {
    return { ok: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false };
  }

  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false };
  }

  const record = parsed as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (ALLOWED_KEYS.has(key)) {
      picked[key] = record[key];
    }
  }

  const action = asString(picked.action) || "resolve";
  if (action === "resolve") {
    return { ok: true, action: "resolve" };
  }
  if (action !== "submit") {
    return { ok: false };
  }

  return {
    ok: true,
    action: "submit",
    raw: {
      phone: asString(picked.phone),
      email: asString(picked.email),
      vin: asString(picked.vin),
      make: asString(picked.make),
      model: asString(picked.model),
    },
  };
}

export function toSubmitRpcArgs(
  tokenHash: string,
  input: CompletionFields,
): {
  p_token_hash: string;
  p_phone: string | null;
  p_email: string | null;
  p_vin: string | null;
  p_make: string | null;
  p_model: string | null;
} {
  return {
    p_token_hash: tokenHash,
    p_phone: input.phone,
    p_email: input.email,
    p_vin: input.vin,
    p_make: input.make,
    p_model: input.model,
  };
}
