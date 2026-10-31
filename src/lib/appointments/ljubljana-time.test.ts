import assert from "node:assert/strict";
import test from "node:test";
import { ljubljanaWallTimeToIso } from "./ljubljana-time.ts";

test("Ljubljana wall times retain the correct seasonal UTC offset", () => {
  assert.equal(ljubljanaWallTimeToIso("2026-01-15T10:00"), "2026-01-15T09:00:00.000Z");
  assert.equal(ljubljanaWallTimeToIso("2026-07-15T10:00"), "2026-07-15T08:00:00.000Z");
});
test("ambiguous and missing daylight-saving times fail closed", () => {
  assert.equal(ljubljanaWallTimeToIso("2026-03-29T02:30"), null);
  assert.equal(ljubljanaWallTimeToIso("2026-10-25T02:30"), null);
  assert.equal(ljubljanaWallTimeToIso("2026-02-30T12:00"), null);
});
