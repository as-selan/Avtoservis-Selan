import assert from "node:assert/strict";
import { test } from "node:test";
import { nextCaseStep } from "./next-step.ts";

test("missing data continues the same case before any offer step", () => {
  assert.equal(nextCaseStep({ status: "needs_data", offerPrepared: false, quibiLinked: false }).kind, "request_data");
});

test("prepared case with a Quibi link still cannot claim an estimate exists", () => {
  assert.equal(nextCaseStep({ status: "preparing_offer", offerPrepared: true, quibiLinked: true }).kind, "quote_contract_blocked");
});

test("changed customer data blocks the next Quibi-dependent step", () => {
  assert.equal(nextCaseStep({ status: "preparing_offer", offerPrepared: false, quibiLinked: true, quibiSyncStatus: "both_changed" }).kind, "review_quibi_mismatch");
});

test("confirmed internal appointment never claims external calendar sync", () => {
  const step = nextCaseStep({ status: "appointment_confirmed", offerPrepared: true, quibiLinked: true });
  assert.equal(step.kind, "manual_external_handoff");
  assert.equal(step.externalConfirmed, false);
});
