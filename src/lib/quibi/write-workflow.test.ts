import assert from "node:assert/strict";
import { test } from "node:test";
import { createAndVerifyEstimate, sendAndTrackEstimate, updateAndVerifyEstimate,
  type NewOperation, type Operation, type OperationJournal, type OperationPatch } from "./write-workflow.ts";
import { buildEstimateBody, type EstimateBody } from "./write-contract.ts";

const caseId = "00000000-0000-4000-8000-000000000001";
const revisionId = "00000000-0000-4000-8000-000000000002";
const quoteId = "00000000-0000-4000-8000-000000000003";
const lines = [{ sifra: "TEST-SERVICE", kolicina: 1 }];
const input = { saleTypeId: "1", customerId: "405956", vehicleId: "2387", serviceRequestId: caseId, lines };

function fixture() {
  const records = new Map<string, Operation>();
  const events: string[] = [];
  let remote: { id: string; customerId: string; vehicleId: string; externalId: string;
    number: string; numberingId: string; lines: unknown[]; contentSha256: string } | null = null;
  let sends = 0;
  const journal: OperationJournal = {
    async get(kind, localEntityId) { return records.get(`${kind}:${localEntityId}`) ?? null; },
    async insertOnce(entry: NewOperation) {
      const key = `${entry.kind}:${entry.localEntityId}`;
      const old = records.get(key);
      if (old) return old;
      events.push("persist");
      const row: Operation = { ...entry, id: key, state: "prepared", quibiId: null,
        documentNumber: null, sendId: null, sendStatus: null };
      records.set(key, row);
      return row;
    },
    async claim(id, expected) {
      const row = records.get(id);
      if (!row || row.state !== expected) return false;
      events.push("claim"); records.set(id, { ...row, state: "dispatching" }); return true;
    },
    async patch(id, expected, changes: OperationPatch) {
      const row = records.get(id);
      if (!row || row.state !== expected) throw new Error("CONCURRENT_CHANGE");
      const updated = { ...row, ...changes };
      records.set(id, updated);
      return updated;
    },
  };
  const read = {
    async estimates() { return remote ? [{ id: remote.id }] : []; },
    async estimateDetail() { if (!remote) throw new Error("MISSING"); return remote; },
  };
  const write = {
    async getNumberings() { return [{ Stevilcenje: { id: "2061", naziv: "Predračun", glava_id: "2" } }]; },
    async createEstimate(body: EstimateBody) {
      events.push("create");
      remote = { id: "2176888", customerId: String(body.Glavadokumenta.stranka_id),
        vehicleId: String(body.Glavadokumenta.vozila_id), externalId: body.Glavadokumenta.external_id,
        number: "TEST-1", numberingId: String(body.Glavadokumenta.stevilcenje_id),
        lines: Object.values(body.Postavkedokumenta), contentSha256: "a".repeat(64) };
      return { id: remote.id, number: remote.number };
    },
    async updateEstimate(id: string, body: EstimateBody) {
      events.push("update"); assert.equal(id, "2176888");
      if (!remote) throw new Error("MISSING");
      remote = { ...remote, lines: Object.values(body.Postavkedokumenta), contentSha256: "b".repeat(64) };
      return { id, number: "TEST-1" };
    },
    async sendDocument() { events.push("send"); sends++; return { sendId: "test-send-1", status: "queued" as const }; },
    async getSendStatus() { events.push("send_status"); return { status: "sent" as const }; },
  };
  return { journal, read, write, records, events, getRemote: () => remote, getSends: () => sends };
}

test("create persists exact payload first, re-reads owner/vehicle/document, then immutable retry", async () => {
  const f = fixture();
  const first = await createAndVerifyEstimate({ ...f, input });
  assert.equal(first.state, "verified");
  assert.deepEqual(f.events, ["persist", "claim", "create"]);
  const second = await createAndVerifyEstimate({ ...f, input });
  assert.equal(second.quibiId, first.quibiId);
  assert.equal(f.events.filter((event) => event === "create").length, 1);
  f.write.getNumberings = async () => { throw new Error("NUMBERING_CHANGED"); };
  assert.equal((await createAndVerifyEstimate({ ...f, input })).quibiId, first.quibiId);
  await assert.rejects(createAndVerifyEstimate({ ...f, input: { ...input,
    lines: [{ sifra: "CHANGED", kolicina: 1 }] } }), /QUIBI_CREATE_CHANGED_REQUIRES_UPDATE/);
});

test("uncertain create retries persisted body and owner mismatch prevents verification", async () => {
  const f = fixture();
  const original = f.write.createEstimate;
  let first = true;
  f.write.createEstimate = async (body) => {
    const result = await original(body);
    if (first) { first = false; throw new Error("NETWORK_TIMEOUT_AFTER_COMMIT"); }
    return result;
  };
  await assert.rejects(createAndVerifyEstimate({ ...f, input }), /NETWORK_TIMEOUT_AFTER_COMMIT/);
  assert.equal(f.records.get(`estimate:${caseId}`)?.state, "uncertain");
  const retry = await createAndVerifyEstimate({ ...f, input });
  assert.equal(retry.state, "verified");
  const wrong = fixture();
  wrong.write.createEstimate = async (body) => {
    const result = await original.call(wrong.write, body);
    return result;
  };
  // The mismatch check is separately exercised by returning a document for another vehicle.
  wrong.read.estimateDetail = async () => ({ id: "2176888", customerId: "405956", vehicleId: "999",
    externalId: `selan-service-request:${caseId}`, number: "TEST-1", numberingId: "2061",
    lines, contentSha256: "a".repeat(64) });
  wrong.read.estimates = async () => [{ id: "2176888" }];
  await assert.rejects(createAndVerifyEstimate({ ...wrong, input }), /QUIBI_DOCUMENT_REREAD_MISMATCH/);
  assert.equal(wrong.records.get(`estimate:${caseId}`)?.state, "uncertain");
});

test("update uses explicit revision and changed-document guard; send polls stored send_id without repeat", async () => {
  const f = fixture();
  await createAndVerifyEstimate({ ...f, input });
  const replacement = buildEstimateBody({ ...input, numberingId: "2061",
    lines: [{ sifra: "TEST-UPDATED", kolicina: 1 }] });
  const updated = await updateAndVerifyEstimate({ ...f, serviceRequestId: caseId, revisionId,
    customerId: "405956", vehicleId: "2387", documentId: "2176888",
    externalId: `selan-service-request:${caseId}`, numberingId: "2061",
    expectedContentSha256: "a".repeat(64), replacement });
  assert.equal(updated.state, "verified");
  await assert.rejects(updateAndVerifyEstimate({ ...f, serviceRequestId: caseId, revisionId: quoteId,
    customerId: "405956", vehicleId: "2387", documentId: "2176888",
    externalId: `selan-service-request:${caseId}`, numberingId: "2061",
    expectedContentSha256: "a".repeat(64), replacement }), /QUIBI_DOCUMENT_CHANGED/);
  const send = { journal: f.journal, read: f.read, write: f.write, quoteRevisionId: quoteId,
    serviceRequestId: caseId, documentId: "2176888", recipient: "test@example.invalid", subject: "[TEST] Predračun",
    customerId: "405956", vehicleId: "2387", externalId: `selan-service-request:${caseId}`,
    numberingId: "2061", approvedContentSha256: "b".repeat(64), approvedForSend: true };
  assert.equal((await sendAndTrackEstimate(send)).sendId, "test-send-1");
  assert.equal((await sendAndTrackEstimate(send)).sendStatus, "sent");
  assert.equal(f.getSends(), 1);
  await assert.rejects(sendAndTrackEstimate({ ...send, recipient: "other@example.invalid" }),
    /QUIBI_CREATE_CHANGED_REQUIRES_UPDATE/);
});

test("ambiguous send never retries and changed approved document blocks dispatch", async () => {
  const f = fixture();
  await createAndVerifyEstimate({ ...f, input });
  const send = { journal: f.journal, read: f.read, write: f.write, quoteRevisionId: quoteId,
    serviceRequestId: caseId, documentId: "2176888", recipient: "test@example.invalid", subject: "[TEST] Predračun",
    customerId: "405956", vehicleId: "2387", externalId: `selan-service-request:${caseId}`,
    numberingId: "2061", approvedContentSha256: "a".repeat(64), approvedForSend: true };
  f.write.sendDocument = async () => { f.events.push("send"); throw new Error("NETWORK_TIMEOUT_AFTER_SEND"); };
  await assert.rejects(sendAndTrackEstimate(send), /NETWORK_TIMEOUT_AFTER_SEND/);
  assert.equal(f.records.get(`send:${quoteId}`)?.state, "uncertain");
  await assert.rejects(sendAndTrackEstimate(send), /QUIBI_SEND_AMBIGUOUS_NO_RETRY/);
  assert.equal(f.events.filter((event) => event === "send").length, 1);
  await assert.rejects(sendAndTrackEstimate({ ...send, quoteRevisionId: revisionId,
    approvedContentSha256: "b".repeat(64) }), /QUIBI_DOCUMENT_CHANGED/);
});

test("concurrent create attempts cannot both dispatch", async () => {
  const f = fixture();
  const results = await Promise.allSettled([
    createAndVerifyEstimate({ ...f, input }), createAndVerifyEstimate({ ...f, input }),
  ]);
  assert.equal(f.events.filter((event) => event === "create").length, 1);
  assert.ok(results.some((result) => result.status === "fulfilled"));
  assert.ok(results.some((result) => result.status === "rejected" &&
    /QUIBI_OPERATION_CONCURRENT/.test(String(result.reason))));
});
