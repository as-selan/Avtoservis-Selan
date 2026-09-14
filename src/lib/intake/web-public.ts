import {
  WEB_INTAKE_ALLOWED_BODY_KEYS,
  WEB_INTAKE_MAX_BODY_BYTES,
} from "@/lib/intake/web-limits";
import { validateWebIntakeForm, type WebIntakeInput } from "@/lib/intake/web-validate";

export const WEB_INTAKE_SUCCESS_MESSAGE =
  "Hvala. Vaše povpraševanje smo prejeli.";

export const WEB_INTAKE_GENERIC_ERROR_MESSAGE =
  "Povpraševanja trenutno ni mogoče poslati. Poskusite znova.";

export const WEB_INTAKE_VALIDATION_ERROR_MESSAGE =
  "Preverite označena polja in poskusite znova.";

export type WebIntakePublicSuccess = {
  ok: true;
  message: string;
};

export type WebIntakePublicFailure = {
  ok: false;
  message: string;
  fieldErrors?: Record<string, string>;
};

export type WebIntakePublicResponse =
  | WebIntakePublicSuccess
  | WebIntakePublicFailure;

const ALLOWED_KEYS = new Set<string>(WEB_INTAKE_ALLOWED_BODY_KEYS);

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function publicWebIntakeSuccess(): WebIntakePublicSuccess {
  return { ok: true, message: WEB_INTAKE_SUCCESS_MESSAGE };
}

export function publicWebIntakeFailure(opts?: {
  fieldErrors?: Record<string, string>;
}): WebIntakePublicFailure {
  const fieldErrors =
    opts?.fieldErrors && Object.keys(opts.fieldErrors).length > 0
      ? opts.fieldErrors
      : undefined;
  return {
    ok: false,
    message: fieldErrors
      ? WEB_INTAKE_VALIDATION_ERROR_MESSAGE
      : WEB_INTAKE_GENERIC_ERROR_MESSAGE,
    ...(fieldErrors ? { fieldErrors } : {}),
  };
}

/**
 * Strip any internal identifiers / RPC metadata from a public response.
 * Success and failure look the same regardless of create vs reuse.
 */
export function sanitizeWebIntakePublicResponse(
  value: unknown,
): WebIntakePublicResponse {
  if (
    value &&
    typeof value === "object" &&
    "ok" in value &&
    (value as { ok: unknown }).ok === true
  ) {
    return publicWebIntakeSuccess();
  }

  const fieldErrors =
    value &&
    typeof value === "object" &&
    "fieldErrors" in value &&
    (value as { fieldErrors?: unknown }).fieldErrors &&
    typeof (value as { fieldErrors?: unknown }).fieldErrors === "object"
      ? Object.fromEntries(
          Object.entries(
            (value as { fieldErrors: Record<string, unknown> }).fieldErrors,
          ).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        )
      : undefined;

  return publicWebIntakeFailure(
    fieldErrors && Object.keys(fieldErrors).length > 0
      ? { fieldErrors }
      : undefined,
  );
}

export function isSameOriginRequest(request: Request, origin: string): boolean {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin) {
    return requestOrigin === origin;
  }
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === origin;
  } catch {
    return false;
  }
}

export function isJsonContentType(request: Request): boolean {
  const value = request.headers.get("content-type") ?? "";
  return value.toLowerCase().startsWith("application/json");
}

export function isOversizedContentLength(request: Request): boolean {
  const raw = request.headers.get("content-length");
  if (!raw) return false;
  const n = Number(raw);
  if (!Number.isFinite(n)) return true;
  return n > WEB_INTAKE_MAX_BODY_BYTES;
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export type BoundedBodyRead =
  | { ok: true; text: string }
  | { ok: false };

/**
 * Read at most WEB_INTAKE_MAX_BODY_BYTES from the request stream.
 * Stops and cancels as soon as the UTF-8 byte budget is exceeded.
 * Does not buffer an unbounded body first.
 */
export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number = WEB_INTAKE_MAX_BODY_BYTES,
): Promise<BoundedBodyRead> {
  const body = request.body;
  if (!body) {
    return { ok: true, text: "" };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false };
      }
      chunks.push(value);
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // ignore cancel failure after a read error
    }
    return { ok: false };
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(merged) };
  } catch {
    return { ok: false };
  }
}

export type ParsedWebIntakeBody =
  | { ok: true; honeypotTriggered: true }
  | { ok: true; honeypotTriggered: false; raw: Parameters<typeof validateWebIntakeForm>[0] }
  | { ok: false };

/**
 * Pick only allowed public form keys. Browser-controlled org/source/status
 * fields are ignored even if present.
 */
export function parseWebIntakeBody(text: string): ParsedWebIntakeBody {
  if (utf8ByteLength(text) > WEB_INTAKE_MAX_BODY_BYTES) {
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

  const honeypot = asString(picked.companyWebsite);
  if (honeypot.trim() !== "") {
    return { ok: true, honeypotTriggered: true };
  }

  return {
    ok: true,
    honeypotTriggered: false,
    raw: {
      displayName: asString(picked.displayName),
      phone: asString(picked.phone),
      email: asString(picked.email),
      vin: asString(picked.vin),
      registration: asString(picked.registration),
      make: asString(picked.make),
      model: asString(picked.model),
      year: asString(picked.year),
      powerKw: asString(picked.powerKw),
      engine: asString(picked.engine),
      engineType: asString(picked.engineType),
      fuel: asString(picked.fuel),
      mileage: asString(picked.mileage),
      serviceWanted: asString(picked.serviceWanted),
      problemDescription: asString(picked.problemDescription),
      bringsOwnMaterial: picked.bringsOwnMaterial === true,
      clientRequestId: asString(picked.clientRequestId),
    },
  };
}

export function toRpcArgs(input: WebIntakeInput): {
  p_client_request_id: string;
  p_display_name: string;
  p_phone: string | null;
  p_email: string | null;
  p_vin: string | null;
  p_registration: string | null;
  p_make: string | null;
  p_model: string | null;
  p_year: number | null;
  p_power_kw: number | null;
  p_engine: string | null;
  p_engine_type: string | null;
  p_fuel: string | null;
  p_mileage_reported_km: number | null;
  p_service_wanted: string | null;
  p_problem_description: string | null;
  p_brings_own_material: boolean;
} {
  return {
    p_client_request_id: input.clientRequestId,
    p_display_name: input.displayName,
    p_phone: input.phone,
    p_email: input.email,
    p_vin: input.vin,
    p_registration: input.registration,
    p_make: input.make,
    p_model: input.model,
    p_year: input.year,
    p_power_kw: input.powerKw,
    p_engine: input.engine,
    p_engine_type: input.engineType,
    p_fuel: input.fuel,
    p_mileage_reported_km: input.mileageReportedKm,
    p_service_wanted: input.serviceWanted,
    p_problem_description: input.problemDescription,
    p_brings_own_material: input.bringsOwnMaterial,
  };
}
