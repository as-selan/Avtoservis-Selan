import assert from "node:assert/strict";
import { test } from "node:test";
import { readFailureCode, syncOutcome } from "./sync-state.ts";

test("unchanged remote data clears an earlier read error", () => {
  assert.deepEqual(syncOutcome("a".repeat(64), "a".repeat(64)), {
    sync_status: "ok", last_seen_fingerprint: "a".repeat(64), last_error_code: null,
  });
});

test("remote drift does not overwrite the confirmed baseline", () => {
  assert.deepEqual(syncOutcome("a".repeat(64), "b".repeat(64)).sync_status, "remote_changed");
});

test("read failure classification never stores upstream details", () => {
  assert.equal(readFailureCode(new Error("QUIBI_HTTP_503")), "QUIBI_UNAVAILABLE");
  assert.equal(readFailureCode(new Error("password=private; upstream body")), "QUIBI_READ_FAILED");
});
