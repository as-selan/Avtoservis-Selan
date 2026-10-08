import assert from "node:assert/strict";
import { test } from "node:test";
import { computeManualIntakeCompleteness, computeIntakeCompleteness } from "./completeness.ts";
const vehicle = { vin: "TEST153D7E1AA2026", make: "TEST", model: "QA" };
test("manual accepts email only with complete vehicle", () => {
  assert.equal(computeManualIntakeCompleteness({ ...vehicle, phone: null, email: "qa@example.test" }).status, "new");
});
test("manual accepts phone only with complete vehicle", () => {
  assert.equal(computeManualIntakeCompleteness({ ...vehicle, phone: "041123456", email: null }).status, "new");
});
test("manual needs at least one contact and VIN make model", () => {
  assert.deepEqual(computeManualIntakeCompleteness({ phone: null, email: null, vin: null, make: null, model: null }).missing_fields, ["phone", "email", "vin", "make", "model"]);
});
test("web completeness still requires both contacts", () => {
  assert.deepEqual(computeIntakeCompleteness({ ...vehicle, phone: null, email: "qa@example.test" }).missing_fields, ["phone"]);
  assert.deepEqual(computeIntakeCompleteness({ ...vehicle, phone: "041123456", email: null }).missing_fields, ["email"]);
});
