/**
 * Contract/static assertions for Phase 9 offer-review + customer-approval PREP.
 * Run: npx --yes tsx scripts/offer-review-customer-approval.assert.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  OFFER_APPROVAL_GENERIC_ERROR,
  QUOTE_INTERNAL_REVIEW_APPROVED_FOR_SEND,
  QUOTE_INTERNAL_REVIEW_REJECTED_FOR_REVISION,
  QUOTE_INTERNAL_REVIEW_UNREVIEWED,
  CUSTOMER_DELIVERY_NOT_DELIVERED,
  CUSTOMER_DELIVERY_DELIVERED,
  CUSTOMER_DECISION_APPROVED,
  CUSTOMER_DECISION_REJECTED,
  CUSTOMER_DECISION_EXPIRED,
} from "../src/lib/offer-approval/constants";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const MIGRATION =
  "supabase/migrations/20260919140000_create_offer_review_customer_approval.sql";
const sql = read(MIGRATION);
const typesSrc = read("src/lib/offer-approval/types.ts");
const constantsSrc = read("src/lib/offer-approval/constants.ts");
const actionsSrc = read("src/lib/offer-approval/actions.ts");
const phase9Doc = read("docs/offer-review-customer-approval-prep-v1.md");
const dataModel = read("docs/data-model-auth-design-v1.md");
const implPlan = read("docs/implementation-plan.md");
const phase8Sql = read(
  "supabase/migrations/20260917100000_create_offer_preparations.sql",
);
const buttonSrc = read("src/components/dashboard/PrepareOfferButton.tsx");
const tableSrc = read("src/components/dashboard/ServiceOrderTable.tsx");
const cardSrc = read("src/components/dashboard/ServiceOrderMobileCard.tsx");

const phase9Code = [sql, typesSrc, constantsSrc, actionsSrc].join("\n");
const ui = [buttonSrc, tableSrc, cardSrc].join("\n");

function assertNoInventedQuibi(source: string, label: string) {
  assert(!/https?:\/\/[^\s]*quibi/i.test(source), `${label}: no Quibi URL`);
  assert(!/api\.quibi/i.test(source), `${label}: no api.quibi`);
  assert(!/\baxios\b/.test(source), `${label}: no axios`);
  assert(!/process\.env\.[A-Z0-9_]*QUIBI/i.test(source), `${label}: no Quibi env`);
  assert(!/QUIBI_API/i.test(source), `${label}: no QUIBI_API`);
  assert(!/quibi_draft_/i.test(source), `${label}: no fabricated Quibi id`);
  assert(!/fetch\s*\(/i.test(source), `${label}: no fetch()`);
}

// A. migration is PREP only; Phase 8 untouched as dependency
{
  assert(sql.includes("PREPARE ONLY — do not apply"), "migration marked PREP");
  assert(sql.includes("create table public.quotes"), "quotes table");
  assert(sql.includes("create table public.customer_approvals"), "customer_approvals table");
  assert(phase8Sql.includes("create table public.offer_preparations"), "Phase 8 prep still present");
  assert(
    !phase8Sql.includes("approved_for_send"),
    "Phase 8 migration not overloaded with Phase 9 review states",
  );
}

// B. quote ownership: service_request + offer_preparation, NOT service_order
{
  assert(sql.includes("service_request_id uuid not null"), "quotes require service_request_id");
  assert(sql.includes("offer_preparation_id uuid not null"), "quotes require offer_preparation_id");
  assert(!/service_order_id/.test(sql), "no service_order_id on Phase 9 quote model");
  assert(sql.includes("quotes_request_same_org_fk"), "same-org request FK");
  assert(
    !sql.includes("quotes_prep_same_org_fk"),
    "legacy org-only prep FK must not remain (insufficient)",
  );
  assert(
    sql.includes("offer_preparations_org_request_id_unique") &&
      /unique\s*\(\s*organization_id\s*,\s*service_request_id\s*,\s*id\s*\)/.test(sql),
    "Phase 9 adds composite UNIQUE candidate key on offer_preparations",
  );
  assert(
    !phase8Sql.includes("offer_preparations_org_request_id_unique"),
    "Phase 8 migration not edited for composite prep key",
  );
  assert(
    sql.includes("quotes_prep_same_request_fk") &&
      /foreign key\s*\(\s*organization_id\s*,\s*service_request_id\s*,\s*offer_preparation_id\s*\)/.test(
        sql,
      ) &&
      /references public\.offer_preparations\s*\(\s*organization_id\s*,\s*service_request_id\s*,\s*id\s*\)/.test(
        sql,
      ),
    "quotes composite FK binds org + service_request + offer_preparation",
  );
  assert(
    phase9Doc.includes("service_order_id") &&
      /not\*+\s*require|not\s+require/i.test(phase9Doc),
    "docs: Phase 1 quotes do not require service_order",
  );
  assert(
    dataModel.includes("Phase 1 pre-appointment") ||
      (dataModel.includes("service_request_id") && dataModel.includes("quotes")),
    "data-model documents Phase 9 quote ownership",
  );
}

// C. immutable version evidence
{
  assert(sql.includes("content_sha256"), "content_sha256 column");
  assert(sql.includes("quotes_content_sha256_hex"), "sha256 hex check");
  assert(sql.includes("version_no"), "version_no");
  assert(sql.includes("quotes_request_version_unique"), "unique version per request");
  assert(sql.includes("evidence_payload"), "evidence_payload");
  assert(sql.includes("evidence_kind"), "evidence_kind");
  assert(
    sql.includes("quotes_prevent_evidence_mutation") ||
      sql.includes("prevent_quote_evidence_mutation"),
    "immutability trigger/function for evidence",
  );
  assert(
    sql.includes("content_sha256 is distinct from") ||
      sql.includes("old.content_sha256"),
    "trigger blocks content_sha256 mutation",
  );
  assert(!/insert into public\.quotes/.test(sql), "no quote INSERT path in PREP migration");
}

// D. internal review statuses
{
  assert(
    sql.includes("'unreviewed'") &&
      sql.includes("'approved_for_send'") &&
      sql.includes("'rejected_for_revision'"),
    "internal review status set",
  );
  assert(QUOTE_INTERNAL_REVIEW_UNREVIEWED === "unreviewed", "const unreviewed");
  assert(
    QUOTE_INTERNAL_REVIEW_APPROVED_FOR_SEND === "approved_for_send",
    "const approved_for_send",
  );
  assert(
    QUOTE_INTERNAL_REVIEW_REJECTED_FOR_REVISION === "rejected_for_revision",
    "const rejected_for_revision",
  );
}

// E. customer lifecycle statuses
{
  assert(
    sql.includes("'not_delivered'") && sql.includes("'delivered'"),
    "delivery statuses",
  );
  assert(
    sql.includes("'approved'") &&
      sql.includes("'rejected'") &&
      sql.includes("'expired'"),
    "customer decision statuses",
  );
  assert(CUSTOMER_DELIVERY_NOT_DELIVERED === "not_delivered", "const not_delivered");
  assert(CUSTOMER_DELIVERY_DELIVERED === "delivered", "const delivered");
  assert(CUSTOMER_DECISION_APPROVED === "approved", "const approved");
  assert(CUSTOMER_DECISION_REJECTED === "rejected", "const rejected");
  assert(CUSTOMER_DECISION_EXPIRED === "expired", "const expired");
  assert(sql.includes("viewed_at"), "viewed_at nullable column exists");
  assert(
    !/\bset\s+viewed_at\s*=/i.test(sql) &&
      !/\bviewed_at\s*=\s*pg_catalog\.now/i.test(sql),
    "no synthesized viewed_at assignment",
  );
}

// F. RPCs exist and fail closed appropriately
{
  assert(
    sql.includes("create or replace function public.approve_quote_for_send"),
    "approve_quote_for_send RPC",
  );
  assert(
    sql.includes("create or replace function public.reject_quote_for_revision"),
    "reject_quote_for_revision RPC",
  );
  assert(
    sql.includes("create or replace function public.deliver_approved_quote_to_customer"),
    "deliver_approved_quote_to_customer RPC",
  );
  assert(sql.includes("error_code', 'not_found'"), "not_found fail closed");
  assert(sql.includes("error_code', 'hash_mismatch'"), "hash_mismatch fail closed");
  assert(
    sql.includes("error_code', 'delivery_unavailable'"),
    "delivery_unavailable fail closed",
  );
  assert(
    sql.includes("delivery_unavailable"),
    "deliver RPC documents/returns delivery_unavailable",
  );
  assert(
    !/\bupdate\s+public\.service_requests\b[\s\S]{0,400}\bset\b[\s\S]{0,200}status\s*=\s*'awaiting_customer_approval'/i.test(
      sql,
    ),
    "no UPDATE sets service_requests.status to awaiting_customer_approval",
  );
  assert(
    !/\bupdate\s+public\.service_requests\b[\s\S]{0,400}\bset\b[\s\S]{0,200}status\s*=\s*'awaiting_slot_selection'/i.test(
      sql,
    ),
    "no UPDATE sets service_requests.status to awaiting_slot_selection",
  );
  assert(
    phase9Doc.includes("STOP before changing request status after customer approval") ||
      phase9Doc.includes("does not change service_requests.status after customer approval"),
    "docs: no post-customer-approval status transition",
  );
}

// G. security / RLS / locks
{
  assert(/perform pg_advisory_xact_lock\(\s*910008/.test(sql), "lock 910008");
  assert(!/pg_advisory_xact_lock\(\s*91000[1-7]/.test(sql), "no lock-order inversion 910001-7");
  assert(sql.includes("for update"), "row locks");
  assert(sql.includes("security definer"), "SECURITY DEFINER");
  assert(sql.includes("set search_path = ''"), "empty search_path");
  assert(sql.includes("private.resolve_manual_intake_org()"), "server-side org");
  assert(sql.includes("private.has_org_role("), "role helper on RLS");
  assert(sql.includes("array['owner', 'admin', 'reception']"), "advisor+ roles");
  assert(sql.includes("revoke all on table public.quotes from public"), "revoke quotes public");
  assert(sql.includes("revoke all on table public.quotes from anon"), "revoke quotes anon");
  assert(
    sql.includes("revoke all on table public.customer_approvals from public"),
    "revoke approvals public",
  );
  assert(
    sql.includes("grant select on table public.quotes to authenticated"),
    "quotes select only",
  );
  assert(
    sql.includes("grant select") && sql.includes("customer_approvals"),
    "approvals select grant",
  );
  assert(!/grant insert/i.test(sql), "no client INSERT grant");
  assert(!/grant update/i.test(sql), "no client UPDATE grant");
  assert(!/grant delete/i.test(sql), "no client DELETE grant");
  assert(!/service_role/.test([sql, typesSrc, constantsSrc, actionsSrc].join("\n")), "no service_role");
  assert(actionsSrc.includes("requireManualIntakeAccess"), "action role gate");
  assert(actionsSrc.includes("createClient()"), "cookie/publishable client");
}

// H. no Quibi / MyPlanly / Calendar / slots / fabricated commercial fields
{
  assertNoInventedQuibi(phase9Code, "phase9");
  assert(sql.includes("no live Quibi") || sql.includes("No live Quibi"), "SQL: no live Quibi");
  assert(sql.includes("no MyPlanly") || sql.includes("No MyPlanly"), "SQL: no MyPlanly");
  assert(
    !/hold_slot|reserve_slot|google_calendar|myplanly/i.test(actionsSrc),
    "actions: no calendar/myplanly/slots",
  );
  const sqlCode = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
  assert(
    !/\b(labour|labor_hours|vat|discount|line_item|unit_price|quote_number)\b/i.test(
      sqlCode,
    ),
    "SQL: no invented commercial columns",
  );
  const typesCode = typesSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert(
    !/\b(labour|labor_hours|vat|discount|line_item|unit_price)\b/i.test(typesCode),
    "types: no invented commercial fields",
  );
}

// I. no fake Tadej UI success path
{
  assert(!/Potrdi in pošlji|Pošlji stranki|Potrdi ceno/i.test(ui), "no send/approve CTA copy");
  assert(
    buttonSrc.includes("Povezava s Quibijem še ni nastavljena") ||
      buttonSrc.includes("OFFER_PROVIDER_UNCONFIGURED_MESSAGE"),
    "Phase 8 unconfigured copy remains",
  );
  assert(
    !actionsSrc.includes("getOfferDraftProvider"),
    "Phase 9 actions do not invoke OfferDraftProvider",
  );
  assert(
    actionsSrc.includes("export async function approveQuoteForSendAction"),
    "approve action exported",
  );
  assert(
    actionsSrc.includes("export async function rejectQuoteForRevisionAction"),
    "reject action exported",
  );
  assert(
    actionsSrc.includes("export async function deliverApprovedQuoteAction"),
    "deliver action exported",
  );
  assert(
    typeof OFFER_APPROVAL_GENERIC_ERROR === "string" &&
      OFFER_APPROVAL_GENERIC_ERROR.length > 0,
    "generic error constant",
  );
  assert(
    actionsSrc.includes("delivery_unavailable"),
    "deliver action handles delivery_unavailable",
  );
  assert(
    actionsSrc.includes("payload.ok === true") &&
      actionsSrc.includes("delivery_unavailable"),
    "deliver action refuses unexpected ok:true",
  );
}

// J. activity deferred; no one-off audit subsystem
{
  assert(
    !sql.includes("create table public.activity_events"),
    "does not invent activity_events",
  );
  assert(
    phase9Doc.includes("activity") && phase9Doc.toLowerCase().includes("defer"),
    "docs defer activity history",
  );
}

// K. docs wire Phase 9 PREP
{
  assert(implPlan.includes("offer-review-customer-approval-prep-v1.md"), "impl plan links PREP doc");
  assert(
    dataModel.includes("offer-review-customer-approval-prep-v1.md") ||
      dataModel.includes("Phase 9 PREP"),
    "data-model references Phase 9 PREP",
  );
  assert(
    phase9Doc.includes("910008"),
    "Phase 9 doc documents lock 910008",
  );
}

// L. exact customer_approval → quote version/hash composite binding
{
  assert(
    sql.includes("quotes_org_request_id_hash_unique") &&
      /unique\s*\(\s*organization_id\s*,\s*service_request_id\s*,\s*id\s*,\s*content_sha256\s*\)/.test(
        sql,
      ),
    "quotes composite UNIQUE candidate key for approval binding",
  );
  assert(
    !sql.includes("customer_approvals_quote_same_org_fk"),
    "legacy org+quote_id-only FK must not remain (insufficient)",
  );
  assert(
    sql.includes("customer_approvals_quote_version_fk") &&
      /foreign key\s*\(\s*organization_id\s*,\s*service_request_id\s*,\s*quote_id\s*,\s*content_sha256\s*\)/.test(
        sql,
      ) &&
      /references public\.quotes\s*\(\s*organization_id\s*,\s*service_request_id\s*,\s*id\s*,\s*content_sha256\s*\)/.test(
        sql,
      ),
    "customer_approvals composite FK binds org + request + quote + content_sha256",
  );
  assert(
    phase9Doc.includes("customer_approvals_quote_version_fk") ||
      phase9Doc.includes("exact tuple") ||
      phase9Doc.includes("content_sha256"),
    "docs describe exact quote version/hash binding",
  );
}

// M. DB guard for awaiting_customer_approval + Phase 9 slot stop-boundary
{
  assert(
    sql.includes("guard_phase9_service_request_status_transition") &&
      sql.includes("service_requests_guard_phase9_status_transition"),
    "Phase 9 status transition guard trigger/function",
  );
  assert(
    /old\.status is not distinct from new\.status/.test(sql),
    "status guard allows status-unchanged updates",
  );
  const guardFn = sql.match(
    /create or replace function private\.guard_phase9_service_request_status_transition\(\)[\s\S]*?^\$\$;/m,
  )?.[0];
  assert(!!guardFn, "extract status guard function body");
  assert(
    guardFn!.includes("awaiting_customer_approval") &&
      /old\.status is distinct from 'preparing_offer'/.test(guardFn!) &&
      guardFn!.includes("delivery_status = 'delivered'") &&
      /ca\.customer_decision is null/.test(guardFn!) &&
      /ca\.revoked_at is null/.test(guardFn!) &&
      guardFn!.includes("approved_for_send") &&
      /from public\.customer_approvals/.test(guardFn!) &&
      /inner join public\.quotes/.test(guardFn!) &&
      /q\.content_sha256 = ca\.content_sha256/.test(guardFn!),
    "awaiting_customer_approval requires preparing_offer + active delivered approved quote",
  );
  assert(
    guardFn!.includes("awaiting_slot_selection") &&
      /raise exception[\s\S]{0,120}awaiting_slot_selection/.test(guardFn!),
    "premature awaiting_slot_selection blocked in Phase 9",
  );
  assert(
    phase9Doc.includes("guard_phase9") ||
      phase9Doc.includes("awaiting_customer_approval requires") ||
      phase9Doc.includes("Phase 10 may replace") ||
      phase9Doc.includes("still awaiting an active customer decision"),
    "docs describe Phase 9 status transition guards",
  );
}

// N. customer_approvals immutability holes closed
{
  const caFn = sql.match(
    /create or replace function private\.prevent_customer_approval_evidence_mutation\(\)[\s\S]*?^\$\$;/m,
  )?.[0];
  assert(!!caFn, "extract customer_approval immutability function");
  assert(
    /old\.delivery_channel is distinct from new\.delivery_channel/.test(caFn!) &&
      caFn!.includes("delivery_channel is immutable after delivery"),
    "delivery_channel immutable after delivery",
  );
  assert(
    /old\.decided_at is distinct from new\.decided_at/.test(caFn!) &&
      caFn!.includes("decided_at is immutable after customer decision"),
    "decided_at immutable after customer decision",
  );
  assert(
    /old\.viewed_at is distinct from new\.viewed_at/.test(caFn!) &&
      caFn!.includes("viewed_at is immutable in this PREP"),
    "viewed_at any mutation blocked in PREP",
  );
  assert(
    !/old\.viewed_at is null and new\.viewed_at is not null/.test(caFn!),
    "weak null→non-null-only viewed_at check must not remain",
  );
  assert(
    !/old\.token_hash is distinct from new\.token_hash/.test(caFn!) &&
      !/old\.revoked_at is distinct from new\.revoked_at/.test(caFn!),
    "token lifecycle fields not frozen without reason",
  );
}

// O. stale-version fail-closed in BOTH approve and reject (before idempotent)
{
  function extractRpc(name: string): string {
    const re = new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?^\\$\\$;`,
      "m",
    );
    const body = sql.match(re)?.[0];
    assert(!!body, `extract ${name} RPC body`);
    return body!;
  }

  function assertStaleBeforeIdempotent(body: string, label: string) {
    const staleIdx = body.indexOf("error_code', 'stale_version'");
    assert(staleIdx >= 0, `${label}: has stale_version`);
    const idempotentIdx = body.indexOf("'idempotent', true");
    assert(idempotentIdx >= 0, `${label}: has idempotent success path`);
    assert(
      staleIdx < idempotentIdx,
      `${label}: stale_version check before idempotent success`,
    );
  }

  const approveBody = extractRpc("approve_quote_for_send");
  const rejectBody = extractRpc("reject_quote_for_revision");
  const deliverBody = extractRpc("deliver_approved_quote_to_customer");

  assertStaleBeforeIdempotent(approveBody, "approve_quote_for_send");
  assertStaleBeforeIdempotent(rejectBody, "reject_quote_for_revision");

  const deliverStaleIdx = deliverBody.indexOf("error_code', 'stale_version'");
  const deliverPrepIdx = deliverBody.indexOf("error_code', 'not_preparing_offer'");
  const deliverUnavailableIdx = deliverBody.indexOf(
    "error_code', 'delivery_unavailable'",
  );
  assert(deliverStaleIdx >= 0, "deliver keeps stale_version check");
  assert(deliverPrepIdx >= 0, "deliver requires preparing_offer");
  assert(deliverUnavailableIdx >= 0, "deliver returns delivery_unavailable");
  assert(
    deliverStaleIdx < deliverUnavailableIdx &&
      deliverPrepIdx < deliverUnavailableIdx,
    "deliver checks stale + preparing_offer before delivery_unavailable",
  );
}

// P. strict TS RPC result-status validation (fail closed, no status defaults)
{
  function extractAction(name: string): string {
    const re = new RegExp(
      `export async function ${name}\\([\\s\\S]*?^\\}`,
      "m",
    );
    const body = actionsSrc.match(re)?.[0];
    assert(!!body, `extract ${name}`);
    return body!;
  }

  const approveAction = extractAction("approveQuoteForSendAction");
  const rejectAction = extractAction("rejectQuoteForRevisionAction");

  assert(
    actionsSrc.includes("QUOTE_INTERNAL_REVIEW_APPROVED_FOR_SEND") &&
      actionsSrc.includes("QUOTE_INTERNAL_REVIEW_REJECTED_FOR_REVISION"),
    "actions import typed review status constants",
  );
  assert(
    approveAction.includes("QUOTE_INTERNAL_REVIEW_APPROVED_FOR_SEND") &&
      approveAction.includes('service_request_status !== "preparing_offer"') &&
      !/:\s*"approved_for_send"/.test(approveAction) &&
      !/internal_review_status === "string"[\s\S]{0,80}approved_for_send/.test(
        approveAction,
      ),
    "approve action requires exact approved_for_send (no default)",
  );
  assert(
    rejectAction.includes("QUOTE_INTERNAL_REVIEW_REJECTED_FOR_REVISION") &&
      rejectAction.includes('service_request_status !== "preparing_offer"') &&
      !/:\s*"rejected_for_revision"/.test(rejectAction) &&
      !/internal_review_status === "string"[\s\S]{0,80}rejected_for_revision/.test(
        rejectAction,
      ),
    "reject action requires exact rejected_for_revision (no default)",
  );
}

console.log("offer-review-customer-approval.assert.ts: all assertions passed");
