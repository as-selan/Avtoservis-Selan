"use server";

import { createClient } from "@/lib/supabase/server";
import { requireManualIntakeAccess } from "@/lib/intake/access";
import { COMPLETION_LINK_TTL_MS } from "@/lib/completion/constants";
import { generateCompletionToken } from "@/lib/completion/token";
import { buildCompletionUrl } from "@/lib/completion/url";
import { configuredCompletionOrigin } from "@/lib/completion/origin";

export type IssueCompletionLinkResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

function issueErrorMessage(code: string | undefined): string {
  switch (code) {
    case "forbidden":
      return "Nimate dovoljenja za ustvarjanje povezave za dopolnitev.";
    case "not_needs_data":
      return "Povezavo za dopolnitev lahko ustvarite samo, če manjkajo podatki.";
    default:
      return "Povezave trenutno ni mogoče ustvariti. Poskusite znova.";
  }
}

/**
 * Owner/admin/reception only. Raw token is generated here, hashed, and never
 * written to the database. Regeneration revokes prior active links in SQL.
 */
export async function issueCompletionLinkAction(
  serviceRequestId: string,
): Promise<IssueCompletionLinkResult> {
  const gate = await requireManualIntakeAccess();
  if (!gate.ok) {
    return { ok: false, message: issueErrorMessage("forbidden") };
  }

  if (
    typeof serviceRequestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      serviceRequestId,
    )
  ) {
    return { ok: false, message: issueErrorMessage("unexpected") };
  }

  const origin = configuredCompletionOrigin(
    process.env.COMPLETION_PUBLIC_ORIGIN,
    process.env.CI === "true" && process.env.SELAN_ISOLATED_E2E === "1",
  );
  if (!origin) return { ok: false, message: issueErrorMessage("unexpected") };

  const { rawToken, tokenHash } = generateCompletionToken();
  const expiresAt = new Date(Date.now() + COMPLETION_LINK_TTL_MS).toISOString();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "issue_service_request_completion_link",
    {
      p_service_request_id: serviceRequestId,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
    },
  );

  if (error) {
    return { ok: false, message: issueErrorMessage("unexpected") };
  }

  const payload = (data ?? {}) as { ok?: boolean; error_code?: string };
  if (payload.ok !== true) {
    return { ok: false, message: issueErrorMessage(payload.error_code) };
  }

  return { ok: true, url: buildCompletionUrl(origin, rawToken) };
}
