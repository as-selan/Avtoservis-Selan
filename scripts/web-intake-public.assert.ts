/**
 * Focused assertions for Phase 6 public website intake.
 * Run: npx --yes tsx scripts/web-intake-public.assert.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isPublicUnauthenticatedPath } from "../src/lib/supabase/proxy";
import { WEB_INTAKE_MAX_BODY_BYTES } from "../src/lib/intake/web-limits";
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
  utf8ByteLength,
  WEB_INTAKE_SUCCESS_MESSAGE,
} from "../src/lib/intake/web-public";
import {
  validateWebIntakeForm,
  WEB_INTAKE_EMAIL_SHAPE,
} from "../src/lib/intake/web-validate";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const CLIENT_REQUEST_ID = "11111111-2222-4333-8222-333333333333";

function validRaw(overrides: Record<string, unknown> = {}) {
  return {
    displayName: "Ana Novak",
    phone: "041 123 456",
    email: "ana@example.com",
    vin: "",
    registration: "",
    make: "",
    model: "",
    year: "",
    powerKw: "",
    engine: "",
    engineType: "",
    fuel: "",
    mileage: "",
    serviceWanted: "Menjava olja",
    problemDescription: "",
    bringsOwnMaterial: false,
    clientRequestId: CLIENT_REQUEST_ID,
    ...overrides,
  };
}

// --- validation ---
{
  const ok = validateWebIntakeForm(validRaw());
  assert(ok.ok, "expected valid website intake");
}

{
  const missingName = validateWebIntakeForm(validRaw({ displayName: "  " }));
  assert(!missingName.ok, "display name required");
}

{
  const noContact = validateWebIntakeForm(validRaw({ phone: "", email: "" }));
  assert(!noContact.ok, "phone or email required");
}

{
  const emailOnly = validateWebIntakeForm(validRaw({ phone: "", email: "ana@example.com" }));
  assert(emailOnly.ok, "email-only contact is enough");
}

{
  const noService = validateWebIntakeForm(
    validRaw({ serviceWanted: "", problemDescription: "" }),
  );
  assert(!noService.ok, "service or problem required");
}

{
  const problemOnly = validateWebIntakeForm(
    validRaw({ serviceWanted: "", problemDescription: "Ne vžge" }),
  );
  assert(problemOnly.ok, "problem-only service is enough");
}

{
  const incompleteVehicle = validateWebIntakeForm(
    validRaw({ vin: "", make: "", model: "", registration: "" }),
  );
  assert(incompleteVehicle.ok, "incomplete vehicle must still submit");
}

{
  const badYear = validateWebIntakeForm(validRaw({ year: "1200" }));
  assert(!badYear.ok, "year 1200 invalid");
}

{
  const badMileage = validateWebIntakeForm(validRaw({ mileage: "-1" }));
  assert(!badMileage.ok, "negative mileage invalid");
}

{
  const badPower = validateWebIntakeForm(validRaw({ powerKw: "0" }));
  assert(!badPower.ok, "power_kw must be > 0");
}

{
  const tooLong = validateWebIntakeForm(
    validRaw({ displayName: "A".repeat(201) }),
  );
  assert(!tooLong.ok, "display name max length");
}

{
  const badId = validateWebIntakeForm(validRaw({ clientRequestId: "not-a-uuid" }));
  assert(!badId.ok, "client request id must be uuid");
}

{
  const stable = validateWebIntakeForm(validRaw());
  const retry = validateWebIntakeForm(validRaw());
  assert(stable.ok && retry.ok, "retry validation with same uuid");
  if (stable.ok && retry.ok) {
    assert(
      stable.input.clientRequestId === retry.input.clientRequestId,
      "idempotency key stays stable across retries",
    );
  }
}

{
  const vinOk = validateWebIntakeForm(validRaw({ vin: "WVWZZZ1JZXW000001" }));
  assert(vinOk.ok, "non-17 VIN length is allowed when provided");
}

{
  const fuel = validateWebIntakeForm(validRaw({ fuel: "bencin" }));
  assert(fuel.ok && fuel.input.fuel === "petrol", "UI fuel maps to DB petrol");
}

{
  const phoneAndBlankEmail = validateWebIntakeForm(validRaw({ email: "  " }));
  assert(phoneAndBlankEmail.ok, "blank email allowed when phone exists");
}

{
  const malformed = validateWebIntakeForm(
    validRaw({ email: "not-an-email" }),
  );
  assert(!malformed.ok, "malformed email rejected even with phone");
}

{
  const noDot = validateWebIntakeForm(validRaw({ phone: "", email: "ana@example" }));
  assert(!noDot.ok, "email without domain suffix rejected");
}

{
  const spaced = validateWebIntakeForm(validRaw({ email: "ana @example.com" }));
  assert(!spaced.ok, "email with whitespace rejected");
}

assert(WEB_INTAKE_EMAIL_SHAPE.test("ana@example.com"), "pragmatic email shape accepts local@domain.suffix");
assert(!WEB_INTAKE_EMAIL_SHAPE.test("not-an-email"), "pragmatic email shape rejects bare token");

// --- public sanitization ---
{
  const dirty = {
    ok: true,
    service_request_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    customer_id: "ffffffff-0000-0000-0000-111111111111",
    vehicle_id: "22222222-3333-4444-5555-666666666666",
    status: "needs_data",
    matched: true,
    error: "duplicate key value violates unique constraint",
  };
  const clean = sanitizeWebIntakePublicResponse(dirty);
  assert(clean.ok === true, "success sanitizes to ok");
  assert(clean.message === WEB_INTAKE_SUCCESS_MESSAGE, "success message is public SI copy");
  assert(
    !JSON.stringify(clean).includes("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
    "service_request id must not leak",
  );
  assert(!JSON.stringify(clean).includes("customer_id"), "customer_id key must not leak");
  assert(!JSON.stringify(clean).includes("vehicle_id"), "vehicle_id key must not leak");
  assert(!JSON.stringify(clean).includes("needs_data"), "status must not leak");
  assert(!JSON.stringify(clean).includes("duplicate key"), "raw db error must not leak");
}

{
  const fail = sanitizeWebIntakePublicResponse({
    ok: false,
    error_code: "ambiguous_customer",
    error: "relation does not exist",
  });
  assert(fail.ok === false, "failure stays failure");
  assert(!JSON.stringify(fail).includes("ambiguous_customer"), "error_code must not leak");
  assert(!JSON.stringify(fail).includes("relation does not exist"), "raw error must not leak");
}

{
  const success = publicWebIntakeSuccess();
  const replayLooksSame = sanitizeWebIntakePublicResponse({
    ok: true,
    replayed: true,
    customer_created: false,
  });
  assert(
    JSON.stringify(success) === JSON.stringify(replayLooksSame),
    "create vs reuse/replay must look identical publicly",
  );
}

{
  const withFields = publicWebIntakeFailure({
    fieldErrors: { displayName: "Obvezno polje" },
  });
  assert(withFields.fieldErrors?.displayName === "Obvezno polje", "field errors allowed");
  assert(!("error_code" in withFields), "failure must not include error_code");
}

// --- no browser org/status/source on RPC ---
{
  const validated = validateWebIntakeForm(validRaw());
  assert(validated.ok, "rpc args source");
  if (validated.ok) {
    const args = toRpcArgs(validated.input);
    const keys = Object.keys(args);
    assert(!keys.includes("p_organization_id"), "no org rpc arg");
    assert(!keys.includes("organization_id"), "no organization_id rpc arg");
    assert(!keys.includes("p_source"), "no source rpc arg");
    assert(!keys.includes("source"), "no source rpc arg");
    assert(!keys.includes("p_status"), "no status rpc arg");
    assert(!keys.includes("status"), "no status rpc arg");
    assert(!keys.includes("p_channel"), "no channel rpc arg");
    assert(args.p_client_request_id === CLIENT_REQUEST_ID, "client request id is sent");
  }
}

{
  const sneaky = parseWebIntakeBody(
    JSON.stringify({
      displayName: "Ana Novak",
      phone: "041123456",
      serviceWanted: "Servis",
      clientRequestId: CLIENT_REQUEST_ID,
      organizationId: "should-be-ignored",
      organization_id: "should-be-ignored",
      source: "manual",
      status: "admin_completed",
      channel: "sms",
    }),
  );
  assert(sneaky.ok && sneaky.honeypotTriggered === false, "parse ignores extra keys");
  if (sneaky.ok && !sneaky.honeypotTriggered) {
    assert(
      !("organizationId" in sneaky.raw) &&
        !("source" in sneaky.raw) &&
        !("status" in sneaky.raw),
      "parsed raw must not carry org/source/status",
    );
  }
}

{
  const honey = parseWebIntakeBody(
    JSON.stringify({
      ...validRaw(),
      companyWebsite: "https://spam.example",
    }),
  );
  assert(honey.ok && honey.honeypotTriggered, "honeypot detected");
}

// --- public vs protected paths ---
assert(isPublicUnauthenticatedPath("/povprasevanje"), "/povprasevanje is public");
assert(isPublicUnauthenticatedPath("/api/povprasevanje"), "/api/povprasevanje is public");
assert(isPublicUnauthenticatedPath("/login"), "/login remains public");
assert(!isPublicUnauthenticatedPath("/dashboard"), "/dashboard stays protected");
assert(!isPublicUnauthenticatedPath("/api"), "/api wildcard must not be public");
assert(
  !isPublicUnauthenticatedPath("/api/other"),
  "unrelated api routes stay protected",
);

// --- same-origin + payload bounds ---
{
  const origin = "http://localhost:3000";
  const same = new Request(`${origin}/api/povprasevanje`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
  });
  assert(isSameOriginRequest(same, origin), "same origin header is accepted");
  assert(isJsonContentType(same), "json content-type accepted");

  const cross = new Request(`${origin}/api/povprasevanje`, {
    method: "POST",
    headers: { origin: "https://evil.example", "content-type": "application/json" },
  });
  assert(!isSameOriginRequest(cross, origin), "cross-origin is rejected");

  const noOrigin = new Request(`${origin}/api/povprasevanje`, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  assert(!isSameOriginRequest(noOrigin, origin), "missing origin/referer is rejected");

  const oversized = new Request(`${origin}/api/povprasevanje`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "content-length": String(WEB_INTAKE_MAX_BODY_BYTES + 1),
    },
  });
  assert(isOversizedContentLength(oversized), "A: content-length over 16KiB rejected");
}

function streamRequest(chunks: Uint8Array[]): Request {
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index]);
        index += 1;
        return;
      }
      controller.close();
    },
  });
  return new Request("http://localhost:3000/api/povprasevanje", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);
}

async function assertBoundedReads() {
  const encoder = new TextEncoder();
  const overChunk = encoder.encode("x".repeat(WEB_INTAKE_MAX_BODY_BYTES + 1));
  const over = await readBoundedRequestBody(streamRequest([overChunk]));
  assert(!over.ok, "B: no Content-Length streamed body over limit rejected");

  const first = encoder.encode("x".repeat(8000));
  const second = encoder.encode("y".repeat(WEB_INTAKE_MAX_BODY_BYTES - 8000 + 1));
  const overMulti = await readBoundedRequestBody(streamRequest([first, second]));
  assert(!overMulti.ok, "B: multi-chunk stream over limit rejected without full buffer");

  const exactBytes = encoder.encode("z".repeat(WEB_INTAKE_MAX_BODY_BYTES));
  const exact = await readBoundedRequestBody(streamRequest([exactBytes]));
  assert(exact.ok, "C: body exactly at 16KiB accepted");
  if (exact.ok) {
    assert(utf8ByteLength(exact.text) === WEB_INTAKE_MAX_BODY_BYTES, "C: exact body byte length");
  }

  const under = await readBoundedRequestBody(
    streamRequest([encoder.encode("hello")]),
  );
  assert(under.ok && under.text === "hello", "C: body under limit accepted");
}

{
  const chars = "č".repeat(10_000);
  assert(chars.length === 10_000, "D: JS code units are character count");
  assert(utf8ByteLength(chars) === 20_000, "D: č is 2 UTF-8 bytes");
  assert(
    utf8ByteLength(chars) > WEB_INTAKE_MAX_BODY_BYTES,
    "D: 10000 č exceeds 16KiB in bytes",
  );
  assert(!parseWebIntakeBody(chars).ok, "D: parseWebIntakeBody uses UTF-8 bytes not JS length");
}

{
  const underUtf8Json = JSON.stringify({
    ...validRaw(),
    displayName: "Ana Č",
  });
  assert(
    utf8ByteLength(underUtf8Json) < WEB_INTAKE_MAX_BODY_BYTES,
    "typical utf-8 json under limit",
  );
  const parsed = parseWebIntakeBody(underUtf8Json);
  assert(parsed.ok, "utf-8 json under byte limit parses");
}

// --- SQL contract (unapplied migration text) ---
{
  const sql = readFileSync(
    resolve("supabase/migrations/20260914024500_create_web_service_request_intake.sql"),
    "utf8",
  );

  assert(
    /insert into public\.service_requests[\s\S]*mileage_reported_km[\s\S]*p_mileage_reported_km/.test(
      sql,
    ),
    "service_request always preserves p_mileage_reported_km",
  );
  assert(
    /insert into public\.vehicles[\s\S]*p_mileage_reported_km/.test(sql),
    "new vehicle may initialize mileage from submission",
  );

  assert(
    sql.includes("^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$"),
    "SQL has pragmatic email shape (direct-RPC)",
  );
  assert(
    /nullif\(btrim\(p_email\), ''\) is not null[\s\S]*validation_failed/.test(sql),
    "supplied malformed email returns validation_failed in SQL",
  );
  assert(
    sql.includes(String.raw`Mirrors TS /^[^\s@]+@[^\s@]+\.[^\s@]+$/.`),
    "SQL comment mirrors TS email rule",
  );

  assert(sql.includes("910000"), "lock 910000 request id");
  assert(sql.includes("910001"), "lock 910001 phone");
  assert(sql.includes("910002"), "lock 910002 email");
  assert(sql.includes("910003"), "lock 910003 VIN");
  assert(sql.includes("910004"), "lock 910004 registration");
  assert(sql.includes("grant execute") && sql.includes("to anon"), "narrow anon execute");
  assert(!/grant\s+(select|insert|update|all)\s+on\s+table/i.test(sql), "no anon table grants");

  const afterLocks = sql.indexOf("Re-read authoritative candidates AFTER locks");
  const exceptionIdx = sql.lastIndexOf("\nexception");
  assert(afterLocks > 0 && exceptionIdx > afterLocks, "identity section bounds");
  const identityBody = sql.slice(afterLocks, exceptionIdx);
  assert(
    !identityBody.includes("intake_unavailable"),
    "identity conflicts must not return intake_unavailable",
  );
  assert(
    identityBody.includes("v_identity_quarantine := true"),
    "quarantine path exists after locks",
  );
  assert(
    identityBody.includes("v_identity_quarantine,"),
    "service_request attention_needed uses quarantine flag",
  );
  assert(
    identityBody.includes(
      "Preveri ujemanje stranke ali vozila iz spletnega povpraševanja.",
    ),
    "generic internal attention reason",
  );
  assert(
    identityBody.includes("return jsonb_build_object('ok', true)"),
    "quarantine public result remains ok true",
  );
  assert(
    identityBody.includes("v_auto_customer_id := null"),
    "archived/conflicting customer is not reused",
  );
  assert(
    identityBody.includes("v_customer_id := null"),
    "conflicting customer id is cleared before insert",
  );
  assert(
    /v_auto_vehicle_customer_id is distinct from v_customer_id[\s\S]*v_vehicle_id := null/.test(
      identityBody,
    ),
    "conflicting vehicle is not transferred/reused",
  );
  assert(
    /v_vehicle_id is null and v_vin is not null and v_vin_match_count >= 1[\s\S]*v_vin_store := null/.test(
      identityBody,
    ),
    "conflicting VIN is not inserted as structured VIN on fallback vehicle",
  );
  assert(
    identityBody.includes("Nepotrjen VIN iz spletnega povpraševanja:"),
    "unverified conflicting VIN preserved on new vehicle notes",
  );
  assert(
    /insert into public\.vehicles[\s\S]*v_vehicle_notes/.test(identityBody),
    "VIN note is written on NEW fallback vehicle insert",
  );
  const vehicleUpdate = identityBody.slice(
    identityBody.indexOf("elsif v_vehicle_id is not null"),
  );
  assert(
    !/update public\.vehicles as v[\s\S]*notes\s*=/.test(vehicleUpdate),
    "existing vehicle notes are not altered",
  );
  assert(
    !/update public\.customers/.test(identityBody),
    "existing customer UPDATE path is removed (no phone/email mutation)",
  );
  assert(
    /v_phone is not null[\s\S]*v_existing_phone is null[\s\S]*v_identity_quarantine := true/.test(
      identityBody,
    ),
    "existing NULL phone + submitted phone causes quarantine",
  );
  assert(
    /v_email is not null[\s\S]*v_existing_email is null[\s\S]*v_identity_quarantine := true/.test(
      identityBody,
    ),
    "existing NULL email + submitted email causes quarantine",
  );
  assert(
    identityBody.includes("elsif v_vehicle_id is not null then"),
    "exact safe vehicle matches still reuse/update descriptive fields",
  );
  assert(
    !/update public\.vehicles as v[\s\S]*\bvin\s*=/.test(vehicleUpdate),
    "existing vehicle UPDATE must not assign vin",
  );
  assert(
    !/update public\.vehicles as v[\s\S]*registration_current\s*=/.test(
      vehicleUpdate,
    ),
    "existing vehicle UPDATE must not assign registration_current",
  );
  assert(
    /v_vin is not null[\s\S]*v_existing_vin is null[\s\S]*v_identity_quarantine := true/.test(
      identityBody,
    ),
    "existing NULL VIN + submitted VIN causes quarantine",
  );
  assert(
    /v_reg_match is not null[\s\S]*v_existing_reg is null[\s\S]*v_identity_quarantine := true/.test(
      identityBody,
    ),
    "existing NULL registration + submitted registration causes quarantine",
  );
  assert(
    !/update public\.vehicles as v[\s\S]*mileage_latest_km\s*=/.test(
      vehicleUpdate,
    ),
    "existing vehicle UPDATE must not assign mileage_latest_km",
  );
  assert(
    !/update public\.vehicles as v[\s\S]*mileage_latest_recorded_at\s*=/.test(
      vehicleUpdate,
    ),
    "existing vehicle UPDATE must not assign mileage_latest_recorded_at",
  );
  assert(
    identityBody.includes("'web_form'"),
    "quarantine customer source remains web_form",
  );

  const requestLock = sql.search(
    /perform pg_advisory_xact_lock\(\s*910000/,
  );
  const phoneLock = sql.search(/perform pg_advisory_xact_lock\(\s*910001/);
  const emailLock = sql.search(/perform pg_advisory_xact_lock\(\s*910002/);
  const vinLock = sql.search(/perform pg_advisory_xact_lock\(\s*910003/);
  const regLock = sql.search(/perform pg_advisory_xact_lock\(\s*910004/);
  assert(requestLock >= 0, "request-id advisory lock present");
  assert(
    requestLock < phoneLock &&
      phoneLock < emailLock &&
      emailLock < vinLock &&
      vinLock < regLock,
    "idempotency lock remains first; lock namespaces/order unchanged",
  );

  const unavailableReturns = sql.match(
    /error_code',\s*'intake_unavailable'/g,
  );
  assert(
    unavailableReturns !== null && unavailableReturns.length === 3,
    "intake_unavailable only for org missing, leftover unique, and others",
  );
}

void assertBoundedReads().then(
  () => {
    console.log("web-intake-public.assert: PASS");
  },
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
