/**
 * Contract/static assertions for Phase 8 offer-preparation PREP.
 * Run: npx --yes tsx scripts/offer-preparation.assert.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCanonicalOfferInput } from "../src/lib/offer-preparation/canonical-input";
import {
  OFFER_PREP_ACTION_LABEL,
  OFFER_PREP_READY_NEXT_ACTION,
  OFFER_PREPARATION_STATUS_READY_FOR_PROVIDER,
  OFFER_PROVIDER_UNCONFIGURED_MESSAGE,
} from "../src/lib/offer-preparation/constants";
import { getOfferDraftProvider } from "../src/lib/offer-preparation/provider";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const sql = read("supabase/migrations/20260928175331_20260917100000_create_offer_preparations.sql");
const providerSrc = read("src/lib/offer-preparation/provider.ts");
const actionsSrc = read("src/lib/offer-preparation/actions.ts");
const canonicalSrc = read("src/lib/offer-preparation/canonical-input.ts");
const typesSrc = read("src/lib/offer-preparation/types.ts");
const constantsSrc = read("src/lib/offer-preparation/constants.ts");
const buttonSrc = read("src/components/dashboard/PrepareOfferButton.tsx");
const tableSrc = read("src/components/dashboard/ServiceOrderTable.tsx");
const cardSrc = read("src/components/dashboard/ServiceOrderMobileCard.tsx");
const loaderSrc = read("src/lib/dashboard/load-dashboard-snapshot.ts");
const adaptSrc = read("src/lib/dashboard/adapt-dashboard.ts");
const docs = [
  read("docs/offer-preparation-prep-v1.md"),
  read("docs/data-model-auth-design-v1.md"),
  read("docs/implementation-plan.md"),
].join("\n");

const phase8 = [
  sql,
  providerSrc,
  actionsSrc,
  canonicalSrc,
  typesSrc,
  constantsSrc,
  buttonSrc,
].join("\n");

const allUi = [buttonSrc, tableSrc, cardSrc].join("\n");

const sampleInput = buildCanonicalOfferInput({
  organizationId: "org",
  offerPreparationId: "prep",
  serviceRequest: {
    id: "sr",
    summary: "Menjava olja",
    problem_description: null,
    service_wanted: "servis",
    brings_own_material: false,
    mileage_reported_km: 120000,
  },
  customer: {
    id: "c",
    display_name: "Janez",
    email: "a@b.si",
    phone: "041123456",
  },
  vehicle: {
    id: "v",
    make: "VW",
    model: "Golf",
    year: 2018,
    registration_current: "LJ 123-AB",
    vin: "WVWZZZ1JZXW000001",
  },
});

function assertNoInventedQuibiHttp(source: string, label: string) {
  assert(!/https?:\/\/[^\s]*quibi/i.test(source), `${label}: no Quibi URL`);
  assert(!/api\.quibi/i.test(source), `${label}: no api.quibi`);
  assert(!/\baxios\b/.test(source), `${label}: no axios`);
  assert(!/process\.env\.[A-Z0-9_]*QUIBI/i.test(source), `${label}: no Quibi env`);
  assert(!/QUIBI_API/i.test(source), `${label}: no QUIBI_API`);
  assert(!/quibi_draft_/i.test(source), `${label}: no fabricated Quibi id`);
  assert(!/external_resource_id/i.test(source), `${label}: no external_resource_id`);
}

// A. no real/invented Quibi HTTP integration
{
  assertNoInventedQuibiHttp(phase8, "phase8");
  assertNoInventedQuibiHttp(loaderSrc, "loader");
  assertNoInventedQuibiHttp(adaptSrc, "adapt");
  assert(!/fetch\s*\(/i.test(phase8), "no fetch() in offer-preparation");
  assert(sql.includes("no live Quibi API"), "SQL documents no live Quibi");
  assert(sql.includes("no invented endpoints"), "SQL documents no invented endpoints");
  assert(docs.includes("no live Quibi API"), "docs: no live Quibi API");
  assert(docs.includes("no Quibi credentials"), "docs: no Quibi credentials");
}

// B. no MyPlanly
{
  assert(sql.includes("no MyPlanly"), "SQL forbids MyPlanly");
  assert(
    sql.includes("Quibi / quotes / appointments / MyPlanly / Calendar are NOT implemented"),
    "SQL scope stop includes MyPlanly/appointments",
  );
  assert(docs.includes("No MyPlanly") || docs.includes("no MyPlanly"), "docs: no MyPlanly");
  assert(!/createMyPlanly|myplanlyClient|hold_slot|reserve_slot/i.test(phase8), "no MyPlanly client/slots");
}

// C. no service_role
{
  assert(!/service_role/.test(phase8), "no service_role in Phase 8");
  assert(actionsSrc.includes("createClient()"), "action uses cookie/publishable client");
}

// D. eligibility: preparing_offer + archived denied
{
  assert(sql.includes("v_status is distinct from 'preparing_offer'"), "RPC re-checks preparing_offer");
  assert(sql.includes("if v_archived is not null"), "archived denied");
  assert(sql.includes("error_code', 'not_preparing_offer'"), "stale status fail closed");
  assert(sql.includes("error_code', 'archived'"), "archived error code");
  assert(sql.includes("for update"), "locks the request row");
}

// E. duplicate / concurrency / idempotency
{
  assert(sql.includes("offer_preparations_request_unique"), "unique one row per request");
  assert(sql.includes("unique (organization_id, service_request_id)"), "unique org+request");
  assert(sql.includes("on conflict on constraint offer_preparations_request_unique"), "idempotent insert");
  assert(/perform pg_advisory_xact_lock\(\s*910007/.test(sql), "lock 910007");
  assert(!/pg_advisory_xact_lock\(\s*910001/.test(sql), "no phone lock");
  assert(!/pg_advisory_xact_lock\(\s*910002/.test(sql), "no email lock");
  assert(!/pg_advisory_xact_lock\(\s*910003/.test(sql), "no VIN lock");
  assert(!/pg_advisory_xact_lock\(\s*910004/.test(sql), "no registration lock");
  assert(!/pg_advisory_xact_lock\(\s*910005/.test(sql), "no completion request lock inversion");
  assert(!/pg_advisory_xact_lock\(\s*910006/.test(sql), "no token lock");
  assert(sql.includes("does not mutate"), "no customer/vehicle identity mutation");
}

// F. tenant-safe FKs / RLS
{
  assert(sql.includes("enable row level security"), "RLS enabled");
  assert(sql.includes("offer_preparations_request_same_org_fk"), "same-org request FK");
  assert(sql.includes("offer_preparations_created_by_same_org_fk"), "same-org created_by FK");
  assert(sql.includes("private.has_org_role("), "role helper");
  assert(sql.includes("array['owner', 'admin', 'reception']::text[]"), "owner/admin/reception");
  assert(sql.includes("Mechanic has no policy access"), "mechanic excluded");
}

// G. no anon / public mutation
{
  assert(sql.includes("revoke all on table public.offer_preparations from public"), "revoke public table");
  assert(sql.includes("revoke all on table public.offer_preparations from anon"), "revoke anon table");
  assert(sql.includes("grant select on table public.offer_preparations to authenticated"), "select only");
  assert(!/grant insert/i.test(sql), "no client INSERT grant");
  assert(!/grant update/i.test(sql), "no client UPDATE grant");
  assert(!/grant delete/i.test(sql), "no client DELETE grant");
  assert(sql.includes("revoke all on function public.prepare_service_request_offer(uuid) from public"), "revoke public execute");
  assert(sql.includes("revoke all on function public.prepare_service_request_offer(uuid) from anon"), "revoke anon execute");
  assert(sql.includes("grant execute on function public.prepare_service_request_offer(uuid) to authenticated"), "explicit execute grant");
  assert(sql.includes("security definer"), "SECURITY DEFINER");
  assert(sql.includes("set search_path = ''"), "empty search_path");
}

// H. no transition to awaiting_customer_approval / no send
{
  assert(!/status\s*=\s*'awaiting_customer_approval'/.test(sql), "does not set awaiting_customer_approval");
  assert(sql.includes("MUST NOT change service_requests.status"), "status freeze documented");
  assert(sql.includes("'service_request_status', 'preparing_offer'"), "RPC returns preparing_offer");
  assert(actionsSrc.includes("Does not send to the customer"), "action documents no send");
  assert(!/sendOffer|send_offer_to_customer|pošlji ponudbo/i.test(phase8), "no send-to-customer API");
  assert(docs.includes("Phase 9 owns"), "Phase 9 owns review/send");
}

// I. provider unconfigured fails closed (async; awaited in main)
async function assertProviderUnconfigured() {
  const provider = getOfferDraftProvider();
  const created = await provider.createDraft(sampleInput);
  const got = await provider.getDraft(sampleInput);
  const updated = await provider.updateDraft(sampleInput);
  assert(created.ok === false && created.code === "CONTRACT_UNVERIFIED", "createDraft CONTRACT_UNVERIFIED");
  assert(got.ok === false && got.code === "CONTRACT_UNVERIFIED", "getDraft CONTRACT_UNVERIFIED");
  assert(updated.ok === false && updated.code === "CONTRACT_UNVERIFIED", "updateDraft CONTRACT_UNVERIFIED");
  assert(created.message === OFFER_PROVIDER_UNCONFIGURED_MESSAGE, "user-facing unconfigured copy");
  assert(typesSrc.includes("PROVIDER_UNAVAILABLE"), "typed PROVIDER_UNAVAILABLE exists");
  assert(!/fetch\s*\(|\/api2\//.test(providerSrc), "provider cannot call Quibi write API");
}

// J. no fabricated external resource ID / no invented commercial fields
{
  assert(!/labour|labor_hours|vat|discount|line_item/i.test(canonicalSrc), "no invented quote fields");
  assert(canonicalSrc.includes("problem_description"), "uses problem_description");
  assert(canonicalSrc.includes("service_wanted"), "uses service_wanted");
  assert(canonicalSrc.includes("brings_own_material"), "uses brings_own_material");
  assert(canonicalSrc.includes("mileage_reported_km"), "uses mileage_reported_km");
  assert(canonicalSrc.includes("registration_current"), "uses registration");
  assert(canonicalSrc.includes("vin"), "uses vin");
  assert(sampleInput.serviceRequest.summary === "Menjava olja", "canonical summary");
  assert(!("price" in sampleInput), "no price on payload");
}

// K. truthful dashboard copy
{
  assert(allUi.includes("PrepareOfferButton"), "dashboard wires prepare button");
  assert(tableSrc.includes('order.status === "priprava_ponudbe"'), "table CTA on preparing_offer UI");
  assert(cardSrc.includes('order.status === "priprava_ponudbe"'), "card CTA on preparing_offer UI");
  assert(buttonSrc.includes("OFFER_PREP_ACTION_LABEL"), "Pripravi ponudbo wired");
  assert(buttonSrc.includes("OFFER_PREP_READY_NEXT_ACTION"), "ready copy after prep");
  assert(constantsSrc.includes(OFFER_PROVIDER_UNCONFIGURED_MESSAGE), "Quibi unconfigured constant");
  assert(OFFER_PREP_ACTION_LABEL === "Pripravi ponudbo", "action label");
  assert(OFFER_PREP_READY_NEXT_ACTION === "Podatki za ponudbo so pripravljeni.", "ready copy");
  assert(
    OFFER_PROVIDER_UNCONFIGURED_MESSAGE === "Branje Quibija deluje; ustvarjanje predračuna čaka na potrjeno pogodbo API-ja.",
    "unconfigured copy",
  );
  assert(!/Quibi draft|ponudba je poslana|cena je potrjena|stranka je potrdila/i.test(allUi), "no false success claims");
  assert(OFFER_PREPARATION_STATUS_READY_FOR_PROVIDER === "ready_for_provider", "minimal status");
}

// L. migration remains PREP only
{
  assert(sql.includes("PREPARE ONLY — do not apply"), "migration marked PREP");
  assert(docs.includes("Not blocking Phase 8 internal PREP"), "Quibi API not blocking Phase 8 PREP");
  assert(docs.includes("does not execute"), "docs: Phase 8 does not execute provider");
  assert(sql.includes("create table public.offer_preparations"), "table exists");
  assert(sql.includes("check (status in ('ready_for_provider'))"), "minimal status check");
  assert(!/sent|customer_approved|invoic|workshop/i.test(sql.match(/constraint offer_preparations_status_check[\s\S]+?\)/)?.[0] ?? ""), "no extra lifecycle statuses");
}

// V2 A–C. readiness from offer_preparations, not next_action copy
{
  assert(
    !adaptSrc.includes("OFFER_PREP_READY_NEXT_ACTION"),
    "adapt does not import ready next_action copy",
  );
  assert(
    !adaptSrc.includes("next_action?.trim() === OFFER_PREP_READY_NEXT_ACTION"),
    "adapt does not compare next_action to ready copy",
  );
  assert(
    !loaderSrc.includes("OFFER_PREP_READY_NEXT_ACTION"),
    "loader does not infer readiness from next_action copy",
  );
  assert(loaderSrc.includes('.from("offer_preparations")'), "loader reads offer_preparations");
  assert(
    loaderSrc.includes("OFFER_PREPARATION_STATUS_READY_FOR_PROVIDER"),
    "loader filters ready_for_provider",
  );
  assert(
    loaderSrc.includes("throw new Error(\"offer_preparations_query_failed\")"),
    "prep query failure fails snapshot",
  );
  assert(
    adaptSrc.includes("offerPreparationReady = false"),
    "adapt receives explicit readiness boolean",
  );
  assert(
    loaderSrc.includes("preparedRequestIds.has(row.id)"),
    "loader passes readiness from offer_preparations set",
  );
}

// V2 D. prepareOfferAction does not invoke provider methods
{
  assert(!actionsSrc.includes("getOfferDraftProvider"), "action does not get provider");
  assert(!/\.createDraft\s*\(/.test(actionsSrc), "action does not call createDraft");
  assert(!/\.getDraft\s*\(/.test(actionsSrc), "action does not call getDraft");
  assert(!/\.updateDraft\s*\(/.test(actionsSrc), "action does not call updateDraft");
  assert(!buttonSrc.includes("getOfferDraftProvider"), "button does not get provider");
  assert(!/\.createDraft\s*\(/.test(buttonSrc), "button does not call createDraft");
  assert(actionsSrc.includes("does not invoke OfferDraftProvider"), "action documents no provider call");
}

// V2 F. PrepareOfferButton catches rejected action/network failures
{
  assert(buttonSrc.includes("} catch {"), "button has catch");
  assert(buttonSrc.includes("OFFER_PREP_GENERIC_ERROR"), "generic catch copy");
  assert(buttonSrc.includes("if (!result.ok)"), "handles ok:false");
  assert(buttonSrc.includes("setError(result.message)"), "ok:false sets error");
  assert(buttonSrc.includes("return;"), "ok:false returns before prepared");
  const preparedAssign = buttonSrc.indexOf("setPrepared(true)");
  const catchIdx = buttonSrc.indexOf("} catch {");
  assert(preparedAssign > 0 && catchIdx > preparedAssign, "prepared only on success path before catch");
  assert(!buttonSrc.includes("error.stack"), "no stack in UI");
  assert(!buttonSrc.includes("error.message"), "no raw technical error");
}

// V3. canonical completeness gate before INSERT
{
  const fnStart = sql.indexOf(
    "create or replace function public.prepare_service_request_offer",
  );
  const fn = sql.slice(fnStart);
  const lockIdx = fn.search(/perform pg_advisory_xact_lock\(\s*910007/);
  const selectLockedIdx = fn.indexOf(
    "select sr.status, sr.archived_at, sr.customer_id, sr.vehicle_id",
  );
  const forUpdateIdx = fn.indexOf("for update");
  const statusGateIdx = fn.indexOf("v_status is distinct from 'preparing_offer'");
  const missingIdsIdx = fn.indexOf("v_customer_id is null or v_vehicle_id is null");
  const helperIdx = fn.indexOf("private.compute_intake_completeness(");
  const incompleteIdx = fn.indexOf("error_code', 'incomplete_data'");
  const insertIdx = fn.indexOf("insert into public.offer_preparations");
  const nextActionUpdateIdx = fn.indexOf(
    "set next_action = 'Podatki za ponudbo so pripravljeni.'",
  );

  assert(fnStart >= 0, "RPC exists");
  assert(lockIdx >= 0 && selectLockedIdx > lockIdx, "lock then locked select");
  assert(
    forUpdateIdx > selectLockedIdx,
    "FOR UPDATE on request including customer_id/vehicle_id",
  );
  assert(statusGateIdx > forUpdateIdx, "preparing_offer gate after lock");
  assert(missingIdsIdx > statusGateIdx, "null customer/vehicle after status gate");
  const customerLockIdx = fn.search(
    /from public\.customers as c[\s\S]*?for share;/,
  );
  const vehicleLockIdx = fn.search(
    /from public\.vehicles as v[\s\S]*?for share;/,
  );
  const customerArchivedIdx = fn.indexOf(
    "not found or v_customer_archived is not null",
  );
  const vehicleArchivedIdx = fn.indexOf(
    "not found or v_vehicle_archived is not null",
  );

  assert(helperIdx > missingIdsIdx, "completeness helper after identity check");
  assert(customerLockIdx > missingIdsIdx, "customer lock after status/id gate");
  assert(vehicleLockIdx > customerLockIdx, "customer row lock before vehicle");
  assert(helperIdx > vehicleLockIdx, "completeness after locked customer/vehicle");
  assert(
    fn.includes("v_phone") && fn.includes("v_email") && fn.includes("v_vin"),
    "reads phone/email/VIN",
  );
  assert(fn.includes("v.make") && fn.includes("v.model"), "reads make/model");
  assert(fn.includes("c.archived_at") && fn.includes("v.archived_at"), "reads canonical archived_at");
  assert(customerArchivedIdx > customerLockIdx, "archived customer after customer lock");
  assert(vehicleArchivedIdx > vehicleLockIdx, "archived vehicle after vehicle lock");
  assert(customerArchivedIdx < helperIdx && vehicleArchivedIdx < helperIdx, "archived fail-closed before completeness");
  assert(incompleteIdx > 0 && incompleteIdx < insertIdx, "incomplete_data before INSERT");
  assert(helperIdx < insertIdx, "completeness helper before INSERT");
  assert(nextActionUpdateIdx > insertIdx, "next_action only after successful insert path");
  assert(
    fn.includes("sr.next_action is distinct from 'Podatki za ponudbo so pripravljeni.'"),
    "repeated prepare does not rewrite identical next_action",
  );

  const incompleteReturn = "jsonb_build_object('ok', false, 'error_code', 'incomplete_data')";
  assert(fn.includes(incompleteReturn), "incomplete_data result has no PII");
  assert(
    !/jsonb_build_object\('ok', false, 'error_code', 'incomplete_data',\s*'missing/.test(fn),
    "incomplete_data does not return missing fields",
  );

  const incompleteSlice = fn.slice(0, insertIdx);
  assert(
    incompleteSlice.includes("error_code', 'incomplete_data'"),
    "incomplete returns occur before INSERT",
  );
  assert(
    !incompleteSlice.includes("set next_action"),
    "incomplete path does not mutate next_action",
  );
  assert(
    !incompleteSlice.includes("status = 'needs_data'"),
    "does not move back to needs_data",
  );
  assert(
    !incompleteSlice.includes("update public.customers") &&
      !incompleteSlice.includes("update public.vehicles"),
    "incomplete path does not mutate customer/vehicle",
  );

  assert(actionsSrc.includes("incomplete_data"), "app maps incomplete_data");
  assert(docs.includes("necessary but not sufficient"), "docs: preparing_offer not sufficient");
  assert(docs.includes("phone + email + VIN + make + model") || docs.includes("phone, email, VIN, make, model"), "docs list V1 fields");
  assert(docs.includes("FOR SHARE"), "docs: canonical rows locked FOR SHARE");
  assert(
    docs.includes("Archived canonical customer/vehicle cannot become provider-ready"),
    "docs: archived canonical rows cannot become provider-ready",
  );
}

// V4. canonical customer then vehicle locked before completeness / INSERT
{
  const fnStart = sql.indexOf(
    "create or replace function public.prepare_service_request_offer",
  );
  const fn = sql.slice(fnStart);
  const lockIdx = fn.search(/perform pg_advisory_xact_lock\(\s*910007/);
  const forUpdateIdx = fn.indexOf("for update");
  const statusGateIdx = fn.indexOf("v_status is distinct from 'preparing_offer'");
  const customerShareIdx = fn.search(
    /from public\.customers as c[\s\S]*?for share;/,
  );
  const vehicleShareIdx = fn.search(
    /from public\.vehicles as v[\s\S]*?for share;/,
  );
  const helperIdx = fn.indexOf("private.compute_intake_completeness(");
  const insertIdx = fn.indexOf("insert into public.offer_preparations");
  const nextActionUpdateIdx = fn.indexOf(
    "set next_action = 'Podatki za ponudbo so pripravljeni.'",
  );
  const customerShareCount = fn.match(/for share;/g)?.length ?? 0;

  assert(lockIdx >= 0 && forUpdateIdx > lockIdx, "910007 then request FOR UPDATE");
  assert(statusGateIdx > forUpdateIdx, "status gate after request lock");
  assert(customerShareIdx > statusGateIdx, "customer FOR SHARE after status gate");
  assert(vehicleShareIdx > customerShareIdx, "vehicle FOR SHARE after customer");
  assert(helperIdx > vehicleShareIdx, "completeness after both canonical locks");
  assert(insertIdx > helperIdx, "INSERT after completeness");
  assert(nextActionUpdateIdx > insertIdx, "next_action after INSERT/reuse");
  assert(customerShareCount === 2, "exactly two FOR SHARE locks (customer, vehicle)");
  assert(!/pg_advisory_xact_lock\(\s*91000[1-6]/.test(fn), "no identity/completion advisory locks");

  const incompleteSlice = fn.slice(0, insertIdx);
  assert(
    incompleteSlice.includes("v_customer_archived is not null"),
    "archived customer fails closed before INSERT",
  );
  assert(
    incompleteSlice.includes("v_vehicle_archived is not null"),
    "archived vehicle fails closed before INSERT",
  );
  assert(
    !incompleteSlice.includes("set next_action"),
    "incomplete/archived path does not mutate next_action",
  );
  assert(
    !incompleteSlice.includes("update public.service_requests"),
    "incomplete/archived path does not mutate request state",
  );
  assert(
    !incompleteSlice.includes("update public.customers") &&
      !incompleteSlice.includes("update public.vehicles") &&
      !incompleteSlice.includes("insert into public.customers") &&
      !incompleteSlice.includes("insert into public.vehicles"),
    "incomplete/archived path does not mutate customer/vehicle",
  );
}

void assertProviderUnconfigured()
  .then(() => {
    console.log("offer-preparation.assert.ts: all assertions passed");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
