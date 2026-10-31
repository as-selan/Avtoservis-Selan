import assert from "node:assert/strict";
import test from "node:test";
import { verifiedCasePrice, verifiedLinkedEstimatePrice, verifiedVehicleLink } from "./price-suggestion.ts";
import { vehicleFingerprint } from "./contracts.ts";

const detail = {
  id: "4001", customerId: "2001", amount: "125.50", status: "Osnutek",
  lines: [{ description: "Sintetična storitev", quantity: "1", grossPrice: "125.50" }],
  contentSha256: "a".repeat(64),
};
const quote = {
  evidence_kind: "quibi_manual_estimate", evidence_payload: { external_id: "4001", customer_external_id: "2001" },
  content_sha256: detail.contentSha256, internal_review_status: "unreviewed",
};

test("proposes only exact linked Quibi document price, never a final price", () => {
  assert.deepEqual(verifiedLinkedEstimatePrice(quote, "2001", detail),
    { amount: "125.50", state: "proposed", sourceId: "4001" });
  assert.equal(verifiedLinkedEstimatePrice(quote, "2002", detail), null);
  assert.equal(verifiedLinkedEstimatePrice(quote, "2001", { ...detail, id: "4002" }), null);
  assert.equal(verifiedLinkedEstimatePrice(quote, "2001", { ...detail, contentSha256: "b".repeat(64) }), null);
  assert.equal(verifiedLinkedEstimatePrice(quote, "2001", { ...detail, amount: "125 EUR" }), null);
  assert.equal(verifiedLinkedEstimatePrice(quote, "2001", { ...detail, lines: [] }), null);
  assert.equal(verifiedLinkedEstimatePrice({ ...quote, evidence_kind: "other" }, "2001", detail), null);
  assert.equal(verifiedLinkedEstimatePrice({ ...quote, internal_review_status: "rejected_for_revision" }, "2001", detail), null);
});

test("Tadej's review changes proposed to approved, not final", () => {
  assert.equal(verifiedLinkedEstimatePrice({ ...quote, internal_review_status: "approved_for_send" }, "2001", detail)?.state, "approved");
});

test("case price requires the exact current customer and vehicle link", () => {
  const localVehicle = { vin: "SYNTHVIN001", registration: "TEST-AA", make: "Test", model: "One" };
  const remoteVehicle = { ...localVehicle, id: "3001", customerId: "2001", disabled: false };
  const vehicleLink = {
    quibi_customer_id: "2001", quibi_vehicle_id: "3001", sync_status: "ok",
    local_fingerprint: vehicleFingerprint(localVehicle),
    external_fingerprint: vehicleFingerprint(remoteVehicle),
  };
  const input = { quote, customerId: "2001", detail, localVehicle, remoteVehicle, vehicleLink };
  assert.equal(verifiedCasePrice(input)?.amount, "125.50");
  assert.equal(verifiedCasePrice({ ...input, localVehicle: { ...localVehicle, vin: "OTHER" } }), null);
  assert.equal(verifiedCasePrice({ ...input, remoteVehicle: { ...remoteVehicle, id: "3002" } }), null);
  assert.equal(verifiedCasePrice({ ...input, vehicleLink: { ...vehicleLink, sync_status: "conflict" } }), null);
  assert.equal(verifiedCasePrice({ ...input, customerId: "2002" }), null);
  assert.equal(verifiedVehicleLink(input), true);
  assert.equal(verifiedVehicleLink({ ...input, remoteVehicle: { ...remoteVehicle, disabled: true } }), false);
  assert.equal(verifiedVehicleLink({ ...input, vehicleLink: { ...vehicleLink, sync_status: "never_checked" } }), false);
});

test("document vehicle mismatch rejects proposed case price", () => {
  const localVehicle = { vin: "TEST153D7E1AA2026", registration: "TEST153D7", make: "TEST", model: "QA" };
  const remoteVehicle = { ...localVehicle, id: "2387", customerId: "405956", disabled: false };
  const vehicleLink = { quibi_customer_id: "405956", quibi_vehicle_id: "2387", sync_status: "ok", local_fingerprint: vehicleFingerprint(localVehicle), external_fingerprint: vehicleFingerprint(remoteVehicle) };
  const document = { ...detail, id: "2176888", customerId: "405956", vehicleId: "WRONG", amount: "122" };
  const evidence = { ...quote, evidence_payload: { external_id: "2176888", customer_external_id: "405956" } };
  const input = { quote: evidence, customerId: "405956", detail: document, localVehicle, remoteVehicle, vehicleLink };
  assert.equal(verifiedCasePrice(input), null);
  assert.deepEqual(verifiedCasePrice({ ...input, detail: { ...document, vehicleId: "2387" } }), { amount: "122", state: "proposed", sourceId: "2176888" });
});
