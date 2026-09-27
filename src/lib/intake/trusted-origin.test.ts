import assert from "node:assert/strict";
import { test } from "node:test";
import { trustedPublicRequestOrigin } from "./trusted-origin.ts";

test("configured public origin wins over an internal Next origin", () => {
  assert.equal(trustedPublicRequestOrigin("http://127.0.0.1:3000", "http://localhost:3000", true), "http://127.0.0.1:3000");
  assert.equal(trustedPublicRequestOrigin(undefined, "https://app.example.test", false), "https://app.example.test");
});

test("invalid and untrusted configured origins fail closed", () => {
  assert.equal(trustedPublicRequestOrigin("http://127.0.0.1:3000", "http://localhost:3000", false), null);
  assert.equal(trustedPublicRequestOrigin("https://evil.test/path", "https://app.example.test", false), null);
});
