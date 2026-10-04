import assert from "node:assert/strict";
import { test } from "node:test";
import { assertRemoteDemoConfiguration } from "./config.ts";
import { createDemoQuibiReadClient } from "../quibi/demo-client.ts";
import { configuredQuibiReadClient } from "../quibi/client.ts";
import { demoEvidenceAllowed } from "./evidence.ts";

const demo = {
  SELAN_REMOTE_DEMO: "1", NEXT_PUBLIC_SELAN_REMOTE_DEMO: "1", VERCEL_ENV: "preview",
  SELAN_FIXED_PRICE_V1: "1",
  SELAN_DEMO_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-public-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-server-test-key",
  PUBLIC_APP_ORIGIN: "https://selan-demo.example.test",
  COMPLETION_PUBLIC_ORIGIN: "https://selan-demo.example.test",
};

test("remote demo requires its own project and rejects external configuration", () => {
  assert.doesNotThrow(() => assertRemoteDemoConfiguration(demo));
  assert.throws(() => assertRemoteDemoConfiguration({ VERCEL_ENV: "preview" }), /PREVIEW_DEMO_CONFIGURATION_REQUIRED/);
  assert.throws(() => assertRemoteDemoConfiguration({ ...demo,
    SELAN_DEMO_SUPABASE_PROJECT_REF: "verxxsjbewmkgoxwqvxo" }), /DEMO_PROJECT_REF_INVALID/);
  assert.throws(() => assertRemoteDemoConfiguration({ ...demo,
    NEXT_PUBLIC_SUPABASE_URL: "https://verxxsjbewmkgoxwqvxo.supabase.co" }), /DEMO_ISOLATION_REQUIRED/);
  assert.throws(() => assertRemoteDemoConfiguration({ ...demo, VERCEL_ENV: "production" }), /DEMO_ISOLATION_REQUIRED/);
  assert.throws(() => assertRemoteDemoConfiguration({ ...demo, NEXT_PUBLIC_SELAN_REMOTE_DEMO: "0" }), /DEMO_ISOLATION_REQUIRED/);
  assert.throws(() => assertRemoteDemoConfiguration({ ...demo, QUIBI_DEV_USERNAME: "any" }), /DEMO_EXTERNAL_CONFIG_FORBIDDEN/);
  assert.throws(() => assertRemoteDemoConfiguration({ ...demo, QUIBI_E2E_ORIGIN: "http://127.0.0.1:47862" }), /DEMO_EXTERNAL_CONFIG_FORBIDDEN/);
  assert.throws(() => assertRemoteDemoConfiguration({ ...demo, COMPLETION_PUBLIC_ORIGIN: "https://other.example.test" }), /DEMO_EXTERNAL_CONFIG_FORBIDDEN/);
});

test("remote Quibi fixture never returns another customer's vehicle or estimate", async () => {
  const client = createDemoQuibiReadClient();
  assert.equal((await client.searchCustomers("Nina"))[0]?.id, "2001");
  assert.equal((await client.vehicles("2002")).length, 0);
  await assert.rejects(() => client.vehicle("5001", "2002"), /QUIBI_VEHICLE_NOT_FOUND/);
  assert.equal((await client.estimates("2002")).length, 0);
  await assert.rejects(() => client.estimateDetail("4001", "2002"), /QUIBI_DOCUMENT_NOT_FOUND/);
  await assert.rejects(() => client.estimateDetail("9999", "2001"), /QUIBI_DOCUMENT_NOT_FOUND/);
  assert.equal((await client.estimateDetail("4001", "2001")).amount, "285.00");
});

test("configured remote demo uses only synthetic reads and QA-SIM evidence", async () => {
  const keys = Object.keys(demo);
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const fetchBefore = globalThis.fetch;
  try {
    Object.assign(process.env, demo);
    globalThis.fetch = (() => { throw new Error("demo must never use network fetch"); }) as typeof fetch;
    assert.equal((await configuredQuibiReadClient().estimateDetail("4001", "2001")).amount, "285.00");
    assert.equal(demoEvidenceAllowed("QA-SIM-QUOTE-01"), true);
    assert.equal(demoEvidenceAllowed("real-message-123"), false);
  } finally {
    globalThis.fetch = fetchBefore;
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
});
