import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCustomers, parseDocuments, parseEstimateDetail, customerFingerprint } from "./contracts.ts";

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

test("estimate detail exposes real review fields only for the linked customer", () => {
  const response = { error: false, data: { Dokumenti: [{
    Glavadokumenta: { id: 101, stranka_id: 12, znesek: "125.50", statusi_id: 1 },
    Statusi: { id: 1, naziv: "Osnutek" },
    Postavkedokumenta: [{ opis: "Delo", kolicina: "1", cenaZDDV: "125.50" }],
  }] } };
  assert.deepEqual(parseEstimateDetail(response, "101", "12"), {
    id: "101", customerId: "12", amount: "125.50", status: "Osnutek",
    lines: [{ description: "Delo", quantity: "1", grossPrice: "125.50" }],
  });
  assert.throws(() => parseEstimateDetail(response, "101", "13"), /QUIBI_CUSTOMER_ID_MISMATCH/);
  assert.throws(() => parseEstimateDetail(response, "102", "12"), /QUIBI_DOCUMENT_ID_MISMATCH/);
});

test("fingerprint is stable across superficial formatting but detects changes", () => {
  const a = { id: "12", name: "Ana Novak", phone: "040 123", email: "A@example.test" };
  assert.equal(customerFingerprint(a), customerFingerprint({ ...a, name: " ana  novak ", email: "a@EXAMPLE.test" }));
  assert.notEqual(customerFingerprint(a), customerFingerprint({ ...a, phone: "040 999" }));
});
