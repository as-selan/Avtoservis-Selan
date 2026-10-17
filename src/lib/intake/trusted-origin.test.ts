import assert from "node:assert/strict";
import { test } from "node:test";
import { trustedPublicRequestOrigin, publicIntakeRequestOrigin } from "./trusted-origin.ts";

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

test("CLI Preview has no Git branch but accepts only its own declared HTTPS host", () => {
  const env = {VERCEL_ENV:"preview",VERCEL_URL:"own-build.vercel.app",PUBLIC_APP_ORIGIN:"https://stable.example.test"};
  assert.equal(publicIntakeRequestOrigin(env,"http://localhost:3000","own-build.vercel.app"),"https://own-build.vercel.app");
  assert.equal(publicIntakeRequestOrigin(env,"http://localhost:3000","stable.example.test"),"https://stable.example.test");
  assert.equal(publicIntakeRequestOrigin(env,"http://localhost:3000","attacker.vercel.app"),null);
  assert.equal(publicIntakeRequestOrigin(env,"http://localhost:3000",null),null);
  assert.equal(publicIntakeRequestOrigin({...env,VERCEL_ENV:"production"},"http://localhost:3000","own-build.vercel.app"),"https://stable.example.test");
});
