import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCustomers, parseDocuments, parseEstimateDetail, parseVehicles, parseVehicleDetail, customerFingerprint, vehicleFingerprint, quibiDocumentStatusLabel } from "./contracts.ts";

test("missing DEV document status is explicit rather than invented", () => {
  assert.equal(quibiDocumentStatusLabel(""), "Status v Quibi DEV ni na voljo");
  assert.equal(quibiDocumentStatusLabel("Osnutek"), "Osnutek");
});

test("document lists project their own Quibi amount without treating it as a case price", () => {
  const rows = parseDocuments({ error: false, data: { Dokumenti: [
    { Glavadokumenta: { id: 81, stranka_id: 12, znesek: "195.50" }, Statusi: null },
  ] } }, "12");
  assert.equal(rows[0].amount, "195.50");
  assert.equal(rows[0].status, "");
});

test("vehicle reads use Quibi id and internastevilka without assuming VIN uniqueness", () => {
  const list = { error: false, data: { Vozila: [
    { Vozila: { id: 972, stranka_id: 12, internastevilka: " WTEST123 ", registrskastevilka: "LJ-01", proizvajalec: "Test", model: "A", disabled: 0 }, Stranka: { id: 12 } },
    { Vozila: { id: 973, stranka_id: 13, internastevilka: "WTEST123", disabled: 0 }, Stranka: { id: 13 } },
  ] } };
  assert.equal(parseVehicles(list).length, 2);
  assert.deepEqual(parseVehicles(list)[0], { id: "972", customerId: "12", vin: "WTEST123", registration: "LJ-01", make: "Test", model: "A", disabled: false });
  assert.equal(parseVehicleDetail({ error: false, data: { Vozilo: list.data.Vozila[0] } }, "972", "12").id, "972");
  assert.throws(() => parseVehicleDetail({ error: false, data: { Vozilo: list.data.Vozila[0] } }, "972", "13"));
  assert.throws(() => parseVehicles({ error: false, data: { Vozila: [{ Vozila: { stranka_id: 12 } }] } }));
});

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
  assert.deepEqual(result, [{ id: "101", customerId: "12", numberingId: "8", status: "" }]);
});

test("estimate detail exposes real review fields only for the linked customer", () => {
  const response = { error: false, data: { Dokumenti: [{
    Glavadokumenta: { id: 101, stranka_id: 12, znesek: "125.50", statusi_id: 1 },
    Statusi: { id: 1, naziv: "Osnutek" },
    Postavkedokumenta: [{ opis: "Delo", kolicina: "1", cenaZDDV: "125.50" }],
  }] } };
  const { contentSha256, ...detail } = parseEstimateDetail(response, "101", "12");
  assert.match(contentSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(detail, {
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

test("vehicle fingerprint tracks VIN, registration and model changes", () => {
  const a = { vin: "wtest123", registration: "lj-01", make: "Test", model: "A" };
  assert.equal(vehicleFingerprint(a), vehicleFingerprint({ ...a, vin: " WTEST123 ", registration: "LJ-01" }));
  assert.notEqual(vehicleFingerprint(a), vehicleFingerprint({ ...a, model: "B" }));
});
