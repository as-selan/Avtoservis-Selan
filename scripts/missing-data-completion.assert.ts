/**
 * Focused assertions for Phase 7 missing-data completion PREP.
 * Run: npx --yes tsx scripts/missing-data-completion.assert.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isPublicUnauthenticatedPath } from "../src/lib/supabase/proxy";
import { generateCompletionToken, hashCompletionToken } from "../src/lib/completion/token";
import { buildCompletionUrl, readCompletionTokenFromHash } from "../src/lib/completion/url";
import { computeCompletionLifecycle } from "../src/lib/completion/lifecycle";
import {
  COMPLETION_API_PATH,
  COMPLETION_LINK_TTL_MS,
  COMPLETION_OFFER_NEXT_ACTION,
  COMPLETION_PATH,
} from "../src/lib/completion/constants";
import {
  parseCompletionBody,
  publicCompletionUnavailable,
  sanitizeCompletionPublicResponse,
} from "../src/lib/completion/public";
import { validateCompletionFields } from "../src/lib/completion/validate";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
}

const sql = read(
  "supabase/migrations/20260928175317_20260914033000_create_service_request_completion_links.sql",
);
const tokenSrc = read("src/lib/completion/token.ts");
const urlSrc = read("src/lib/completion/url.ts");
const actionsSrc = read("src/lib/completion/actions.ts");
const apiSrc = read("src/app/api/dopolnitev/route.ts");
const proxySrc = read("src/lib/supabase/proxy.ts");
const clientSrc = read("src/app/dopolnitev/CompletionClient.tsx");
const pageSrc = read("src/app/dopolnitev/page.tsx");
const tableSrc = read("src/components/dashboard/ServiceOrderTable.tsx");
const cardSrc = read("src/components/dashboard/ServiceOrderMobileCard.tsx");
const docs = [
  read("docs/missing-data-completion-prep-v1.md"),
  read("docs/data-model-auth-design-v1.md"),
  read("docs/implementation-plan.md"),
].join("\n");

const allNew = [
  sql,
  tokenSrc,
  urlSrc,
  actionsSrc,
  apiSrc,
  proxySrc,
  clientSrc,
  pageSrc,
  tableSrc,
  cardSrc,
  read("src/lib/completion/public.ts"),
  read("src/lib/completion/actions.ts"),
  read("src/components/dashboard/CreateCompletionLinkButton.tsx"),
].join("\n");

// A. raw token is not stored in DB model
{
  assert(sql.includes("create table public.service_request_completion_links"), "table exists");
  assert(sql.includes("token_hash text not null"), "stores token_hash");
  assert(!/\braw_token\b/.test(sql), "no raw_token column");
  assert(!/token_plain/.test(sql), "no plaintext token column");
  assert(
    !/^\s*token text/m.test(sql) && !/,\s*token text/.test(sql),
    "no token text column besides token_hash",
  );
  assert(sql.includes("Raw bearer tokens are NEVER stored"), "documents no raw storage");
}

// B. token hash unique + crypto generation
{
  assert(sql.includes("service_request_completion_links_token_hash_unique"), "unique hash");
  assert(tokenSrc.includes("randomBytes(TOKEN_BYTES)"), "crypto randomBytes");
  assert(tokenSrc.includes('createHash("sha256")'), "sha256 hash");
  assert(!tokenSrc.includes("Math.random"), "no Math.random");
  const a = generateCompletionToken();
  const b = generateCompletionToken();
  assert(a.rawToken !== b.rawToken, "raw tokens differ");
  assert(a.tokenHash !== b.tokenHash, "hashes differ");
  assert(a.tokenHash === hashCompletionToken(a.rawToken), "hash matches helper");
  assert(/^[0-9a-f]{64}$/.test(a.tokenHash), "hex sha256 length");
  assert(a.rawToken.includes("_") || a.rawToken.includes("-") || /^[A-Za-z0-9_-]+$/.test(a.rawToken), "base64url");
}

// C. generated URL uses fragment, not query-string token
{
  const url = buildCompletionUrl("https://example.com", "abcTOKEN");
  assert(url === "https://example.com/dopolnitev#token=abcTOKEN", "fragment URL");
  assert(!url.includes("?token="), "not query-string token");
  assert(!url.includes("/dopolnitev/abcTOKEN"), "not path token");
  assert(urlSrc.includes("#token="), "builder uses fragment");
  assert(readCompletionTokenFromHash("#token=abcTOKEN") === "abcTOKEN", "hash reader");
  assert(actionsSrc.includes("buildCompletionUrl"), "issue action returns fragment URL");
}

// D. proxy exposes ONLY exact public completion routes
{
  assert(isPublicUnauthenticatedPath("/dopolnitev"), "/dopolnitev public");
  assert(isPublicUnauthenticatedPath("/api/dopolnitev"), "/api/dopolnitev public");
  assert(!isPublicUnauthenticatedPath("/dopolnitev/extra"), "no prefix leak");
  assert(!isPublicUnauthenticatedPath("/api/dopolnitev/extra"), "no API prefix leak");
  assert(!isPublicUnauthenticatedPath("/api"), "/api not public");
  assert(!isPublicUnauthenticatedPath("/dashboard"), "dashboard protected");
  assert(isPublicUnauthenticatedPath("/povprasevanje"), "phase 6 preserved");
}

// E. unknown/expired/revoked → same generic unavailable
{
  assert(sql.includes("private.completion_public_unavailable()"), "shared unavailable helper");
  const unavailableReturns = sql.match(/completion_public_unavailable\(\)/g);
  assert(
    unavailableReturns !== null && unavailableReturns.length >= 6,
    "unknown/expired/revoked share helper",
  );
  const a = publicCompletionUnavailable();
  const b = publicCompletionUnavailable();
  assert(a.ok === false && b.ok === false && a.message === b.message, "same generic failure");
}

// F. public resolve returns missing field names only
{
  const dirty = {
    ok: true,
    completed: false,
    missing_fields: ["email", "vin"],
    organization_id: "org",
    service_request_id: "sr",
    customer_id: "c",
    vehicle_id: "v",
    phone: "041",
    email: "a@b.com",
    vin: "VIN",
    attention_reason: "secret",
    error_reason: "err",
    assigned_profile_id: "p",
  };
  const clean = sanitizeCompletionPublicResponse(dirty);
  assert(clean.ok === true, "resolve ok");
  if (clean.ok) {
    assert(JSON.stringify(clean.missing_fields) === JSON.stringify(["email", "vin"]), "fields only");
    assert(clean.completed === false, "not completed");
  }
  const readyButUnsubmitted = sanitizeCompletionPublicResponse({
    ok: true, completed: false, missing_fields: [],
  });
  assert(readyButUnsubmitted.ok && readyButUnsubmitted.completed === false,
    "complete data still need the existing submit RPC to advance the same case");
  const leaked = JSON.stringify(clean);
  assert(!leaked.includes("organization_id"), "no org id");
  assert(!leaked.includes("service_request_id"), "no request id");
  assert(!leaked.includes("customer_id"), "no customer id");
  assert(!leaked.includes("attention_reason"), "no attention");
  assert(sql.includes("'missing_fields'"), "missing_fields in SQL public ok");
  assert(!sql.includes("jsonb_build_object(\n    'organization_id'"), "public JSON omits org id");
}

// G + H. SAME service_request; no INSERT of second request
{
  assert(!/insert into public\.service_requests/i.test(sql), "completion RPC never inserts service_requests");
  assert(/update public\.service_requests as sr/.test(sql), "updates same service_requests row");
  assert(sql.includes("Never INSERT a second service_request"), "documented invariant");
  assert(sql.includes("and sr.id = v_request_id"), "updates linked request id");
}

// I. existing non-null customer phone/email never overwritten
{
  assert(
    sql.includes("elsif v_existing_phone is distinct from v_phone_in then"),
    "phone conflict does not overwrite",
  );
  assert(sql.includes("and c.phone is null"), "phone fill only when null");
  assert(
    sql.includes("elsif v_existing_email is distinct from v_email_in then"),
    "email conflict does not overwrite",
  );
  assert(sql.includes("and c.email is null"), "email fill only when null");
}

// J. existing non-null VIN/make/model never overwritten silently
{
  assert(
    sql.includes("elsif v_existing_vin is distinct from v_vin_in then"),
    "VIN conflict attention, no silent overwrite",
  );
  assert(sql.includes("and v.vin is null"), "VIN fill only when null");
  assert(
    sql.includes("elsif v_existing_make is distinct from v_make_in then"),
    "make conflict no overwrite",
  );
  assert(
    sql.includes("elsif v_existing_model is distinct from v_model_in then"),
    "model conflict no overwrite",
  );
}

// K. safe NULL fill works
{
  assert(sql.includes("if v_existing_phone is null then"), "null phone fill");
  assert(sql.includes("if v_existing_email is null then"), "null email fill");
  assert(sql.includes("if v_existing_vin is null then"), "null VIN fill");
  assert(sql.includes("if v_existing_make is null then"), "null make fill");
  assert(sql.includes("if v_existing_model is null then"), "null model fill");
}

// L + M. no vehicle ownership transfer / VIN conflict does not attach other vehicle
{
  assert(!/set\s+customer_id\s*=/.test(sql), "never assign vehicle.customer_id");
  assert(sql.includes("Do not attach another customer's vehicle"), "no attach other vehicle");
  assert(sql.includes("v_vin_other is not null"), "VIN occupied → attention");
  assert(
    /if v_vin_other is not null then[\s\S]*v_attention := true/.test(sql),
    "VIN conflict sets attention without attach",
  );
  assert(
    sql.includes("v_vehicle_owner_id is distinct from v_customer_id"),
    "linked vehicle ownership mismatch is not mutated",
  );
  assert(
    /and v\.customer_id = v_customer_id[\s\S]*and v\.vin is null/.test(sql),
    "VIN fill requires current owner match",
  );
  assert(
    !/has_error\s*=\s*false/.test(sql),
    "completion must not clear has_error",
  );
}

// N. no vehicle + safe completion can create one under same customer
{
  assert(sql.includes("insert into public.vehicles"), "may create vehicle");
  assert(sql.includes("v_customer_id"), "new vehicle under request customer");
  assert(sql.includes("set vehicle_id = v_new_vehicle_id"), "attach to same request");
}

// O. partial completion remains needs_data
{
  assert(sql.includes("v_status := 'needs_data'"), "partial stays needs_data");
  assert(sql.includes("private.compute_intake_completeness"), "recomputes completeness");
}

// P. complete → preparing_offer, empty missing, link completed
{
  const complete = computeCompletionLifecycle({
    phone: "041123456",
    email: "a@b.com",
    vin: "WVWZZZ1JZXW000001",
    make: "VW",
    model: "Golf",
  });
  assert(complete.status === "preparing_offer", "TS maps complete to preparing_offer");
  assert(complete.missing_fields.length === 0, "TS empty missing");
  assert(complete.next_action === COMPLETION_OFFER_NEXT_ACTION, "offer next action");
  assert(sql.includes("v_status := 'preparing_offer'"), "SQL preparing_offer");
  assert(sql.includes("Pripravi ponudbo za pregled."), "SQL next action");
  assert(sql.includes("completed_at = pg_catalog.now()"), "marks link completed");
}

// Q. completed-link retry does not mutate again
{
  assert(
    sql.includes("Completed-link retry: generic successful completed state, no further mutation."),
    "retry documented",
  );
  const retryIdx = sql.indexOf("if v_link.completed_at is not null then");
  const customerUpdateIdx = sql.indexOf("Customer mutation:");
  assert(retryIdx > 0 && retryIdx < customerUpdateIdx, "completed retry returns before mutation");
}

// V3. completed retry is fully read-only (no last_used_at / no UPDATE)
{
  const resolveFn = sql.slice(
    sql.indexOf("create or replace function public.resolve_service_request_completion"),
    sql.indexOf("create or replace function public.submit_service_request_completion"),
  );
  const submitFn = sql.slice(
    sql.indexOf("create or replace function public.submit_service_request_completion"),
  );

  const resolveCompleted = resolveFn.indexOf(
    "Completed-token retry: read-only completed success",
  );
  const resolveCompletedIf = resolveFn.indexOf(
    "if v_link.completed_at is not null then",
  );
  const resolveLastUsed = resolveFn.indexOf(
    "last_used_at only for valid ACTIVE, NON-COMPLETED resolve",
  );
  assert(resolveCompleted > 0, "resolve documents read-only completed retry");
  assert(
    resolveCompletedIf > 0 && resolveCompletedIf < resolveLastUsed,
    "resolve completed branch returns before any last_used_at update",
  );
  const resolveCompletedBlock = resolveFn.slice(
    resolveCompletedIf,
    resolveFn.indexOf("end if;", resolveCompletedIf) + 7,
  );
  assert(
    !/update\s+public\.service_request_completion_links/i.test(
      resolveCompletedBlock,
    ),
    "resolve completed branch has no UPDATE",
  );

  const submitRetryComment = submitFn.indexOf(
    "Completed-link retry: generic successful completed state, no further mutation.",
  );
  const submitRetryIf = submitFn.indexOf(
    "if v_link.completed_at is not null then",
    submitRetryComment,
  );
  const submitRetryBlock = submitFn.slice(
    submitRetryIf,
    submitFn.indexOf("end if;", submitRetryIf) + 7,
  );
  assert(
    !/update\s+/i.test(submitRetryBlock),
    "submit completed retry branch contains no UPDATE",
  );
  assert(
    submitRetryBlock.includes("completion_public_ok(true"),
    "submit completed retry returns completed success",
  );

  const submitNeedsGate = submitFn.indexOf(
    "v_locked_status is distinct from 'needs_data'",
  );
  const submitCustomer = submitFn.indexOf("Customer mutation:");
  assert(
    submitRetryIf > 0 &&
      submitRetryIf < submitNeedsGate &&
      submitNeedsGate < submitCustomer,
    "completed retry is before needs_data/customer/vehicle mutation",
  );

  assert(
    /completed_at = pg_catalog\.now\(\),\s*last_used_at = pg_catalog\.now\(\)/.test(
      submitFn,
    ),
    "initial successful completion may still set completed_at + last_used_at",
  );
  assert(
    submitFn.includes("set last_used_at = pg_catalog.now()\n  where l.id = v_link.id;"),
    "active partial use may still set last_used_at",
  );
  assert(
    resolveFn.includes("last_used_at only for valid ACTIVE, NON-COMPLETED resolve"),
    "active resolve may still set last_used_at after validity checks",
  );
}

// R. regenerated token revokes prior active link
{
  assert(sql.includes("Regeneration revokes prior still-active links"), "revoke on regenerate");
  assert(sql.includes("set revoked_at = pg_catalog.now()"), "sets revoked_at");
}

// S. no service_role
{
  assert(!/service_role/.test(allNew), "no service_role in Phase 7 app/SQL");
  assert(apiSrc.includes("createClient()"), "public API uses cookie/publishable client");
  assert(actionsSrc.includes("createClient()"), "issue uses authenticated client");
}

// T. no Quibi / MyPlanly / Calendar implementation
{
  assert(!/createQuibi|quibiClient|google\.calendar|googleapis.*calendar|myplanlyClient/i.test(allNew), "no integration clients");
  assert(sql.includes("Quibi / offers / appointments / MyPlanly / Calendar are NOT implemented"), "SQL scope stop");
  assert(docs.includes("NOT implemented"), "docs say not implemented");
}

// U. no migration apply or hosted changes
{
  assert(sql.includes("PREPARE ONLY — do not apply"), "migration marked unapplied");
  assert(docs.includes("not applied") || docs.includes("unapplied"), "docs say unapplied");
}

// Token in Authorization header; API hashes before RPC
{
  assert(apiSrc.includes("readBearerToken"), "bearer header");
  assert(apiSrc.includes("hashCompletionToken(rawToken)"), "hash before RPC");
  assert(apiSrc.includes("toSubmitRpcArgs(tokenHash"), "submit RPC gets hash");
  assert(!apiSrc.includes("p_raw_token"), "raw token not an RPC argument");
}

// Bounded body
{
  assert(apiSrc.includes("readBoundedRequestBody"), "bounded body read");
  assert(apiSrc.includes("isOversizedCompletionContentLength"), "content-length fast reject");
}

// Validation TS + SQL
{
  const badEmail = validateCompletionFields({ email: "not-an-email" });
  assert(!badEmail.ok, "malformed email rejected in TS");
  const okPhone = validateCompletionFields({ phone: "041 123 456" });
  assert(okPhone.ok, "phone validates");
  assert(sql.includes("^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$"), "SQL email shape");
}

// Client does not persist token
{
  assert(!clientSrc.includes("localStorage"), "no localStorage");
  assert(!clientSrc.includes("sessionStorage"), "no sessionStorage");
  assert(clientSrc.includes("tokenRef"), "token stays in memory");
}

// Internal UX
{
  assert(tableSrc.includes("Ustvari povezavo za dopolnitev") || tableSrc.includes("CreateCompletionLinkButton"), "table action");
  assert(cardSrc.includes("CreateCompletionLinkButton"), "mobile action");
  assert(tableSrc.includes('order.status === "manjkajo_podatki"'), "needs_data only");
}

// Public UX copy
{
  assert(pageSrc.includes("Dopolnitev podatkov"), "public page title");
  assert(clientSrc.includes(COMPLETION_PATH) || clientSrc.includes("COMPLETION_API_PATH"), "calls public API");
  assert(COMPLETION_API_PATH === "/api/dopolnitev", "exact API path");
}

// TTL 7 days
{
  assert(COMPLETION_LINK_TTL_MS === 7 * 24 * 60 * 60 * 1000, "7-day constant");
  assert(sql.includes("interval '7 days 5 minutes'"), "SQL caps expiry");
}

// Lock order (submit RPC only)
{
  const submitSql = sql.slice(sql.indexOf("submit_service_request_completion"));
  const tokenLock = submitSql.search(/perform pg_advisory_xact_lock\(\s*910006/);
  const requestLock = submitSql.search(/perform pg_advisory_xact_lock\(\s*910005/);
  const phoneLock = submitSql.search(/perform pg_advisory_xact_lock\(\s*910001/);
  const emailLock = submitSql.search(/perform pg_advisory_xact_lock\(\s*910002/);
  const vinLock = submitSql.search(/perform pg_advisory_xact_lock\(\s*910003/);
  assert(tokenLock >= 0 && requestLock >= 0, "completion locks present");
  assert(
    tokenLock < requestLock &&
      requestLock < phoneLock &&
      phoneLock < emailLock &&
      emailLock < vinLock,
    "910006 then 910005 then identity 910001-910003",
  );
  assert(!/pg_advisory_xact_lock\(\s*910004/.test(submitSql), "registration lock unused");
}

// RLS / grants
{
  assert(sql.includes("enable row level security"), "RLS on");
  assert(sql.includes("revoke all on table public.service_request_completion_links from anon"), "no anon table");
  assert(!/grant\s+(select|insert|update|delete|all)\s+on\s+table public\.service_request_completion_links to anon/i.test(sql), "no anon table grant");
  assert(sql.includes("array['owner', 'admin', 'reception']"), "mechanic excluded");
  assert(sql.includes("grant execute on function public.resolve_service_request_completion(text) to anon"), "anon resolve execute");
  const issueGrant = sql.slice(
    sql.indexOf("grant execute on function public.issue_service_request_completion_link"),
    sql.indexOf("grant execute on function public.issue_service_request_completion_link") + 280,
  );
  assert(issueGrant.includes("to authenticated"), "issue granted to authenticated");
  assert(!issueGrant.includes("to anon"), "issue not granted to anon");
}

// Same-org FKs
{
  assert(sql.includes("service_request_completion_links_request_same_org_fk"), "same-org request FK");
  assert(sql.includes("service_request_completion_links_created_by_same_org_fk"), "tenant-safe created_by");
}

// Parse body ignores extra keys
{
  const parsed = parseCompletionBody(
    JSON.stringify({
      action: "submit",
      phone: "041",
      organization_id: "nope",
      service_request_id: "nope",
    }),
  );
  assert(parsed.ok && parsed.action === "submit", "submit parse");
  if (parsed.ok && parsed.action === "submit") {
    assert(!("organization_id" in parsed.raw), "extra keys dropped");
  }
}

// --- Phase 7 V2: stale-link + fragment scrubbing ---

const resolveSql = sql.slice(
  sql.indexOf("create or replace function public.resolve_service_request_completion"),
  sql.indexOf("create or replace function public.submit_service_request_completion"),
);
const submitSqlBody = sql.slice(
  sql.indexOf("create or replace function public.submit_service_request_completion"),
);
const submitForUpdate = submitSqlBody.slice(
  submitSqlBody.indexOf("for update"),
  submitSqlBody.indexOf("Customer mutation:"),
);

// A. submit locked request requires CURRENT status = needs_data
{
  assert(
    /select sr\.customer_id, sr\.vehicle_id, sr\.archived_at, sr\.status[\s\S]*for update/.test(
      submitSqlBody,
    ),
    "submit FOR UPDATE reads status",
  );
  assert(
    /v_locked_status is distinct from 'needs_data'/.test(submitForUpdate) ||
      /v_locked_status is distinct from 'needs_data'/.test(submitSqlBody),
    "submit requires locked status needs_data",
  );
  assert(
    submitForUpdate.includes("completion_public_unavailable()") ||
      /v_locked_status is distinct from 'needs_data'[\s\S]*completion_public_unavailable\(\)/.test(
        submitSqlBody,
      ),
    "non-needs_data submit returns unavailable before mutation",
  );
}

// B. stale active link cannot mutate/reopen advanced/terminal statuses
{
  assert(
    sql.includes("Stale links must not mutate/reopen"),
    "stale-link reopen prevention documented in SQL",
  );
  const mutationIdx = submitSqlBody.indexOf("Customer mutation:");
  const statusGateIdx = submitSqlBody.indexOf(
    "v_locked_status is distinct from 'needs_data'",
  );
  assert(statusGateIdx > 0 && statusGateIdx < mutationIdx, "status gate before mutation");
  for (const status of [
    "cancelled",
    "declined",
    "closed",
    "converted",
    "preparing_offer",
    "awaiting_customer_approval",
    "appointment_confirmed",
  ]) {
    assert(
      status !== "needs_data",
      `${status} is not needs_data (stale gate rejects by equality)`,
    );
  }
  assert(
    !/v_locked_status in \(/i.test(submitSqlBody),
    "gate is exact needs_data equality, not an allowlist of terminals",
  );
}

// C. resolve also requires non-completed request status = needs_data
{
  assert(
    resolveSql.includes("v_request_status is distinct from 'needs_data'"),
    "resolve requires needs_data",
  );
  assert(
    /Active \(non-completed\) links are only usable while the request remains/.test(
      resolveSql,
    ),
    "resolve documents needs_data requirement",
  );
  const completedRetry = resolveSql.indexOf("if v_link.completed_at is not null then");
  const needsDataGate = resolveSql.indexOf(
    "v_request_status is distinct from 'needs_data'",
  );
  assert(
    completedRetry > 0 && completedRetry < needsDataGate,
    "completed resolve retry happens before needs_data gate",
  );
}

// D. request archived → unavailable
{
  assert(
    resolveSql.includes("v_request_archived is not null"),
    "resolve rejects archived request",
  );
  assert(
    /v_archived is not null/.test(submitForUpdate) ||
      /or v_archived is not null/.test(submitSqlBody),
    "submit rejects archived request",
  );
}

// E. completed token retry remains success/no mutation
{
  assert(
    submitSqlBody.includes(
      "Completed-link retry: generic successful completed state, no further mutation.",
    ),
    "submit completed retry preserved",
  );
  const submitCompleted = submitSqlBody.indexOf(
    "if v_link.completed_at is not null then",
  );
  const submitNeedsGate = submitSqlBody.indexOf(
    "v_locked_status is distinct from 'needs_data'",
  );
  assert(
    submitCompleted > 0 && submitCompleted < submitNeedsGate,
    "completed submit retry before needs_data gate",
  );
}

// F. CompletionClient scrubs raw fragment after capture
{
  assert(clientSrc.includes("history.replaceState"), "replaceState scrub");
  assert(
    clientSrc.includes("scrubTokenFragmentFromUrl") ||
      clientSrc.includes("replaceState"),
    "fragment scrub helper present",
  );
  assert(
    /replaceState[\s\S]*pathname[\s\S]*search|pathname[\s\S]*search[\s\S]*replaceState/.test(
      clientSrc,
    ),
    "scrub keeps path+search without hash",
  );
}

// G. no localStorage/sessionStorage/query/path token regression
{
  assert(!clientSrc.includes("localStorage"), "V2 no localStorage");
  assert(!clientSrc.includes("sessionStorage"), "V2 no sessionStorage");
  assert(!clientSrc.includes("?token="), "V2 no query token");
  assert(!clientSrc.includes("/dopolnitev/"), "V2 no path token");
  assert(clientSrc.includes("tokenRef"), "V2 token remains in memory");
}

// H. docs no longer claim has_error = false
{
  const prepDoc = read("docs/missing-data-completion-prep-v1.md");
  assert(
    !/has_error\s*=\s*false/.test(prepDoc),
    "docs must not claim has_error = false",
  );
  assert(
    prepDoc.includes("does **not** set `has_error`") ||
      prepDoc.includes("does not set `has_error`") ||
      prepDoc.includes("does **not** set has_error"),
    "docs say identity conflict does not set has_error",
  );
  assert(
    prepDoc.includes("does **not** clear") || prepDoc.includes("NOT cleared"),
    "docs say existing has_error is not cleared",
  );
  assert(
    prepDoc.includes("needs_data") &&
      prepDoc.includes("history.replaceState"),
    "docs cover needs_data validity and fragment scrub",
  );
}

console.log("missing-data-completion.assert: PASS");
