import assert from "node:assert/strict";
import test from "node:test";
import { canAdvancePreliminaryInspection } from "./eligibility.ts";

test("inspection cannot be started or completed after the case leaves offer preparation", () => {
  for (const status of ["awaiting_customer_approval", "awaiting_slot_selection", "appointment_confirmed", "declined", "closed"]) {
    assert.equal(canAdvancePreliminaryInspection(status, "request"), false);
    assert.equal(canAdvancePreliminaryInspection(status, "complete"), false);
  }
  assert.equal(canAdvancePreliminaryInspection("new", "request"), true);
  assert.equal(canAdvancePreliminaryInspection("preparing_offer", "request"), true);
  assert.equal(canAdvancePreliminaryInspection("preparing_offer", "complete"), true);
  assert.equal(canAdvancePreliminaryInspection("preparing_offer", "repair_not_ordered"), true);
  assert.equal(canAdvancePreliminaryInspection("awaiting_slot_selection", "repair_ordered"), true);
  assert.equal(canAdvancePreliminaryInspection("declined", "repair_not_ordered"), true);
  assert.equal(canAdvancePreliminaryInspection("appointment_confirmed", "repair_not_ordered"), false);
});
