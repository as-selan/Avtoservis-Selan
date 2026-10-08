import assert from "node:assert/strict";
import { test } from "node:test";
import * as workflow from "./write-workflow.ts";
import type { NewOperation, Operation, OperationJournal, OperationPatch } from "./write-workflow.ts";

const caseId = "9d40c42f-b6a8-473b-983f-f9620df97d10";
const quoteId = "ab9f75b2-e6f3-45c7-82de-e36c82faab7b";
const actorId = "00000000-0000-4000-8000-000000000001";
const orgId = "00000000-0000-4000-8000-000000000002";
// Synthetic test-only environment; no process environment or live HTTP is used.
const environment = { APP_ENV: "preproduction", QUIBI_MODE: "dev", VERCEL_ENV: "preview",
  QUIBI_DEV_WRITE_ENABLED: "1", QUIBI_DEV_USERNAME: "fixture-only-user", QUIBI_DEV_PASSWORD: "fixture-only-password",
  QUIBI_DEV_TEST_RECIPIENT: "online.gold100@gmail.com" };
const authority = {
  actorId, organizationId: orgId, role: "owner", serviceRequestId: caseId, caseStatus: "preparing_offer",
  quoteRevisionId: quoteId, quoteServiceRequestId: caseId, latestQuoteId: quoteId,
  quoteReviewStatus: "approved_for_send", evidenceKind: "quibi_manual_estimate",
  documentId: "2176888", customerId: "405956", evidenceCustomerId: "405956", vehicleId: "2387",
  serviceWanted: "QA pregled vozila", approvedContentSha256: "a".repeat(64), customerEmail: "customer@example.test",
};
function fixture() {
  const records = new Map<string, Operation>();
  const events: string[] = [];
  let auth = { ...authority };
  let remote: Awaited<ReturnType<workflow.EstimateRead["estimateDetail"]>> = { id: "2176888", customerId: "405956", vehicleId: "2387", lines: [{ description: "QA service" }],
    contentSha256: "a".repeat(64) };
  const journal: OperationJournal = {
    async get(kind, local) { return records.get(`${kind}:${local}`) ?? null; },
    async insertOnce(entry: NewOperation) {
      const key = `${entry.kind}:${entry.localEntityId}`;
      const old = records.get(key); if (old) return old;
      const op: Operation = { ...entry, id: key, state: "prepared", quibiId: null,
        quibiContentSha256: null, documentNumber: null, sendId: null, sendStatus: null };
      records.set(key, op); events.push("persist"); return op;
    },
    async claim(id, expected) {
      const op = records.get(id); if (!op || op.state !== expected) return false;
      records.set(id, { ...op, state: "dispatching" }); events.push("claim"); return true;
    },
    async patch(id, expected, changes: OperationPatch) {
      const op = records.get(id); if (!op || op.state !== expected) throw new Error("CONCURRENT_CHANGE");
      const next = { ...op, ...changes }; records.set(id, next); return next;
    },
  };
  const read = { async estimates() { events.push("list"); return [{ id: "2176888" }]; },
    async estimateDetail() { events.push("detail"); return remote; } };
  const write = {
    async sendDocument(id: string, recipient: string) {
      assert.equal(id, "2176888"); assert.equal(recipient, environment.QUIBI_DEV_TEST_RECIPIENT);
      assert.ok(events.indexOf("persist") < events.length); events.push("send");
      return { sendId: "fixture-send-1", status: "queued" as const };
    },
    async getSendStatus() { events.push("status"); return { status: "sent" as "queued" | "sent" | "failed" }; },
  };
  return { journal, read, write, records, events,
    authorize: async () => { events.push("authorize"); return auth; },
    setAuth: (change: Partial<typeof authority>) => { auth = { ...auth, ...change }; },
    setRemote: (change: Partial<typeof remote>) => { remote = { ...remote, ...change }; },
  };
}
function send(f: ReturnType<typeof fixture>, overrides: Record<string, unknown> = {}) {
  assert.equal(typeof workflow.sendManualLinkedEstimate, "function", "manual send path exists independently of create journal");
  return workflow.sendManualLinkedEstimate({ ...f, environment, quoteRevisionId: quoteId, serviceRequestId: caseId,
    manualMatchConfirmed: true, manualMatchReference: "QA: reviewed document 2176888 against vehicle 2387 and service",
    testSendConfirmed: true, ...overrides });
}

test("approved manual document sends once without an estimate creation journal", async () => {
  const f = fixture();
  const op = await send(f);
  assert.equal(op.sendStatus, "queued"); assert.equal(op.sendId, "fixture-send-1");
  assert.equal(f.records.size, 1); assert.equal(op.kind, "send");
  const body = JSON.parse(op.requestBody);
  assert.equal(body.authorization.documentId, "2176888");
  assert.equal(body.authorization.approvedContentSha256, authority.approvedContentSha256);
  assert.equal(body.manualConfirmation.actorId, actorId);
  assert.equal(body.manualConfirmation.vehicleId, "2387");
  assert.ok(body.manualConfirmation.confirmedAt);
  assert.equal(f.events.filter(e => e === "send").length, 1);
  assert.ok(f.events.filter(e => e === "authorize").length >= 2, "fresh authorization immediately before dispatch");
});
test("configured mailbox only; example.test and customer's mailbox are rejected", async () => {
  await assert.rejects(send(fixture(), { requestedRecipient: "wrong@gmail.com" }), /QUIBI_TEST_RECIPIENT/);
  for (const recipient of ["test@example.test", authority.customerEmail, "x@example.test.evil.com", "a\n@gmail.com"]) {
    const f = fixture();
    await assert.rejects(send(f, { environment: { ...environment, QUIBI_DEV_TEST_RECIPIENT: recipient } }), /QUIBI_TEST_RECIPIENT/);
    assert.equal(f.events.includes("send"), false);
  }
});
test("SHA, customer, vehicle, document and empty lines mismatches stop before sending", async () => {
  for (const change of [{ contentSha256: "b".repeat(64) }, { customerId: "99" }, { vehicleId: "99" },
    { id: "99" }, { lines: [] }]) {
    const f = fixture(); f.setRemote(change);
    await assert.rejects(send(f), /QUIBI_DOCUMENT/); assert.equal(f.events.includes("send"), false);
  }
});
test("unapproved, stale or different-case quotes and unauthorized roles are rejected", async () => {
  for (const change of [{ quoteReviewStatus: "unreviewed" }, { latestQuoteId: actorId },
    { quoteServiceRequestId: actorId }, { quoteRevisionId: actorId }, { serviceRequestId: actorId },
    { caseStatus: "needs_data" }, { role: "reception" }, { evidenceCustomerId: "999" }]) {
    const f = fixture(); f.setAuth(change);
    await assert.rejects(send(f), /QUIBI_SEND_AUTHORIZATION/); assert.equal(f.events.includes("send"), false);
  }
});
test("missing Quibi vehicle requires recorded manual attestation; explicit mismatch never bypasses it", async () => {
  const f = fixture(); f.setRemote({ vehicleId: undefined });
  const op = await send(f);
  assert.equal(JSON.parse(op.requestBody).manualConfirmation.vehicleId, "2387");
  const absent = fixture(); absent.setRemote({ vehicleId: undefined });
  await assert.rejects(send(absent, { manualMatchConfirmed: false }), /QUIBI_MANUAL_CONFIRMATION/);
  await assert.rejects(send(fixture(), { manualMatchReference: "yes" }), /QUIBI_MANUAL_CONFIRMATION/);
  await assert.rejects(send(fixture(), { testSendConfirmed: false }), /QUIBI_TEST_SEND_CONFIRMATION/);
});
test("two concurrent confirmed clicks dispatch at most once", async () => {
  const f = fixture();
  const results = await Promise.allSettled([send(f), send(f)]);
  assert.equal(f.events.filter(e => e === "send").length, 1);
  assert.ok(results.some(r => r.status === "fulfilled"));
});
test("timeout is uncertain and retry cannot dispatch again", async () => {
  const f = fixture(); f.write.sendDocument = async () => { f.events.push("send"); throw new Error("FIXTURE_TIMEOUT"); };
  await assert.rejects(send(f), /FIXTURE_TIMEOUT/);
  assert.equal(f.records.get(`send:${quoteId}`)?.state, "uncertain");
  await assert.rejects(send(f), /QUIBI_SEND_AMBIGUOUS_NO_RETRY/);
  assert.equal(f.events.filter(e => e === "send").length, 1);
});
test("saved send_id retries poll only and retain terminal failed or sent states", async () => {
  const f = fixture(); await send(f);
  assert.equal((await send(f)).sendStatus, "sent");
  assert.equal((await send(f)).sendStatus, "sent");
  assert.equal(f.events.filter(e => e === "send").length, 1);
  const failed = fixture(); await send(failed);
  failed.write.getSendStatus = async () => ({ status: "failed" });
  assert.equal((await send(failed)).sendStatus, "failed");
  assert.equal(failed.events.filter(e => e === "send").length, 1);
});
test("final reauthorization stops changed approval before the external call", async () => {
  const f = fixture(); let checks = 0;
  f.authorize = async () => ({ ...authority, quoteReviewStatus: ++checks > 1 ? "unreviewed" : "approved_for_send" });
  await assert.rejects(send(f), /QUIBI_SEND_AUTHORIZATION/);
  assert.equal(f.events.includes("send"), false);
});
test("manual send requires Preview; local escape flags, demo, disabled and wrong domains are rejected", async () => {
  for (const env of [{ ...environment, VERCEL_ENV: "production" }, { ...environment, APP_ENV: "production" },
    { ...environment, QUIBI_MODE: "production" }, { ...environment, QUIBI_DEV_WRITE_ENABLED: "0" },
    { ...environment, VERCEL_ENV: undefined, SELAN_APPROVED_LOCAL_DEV: "1" }, { ...environment, SELAN_REMOTE_DEMO: "1" }]) {
    const f = fixture(); await assert.rejects(send(f, { environment: env }), /QUIBI_DEV_TEST_SEND_DISABLED/);
    assert.equal(f.events.length, 0);
  }
  await assert.rejects(send(fixture(), { origin: "https://si.quibi.net" }), /QUIBI_DEV_TEST_SEND_DISABLED/);
});

test("explicit another-case service identity overrides no manual confirmation", async () => {
  const f = fixture(); f.setRemote({ externalId: "selan-service-request:" + actorId });
  await assert.rejects(send(f), /QUIBI_DOCUMENT/);
  assert.equal(f.events.includes("send"), false);
});
test("document SHA changed after journal claim blocks the final dispatch", async () => {
  const f = fixture(); let count = 0;
  const detail = f.read.estimateDetail;
  f.read.estimateDetail = async () => { const d = await detail(); return { ...d, contentSha256: ++count > 1 ? "b".repeat(64) : d.contentSha256 }; };
  await assert.rejects(send(f), /QUIBI_DOCUMENT/);
  assert.equal(f.events.includes("send"), false);
  assert.equal(f.records.get("send:" + quoteId)?.state, "failed");
});
test("status-only API cannot dispatch, including an uncertain operation without send_id", async () => {
  const f = fixture(); const queued = await send(f);
  const result = await workflow.checkTrackedEstimateStatus({ journal: f.journal, write: f.write, operation: queued, documentId: "2176888" });
  assert.equal(result.sendStatus, "sent"); assert.equal(f.events.filter(e => e === "send").length, 1);
  await assert.rejects(workflow.checkTrackedEstimateStatus({ journal: f.journal, write: f.write,
    operation: { ...queued, sendId: null }, documentId: "2176888" }), /QUIBI_SEND_STATUS_UNAVAILABLE/);
});
