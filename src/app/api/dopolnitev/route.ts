import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashCompletionToken } from "@/lib/completion/token";
import { COMPLETION_MAX_BODY_BYTES } from "@/lib/completion/constants";
import { validateCompletionFields } from "@/lib/completion/validate";
import {
  isJsonContentType,
  isOversizedCompletionContentLength,
  isSameOriginRequest,
  parseCompletionBody,
  publicCompletionUnavailable,
  readBearerToken,
  readBoundedRequestBody,
  sanitizeCompletionPublicResponse,
  toSubmitRpcArgs,
} from "@/lib/completion/public";

export const runtime = "nodejs";

function json(body: unknown, status = 200): NextResponse {
  const sanitized = sanitizeCompletionPublicResponse(body);
  const response = NextResponse.json(sanitized, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request, request.nextUrl.origin)) {
    return json(publicCompletionUnavailable(), 400);
  }

  if (!isJsonContentType(request) || isOversizedCompletionContentLength(request)) {
    return json(publicCompletionUnavailable(), 400);
  }

  const rawToken = readBearerToken(request);
  if (!rawToken) {
    return json(publicCompletionUnavailable(), 400);
  }

  let text: string;
  try {
    const bounded = await readBoundedRequestBody(
      request,
      COMPLETION_MAX_BODY_BYTES,
    );
    if (!bounded.ok) {
      return json(publicCompletionUnavailable(), 400);
    }
    text = bounded.text;
  } catch {
    return json(publicCompletionUnavailable(), 400);
  }

  const parsed = parseCompletionBody(text);
  if (!parsed.ok) {
    return json(publicCompletionUnavailable(), 400);
  }

  const tokenHash = hashCompletionToken(rawToken);

  try {
    const supabase = await createClient();

    if (parsed.action === "resolve") {
      const { data, error } = await supabase.rpc(
        "resolve_service_request_completion",
        { p_token_hash: tokenHash },
      );
      if (error) {
        return json(publicCompletionUnavailable(), 400);
      }
      const payload = (data ?? {}) as { ok?: boolean };
      if (payload.ok !== true) {
        return json(publicCompletionUnavailable(), 400);
      }
      return json(payload, 200);
    }

    const validated = validateCompletionFields(parsed.raw);
    if (!validated.ok) {
      return json(publicCompletionUnavailable(), 400);
    }

    const { data, error } = await supabase.rpc(
      "submit_service_request_completion",
      toSubmitRpcArgs(tokenHash, validated.input),
    );

    if (error) {
      return json(publicCompletionUnavailable(), 400);
    }

    const payload = (data ?? {}) as { ok?: boolean };
    if (payload.ok !== true) {
      return json(publicCompletionUnavailable(), 400);
    }
    return json(payload, 200);
  } catch {
    return json(publicCompletionUnavailable(), 400);
  }
}
