import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCustomers, parseDocuments, customerFingerprint } from "./contracts.ts";

test("customer response projects only documented fields and rejects malformed envelopes", () => {
  assert.deepEqual(parseCustomers({ error: false, data: { Stranke: [{ Stranka: { id: "12", naziv: " Ana ", telst: "040 123", emajl: "A@example.test" } }] } }), [
    { id: "12", name: "Ana", phone: "040 123", email: "A@example.test" },
  ]);
  assert.throws(() => parseCustomers({ error: true, data: { Stranke: [] } }));
  assert.throws(() => parseCustomers({ error: false, data: { Stranke: [{ Stranka: { naziv: "No ID" } }] } }));
});

test("document response keeps only a linked customer's documents", () => {
  const result = parseDocuments({ error: false, data: { Dokumenti: [
    { Glavadokumenta: { id: "101", stranka_id: "12", stevilcenje_id: "8" } },
    { Glavadokumenta: { id: "102", stranka_id: "13", stevilcenje_id: "8" } },
  ] } }, "12");
  assert.deepEqual(result, [{ id: "101", customerId: "12", numberingId: "8" }]);
});

test("fingerprint is stable across superficial formatting but detects changes", () => {
  const a = { id: "12", name: "Ana Novak", phone: "040 123", email: "A@example.test" };
  assert.equal(customerFingerprint(a), customerFingerprint({ ...a, name: " ana  novak ", email: "a@EXAMPLE.test" }));
  assert.notEqual(customerFingerprint(a), customerFingerprint({ ...a, phone: "040 999" }));
});
