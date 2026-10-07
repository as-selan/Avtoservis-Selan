import assert from "node:assert/strict";
import { test } from "node:test";
import { createOrReconcileCustomer, createOrReconcileVehicle } from "./party-write-workflow.ts";
import type { NewOperation, Operation, OperationJournal, OperationPatch } from "./write-workflow.ts";

const customerId = "00000000-0000-4000-8000-000000000011";
const vehicleId = "00000000-0000-4000-8000-000000000012";
const caseId = "00000000-0000-4000-8000-000000000013";

function journalFixture() {
  const rows = new Map<string, Operation>();
  const journal: OperationJournal = {
    async get(kind, localEntityId) { return rows.get(`${kind}:${localEntityId}`) ?? null; },
    async insertOnce(entry: NewOperation) {
      const key = `${entry.kind}:${entry.localEntityId}`;
      if (rows.has(key)) return rows.get(key)!;
      const row: Operation = { ...entry, id: key, state: "prepared", quibiId: null,
        quibiContentSha256: null, documentNumber: null, sendId: null, sendStatus: null };
      rows.set(key, row); return row;
    },
    async claim(id, expected) {
      const row = rows.get(id);
      if (!row || row.state !== expected) return false;
      rows.set(id, { ...row, state: "dispatching" }); return true;
    },
    async patch(id, expected, changes: OperationPatch) {
      const row = rows.get(id);
      if (!row || row.state !== expected) throw new Error("CONCURRENT_CHANGE");
      const next = { ...row, ...changes }; rows.set(id, next); return next;
    },
  };
  return { journal, rows };
}

test("customer create re-reads exact remote_id and never repeats ambiguous create", async () => {
  const f = journalFixture();
  let writes = 0;
  let remote: Array<{ id: string; remoteId: string; name: string; phone: string; email: string }> = [];
  const read = { async customers() { return remote; }, async customer(id: string) {
    return remote.find((item) => item.id === id)!;
  } };
  const write = { async createCustomer() {
    writes++;
    remote = [{ id: "9001", remoteId: customerId, name: "TEST Stranka", phone: "", email: "" }];
    throw new Error("TIMEOUT");
  } };
  const input = { serviceRequestId: caseId, customerId, name: "TEST Stranka", phone: "", email: "" };
  assert.equal((await createOrReconcileCustomer({ journal: f.journal, read, write, input })).quibiId, "9001");
  assert.equal((await createOrReconcileCustomer({ journal: f.journal, read, write, input })).quibiId, "9001");
  assert.equal(writes, 1);
  await assert.rejects(createOrReconcileCustomer({ journal: f.journal, read, write,
    input: { ...input, name: "Spremenjeno" } }), /QUIBI_CREATE_CHANGED_REQUIRES_UPDATE/);
});

test("customer preflight blocks an existing possible match", async () => {
  const f = journalFixture();
  let writes = 0;
  await assert.rejects(createOrReconcileCustomer({ journal: f.journal,
    read: { async customers() { return [{ id: "8", remoteId: "", name: "TEST Stranka", phone: "", email: "" }]; },
      async customer() { throw new Error("UNEXPECTED"); } },
    write: { async createCustomer() { writes++; } },
    input: { serviceRequestId: caseId, customerId, name: "TEST Stranka", phone: "", email: "" },
  }), /QUIBI_CUSTOMER_MATCH_REVIEW_REQUIRED/);
  assert.equal(writes, 0);
});

test("customer without readable remote_id stays uncertain and is not posted twice", async () => {
  const f = journalFixture();
  let writes = 0;
  const input = { serviceRequestId: caseId, customerId, name: "TEST Stranka", phone: "", email: "" };
  const read = { async customers() { return []; }, async customer() { throw new Error("UNEXPECTED"); } };
  const write = { async createCustomer() { writes++; throw new Error("TIMEOUT"); } };
  await assert.rejects(createOrReconcileCustomer({ journal: f.journal, read, write, input }), /QUIBI_CUSTOMER_CREATE_UNCERTAIN/);
  await assert.rejects(createOrReconcileCustomer({ journal: f.journal, read, write, input }), /QUIBI_CUSTOMER_CREATE_UNCERTAIN/);
  assert.equal(writes, 1);
});

test("vehicle create timeout reconciles only one exact owner-scoped vehicle", async () => {
  const f = journalFixture();
  let writes = 0;
  let remote: Array<{ id: string; customerId: string; vin: string; registration: string;
    make: string; model: string; disabled: boolean }> = [];
  const read = { async vehicles() { return remote; }, async vehicle(id: string) {
    return remote.find((item) => item.id === id)!;
  } };
  const write = { async createVehicle() {
    writes++;
    remote = [{ id: "7001", customerId: "9001", vin: "TESTVIN1234567890", registration: "TEST-01",
      make: "Test", model: "A", disabled: false }];
    throw new Error("TIMEOUT");
  } };
  const input = { serviceRequestId: caseId, vehicleId, quibiCustomerId: "9001",
    vin: "TESTVIN1234567890", registration: "TEST-01", make: "Test", model: "A" };
  assert.equal((await createOrReconcileVehicle({ journal: f.journal, read, write, input })).quibiId, "7001");
  assert.equal((await createOrReconcileVehicle({ journal: f.journal, read, write, input })).quibiId, "7001");
  assert.equal(writes, 1);
});

test("ambiguous vehicle result never repeats create", async () => {
  const f = journalFixture();
  let writes = 0;
  const input = { serviceRequestId: caseId, vehicleId, quibiCustomerId: "9001",
    vin: "TESTVIN1234567890", registration: "TEST-01", make: "Test", model: "A" };
  const read = { async vehicles() { return []; }, async vehicle() { throw new Error("UNEXPECTED"); } };
  const write = { async createVehicle() { writes++; throw new Error("TIMEOUT"); } };
  await assert.rejects(createOrReconcileVehicle({ journal: f.journal, read, write, input }), /QUIBI_VEHICLE_CREATE_UNCERTAIN/);
  await assert.rejects(createOrReconcileVehicle({ journal: f.journal, read, write, input }), /QUIBI_VEHICLE_CREATE_UNCERTAIN/);
  assert.equal(writes, 1);
});

test("vehicle preflight blocks duplicate registration before any POST", async () => {
  const f = journalFixture();
  let writes = 0;
  await assert.rejects(createOrReconcileVehicle({ journal: f.journal,
    read: { async vehicles() { return [{ id: "7", customerId: "9001", vin: "OTHER",
      registration: "TEST-01", make: "", model: "", disabled: false }]; },
      async vehicle() { throw new Error("UNEXPECTED"); } },
    write: { async createVehicle() { writes++; return "7"; } },
    input: { serviceRequestId: caseId, vehicleId, quibiCustomerId: "9001",
      vin: "TESTVIN1234567890", registration: "TEST-01", make: "Test", model: "A" },
  }), /QUIBI_VEHICLE_MATCH_REVIEW_REQUIRED/);
  assert.equal(writes, 0);
});
