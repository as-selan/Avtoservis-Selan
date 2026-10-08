import { computeCompletionLifecycle } from "./lifecycle.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
test("completed manual data returns to explicit intake review", () => {
  const result = computeCompletionLifecycle({ phone: null, email: "qa@example.test", vin: "TEST153D7E1AA2026", make: "TEST", model: "QA" }, "manual");
  assert.equal(result.status, "new");
});
test("web completion cannot lower contact requirements", () => {
  assert.equal(computeCompletionLifecycle({ phone: null, email: "qa@example.test", vin: "TEST153D7E1AA2026", make: "TEST", model: "QA" }).status, "needs_data");
});
