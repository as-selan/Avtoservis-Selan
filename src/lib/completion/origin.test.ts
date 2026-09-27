import assert from "node:assert/strict";
import { test } from "node:test";
import { configuredCompletionOrigin } from "./origin.ts";

test("completion origin is a configured HTTPS origin only", () => {
  assert.equal(configuredCompletionOrigin("https://test.example.test", false), "https://test.example.test");
  assert.equal(configuredCompletionOrigin("https://evil.test/path", false), null);
  assert.equal(configuredCompletionOrigin("https://user:pass@test.example.test", false), null);
  assert.equal(configuredCompletionOrigin(undefined, false), null);
});

test("plain HTTP is limited to loopback in disposable CI", () => {
  assert.equal(configuredCompletionOrigin("http://127.0.0.1:3000", true), "http://127.0.0.1:3000");
  assert.equal(configuredCompletionOrigin("http://127.0.0.1:3000", false), null);
  assert.equal(configuredCompletionOrigin("http://evil.test", true), null);
});
