import assert from "node:assert/strict";
import { test } from "node:test";
import { computeManualIntakeCompleteness } from "./completeness.ts";

test("completeness is new only when phone, email, vin, make, model present", () => {
  const full = computeManualIntakeCompleteness({
    phone: "041123456",
    email: "a@b.c",
    vin: "WBA1",
    make: "BMW",
    model: "320d",
  });
  assert.equal(full.status, "new");
  assert.deepEqual(full.missing_fields, []);
});

test("completeness lists missing fields for needs_data", () => {
  const partial = computeManualIntakeCompleteness({
    phone: "041123456",
    email: null,
    vin: null,
    make: "BMW",
    model: null,
  });
  assert.equal(partial.status, "needs_data");
  assert.deepEqual(partial.missing_fields, ["vin", "model"]);
});
