import { NextResponse, type NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { createClient as createPrivilegedClient } from "@supabase/supabase-js";
import { validateWebIntakeForm } from "@/lib/intake/web-validate";
import { trustedPublicRequestOrigin } from "@/lib/intake/trusted-origin";
import {
  isJsonContentType,
  isOversizedContentLength,
  isSameOriginRequest,
  parseWebIntakeBody,
  publicWebIntakeFailure,
  publicWebIntakeSuccess,
  readBoundedRequestBody,
  sanitizeWebIntakePublicResponse,
  toRpcArgs,
} from "@/lib/intake/web-public";

export const runtime = "nodejs";

function json(body: unknown, status = 200): NextResponse {
  const sanitized = sanitizeWebIntakePublicResponse(body);
  return NextResponse.json(sanitized, { status });
}

export async function POST(request: NextRequest) {
  const origin = trustedPublicRequestOrigin(process.env.PUBLIC_APP_ORIGIN, request.nextUrl.origin,
    (process.env.CI === "true" && process.env.SELAN_ISOLATED_E2E === "1") ||
      process.env.SELAN_LOCAL_REVIEW === "1");
  if (!origin || !isSameOriginRequest(request, origin)) {
    return json(publicWebIntakeFailure(), 400);
  }

  if (!isJsonContentType(request) || isOversizedContentLength(request)) {
    return json(publicWebIntakeFailure(), 400);
  }

  let text: string;
  try {
    const bounded = await readBoundedRequestBody(request);
    if (!bounded.ok) {
      return json(publicWebIntakeFailure(), 400);
    }
    text = bounded.text;
  } catch {
    return json(publicWebIntakeFailure(), 400);
  }

  const parsed = parseWebIntakeBody(text);
  if (!parsed.ok) {
    return json(publicWebIntakeFailure(), 400);
  }

  if (parsed.honeypotTriggered) {
    return json(publicWebIntakeSuccess(), 200);
  }

  const validated = validateWebIntakeForm(parsed.raw);
  if (!validated.ok) {
    return json(
      publicWebIntakeFailure({
        fieldErrors: validated.fieldErrors,
      }),
      400,
    );
  }

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !secret) return json(publicWebIntakeFailure(), 503);
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (process.env.VERCEL && !forwarded) return json(publicWebIntakeFailure(), 503);
    const clientHash = createHmac("sha256", secret)
      .update("selan-web-intake-client-v1\0")
      .update(forwarded || "unknown-client")
      .digest("hex");
    const supabase = createPrivilegedClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: budget, error: budgetError } = await supabase.rpc("consume_web_intake_budget", {
      p_client_hash: clientHash, p_client_request_id: validated.input.clientRequestId,
    });
    if (budgetError) return json(publicWebIntakeFailure(), 503);
    if ((budget as { ok?: boolean; error_code?: string } | null)?.ok !== true) {
      return json(publicWebIntakeFailure(),
        (budget as { error_code?: string } | null)?.error_code === "limited" ? 429 : 503);
    }
    const { data, error } = await supabase.rpc(
      "create_web_service_request_intake",
      toRpcArgs(validated.input),
    );

    if (error) {
      return json(publicWebIntakeFailure(), 400);
    }

    const payload = (data ?? {}) as { ok?: boolean };
    if (payload.ok === true) {
      return json(publicWebIntakeSuccess(), 200);
    }

    if (payload.ok === false) {
      return json(publicWebIntakeFailure(), 400);
    }

    return json(publicWebIntakeFailure(), 400);
  } catch {
    return json(publicWebIntakeFailure(), 400);
  }
}
