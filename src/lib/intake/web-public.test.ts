import assert from "node:assert/strict";
import test from "node:test";
import { parseWebIntakeBody, publicWebIntakeFailure, sanitizeWebIntakePublicResponse } from "./web-public.ts";

const inquiry = { clientRequestId: "00000000-0000-4000-8000-000000000001", displayName: "QA", phone: "+386000000000", email: "qa@example.test", vin: "TESTAUTX20261011A", make: "TEST", model: "AUTO", problemDescription: "QA", companyWebsite: "" };

test("empty or absent trap permits normal validation without losing inquiry fields", () => {
  for (const companyWebsite of [undefined, "", "   "]) {
    const result = parseWebIntakeBody(JSON.stringify({ ...inquiry, companyWebsite }));
    assert.ok(result.ok && !result.honeypotTriggered);
    assert.equal(result.raw.displayName, inquiry.displayName);
    assert.equal(result.raw.vin, inquiry.vin);
  }
});

test("autofilled website is flagged rather than treated as persisted inquiry", () => {
  const result = parseWebIntakeBody(JSON.stringify({ ...inquiry, companyWebsite: "https://example.test" }));
  assert.deepEqual(result, { ok: true, honeypotTriggered: true });
});

test("verification rejection remains failure through public response sanitization", () => {
  const response = sanitizeWebIntakePublicResponse(publicWebIntakeFailure({ fieldErrors: { companyWebsite: "Oddaja ni bila shranjena. Poskusite znova." } }));
  assert.equal(response.ok, false);
  if (!response.ok) assert.match(response.fieldErrors?.companyWebsite ?? "", /ni bila shranjena/);
});

test("malformed and non-successful server results cannot become confirmation", () => {
  for (const result of [null, undefined, {}, { ok: false }, { ok: "true" }]) assert.equal(sanitizeWebIntakePublicResponse(result).ok, false);
});
