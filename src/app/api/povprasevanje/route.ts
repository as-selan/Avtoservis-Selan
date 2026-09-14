import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateWebIntakeForm } from "@/lib/intake/web-validate";
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
  if (!isSameOriginRequest(request, request.nextUrl.origin)) {
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
    const supabase = await createClient();
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
