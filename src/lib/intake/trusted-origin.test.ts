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

test("Vercel Preview accepts only its declared deployment and branch hosts", () => {
  const deployment = "build-team.vercel.app";
  const branch = "branch-team.vercel.app";
  const aliases = [deployment, branch];
  assert.equal(trustedPublicRequestOrigin(`https://${deployment}`, `https://${deployment}`, false,
    branch, aliases), `https://${branch}`);
  assert.equal(trustedPublicRequestOrigin(`https://${deployment}`, `https://${deployment}`, false,
    deployment, aliases), `https://${deployment}`);
  assert.equal(trustedPublicRequestOrigin(`https://${deployment}`, `https://${deployment}`, false,
    "attacker.vercel.app", aliases), null);
  assert.equal(trustedPublicRequestOrigin(`https://${deployment}`, `https://${deployment}`, false,
    "evil.test", aliases), null);
});
