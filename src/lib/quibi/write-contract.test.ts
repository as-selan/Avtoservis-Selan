import assert from "node:assert/strict";
import { test } from "node:test";
import { assertQuibiDevWriteAllowed, buildEstimateBody, stableEstimatePayload, withDocumentId } from "./write-contract.ts";
import { createQuibiDevWriteClient } from "./write-http.ts";

const env = { APP_ENV: "preproduction", QUIBI_MODE: "dev", QUIBI_DEV_WRITE_ENABLED: "1",
  VERCEL_ENV: "preview", QUIBI_DEV_USERNAME: "synthetic-user", QUIBI_DEV_PASSWORD: "synthetic-password",
  QUIBI_DEV_TEST_RECIPIENT: "test@example.invalid" };
const input = { numberingId: "2061", saleTypeId: "1", customerId: "405956", vehicleId: "2387",
  serviceRequestId: "00000000-0000-4000-8000-000000000001", lines: [
    { opis: "TEST storitev", enota_id: "1", ddv_id: "5", kolicina: 1, cenaZDDV: 100, popust: 0 },
  ] };

test("DEV write guard rejects production, demo, and missing explicit enablement", () => {
  assert.doesNotThrow(() => assertQuibiDevWriteAllowed(env));
  for (const origin of ["https://si.quibi.net", "https://si.quibi.dev", "http://dev.quibi.net"])
    assert.throws(() => assertQuibiDevWriteAllowed(env, origin), /QUIBI_DEV_WRITE_DISABLED/);
  assert.throws(() => assertQuibiDevWriteAllowed({ ...env, QUIBI_MODE: "demo" }), /QUIBI_DEV_WRITE_DISABLED/);
  assert.throws(() => assertQuibiDevWriteAllowed({ ...env, QUIBI_DEV_WRITE_ENABLED: "0" }), /QUIBI_DEV_WRITE_DISABLED/);
  assert.throws(() => assertQuibiDevWriteAllowed({ ...env, VERCEL_ENV: "production" }), /QUIBI_DEV_WRITE_DISABLED/);
  assert.throws(() => assertQuibiDevWriteAllowed(env, "https://www.quibi.net"), /QUIBI_DEV_WRITE_DISABLED/);
});

test("Quibi external_id conflict fails without choosing a new document ID", async () => {
  let posts = 0;
  const client = createQuibiDevWriteClient({ username: env.QUIBI_DEV_USERNAME,
    password: env.QUIBI_DEV_PASSWORD, environment: env, fetcher: async () => {
      posts++;
      return new Response(JSON.stringify({ error: true }), { status: 409 });
    } });
  await assert.rejects(client.createEstimate(buildEstimateBody(input)), /QUIBI_HTTP_409/);
  assert.equal(posts, 1);
});

test("create body and external_id stay byte identical for retry", () => {
  const first = buildEstimateBody(input);
  const retry = buildEstimateBody(input);
  assert.equal(first.Glavadokumenta.external_id, `selan-service-request:${input.serviceRequestId}`);
  assert.deepEqual(stableEstimatePayload(first), stableEstimatePayload(retry));
  assert.notEqual(stableEstimatePayload(first).sha256,
    stableEstimatePayload(buildEstimateBody({ ...input, lines: [{ ...input.lines[0], cenaZDDV: 101 }] })).sha256);
  assert.deepEqual(Object.keys(withDocumentId(first, "2176888").Postavkedokumenta), ["1"]);
  assert.throws(() => buildEstimateBody({ ...input, lines: [] }), /QUIBI_INVALID_ESTIMATE_INPUT/);
});

test("write client uses exact DEV endpoints, complete update lines, and test recipient only", async () => {
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  const fake = async (target: string | URL | Request, options?: RequestInit) => {
    const url = new URL(String(target));
    assert.equal(url.origin, "https://dev.quibi.net");
    const body = options?.body ? JSON.parse(String(options.body)) : null;
    calls.push({ path: url.pathname + url.search, method: String(options?.method), body });
    const payload = url.pathname.includes("send_status") ? { error: false, data: { status: "sent" } }
      : url.pathname.includes("/send/") ? { error: false, data: { send_id: "test-send-1", status: "queued" } }
      : url.pathname.includes("/stevilcenje") ? { error: false, data: { Stevilcenje: [
        { Stevilcenje: { id: "2061", naziv: "Predračun", glava_id: "2" } },
      ] } } : { error: false, id: 2176888, ZapSt: "TEST-1", replayed: false };
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  const client = createQuibiDevWriteClient({ username: env.QUIBI_DEV_USERNAME,
    password: env.QUIBI_DEV_PASSWORD, environment: env, fetcher: fake as typeof fetch });
  const body = buildEstimateBody(input);
  assert.equal((await client.getNumberings())[0].Stevilcenje.naziv, "Predračun");
  assert.equal((await client.createEstimate(body)).id, "2176888");
  await client.updateEstimate("2176888", withDocumentId(body, "2176888"));
  assert.deepEqual(Object.keys((calls[2].body as { Postavkedokumenta: object }).Postavkedokumenta), ["1"]);
  await assert.rejects(client.sendDocument("2176888", "customer@example.test"), /QUIBI_TEST_RECIPIENT_REQUIRED/);
  assert.equal((await client.sendDocument("2176888", env.QUIBI_DEV_TEST_RECIPIENT)).sendId, "test-send-1");
  assert.equal((await client.getSendStatus("2176888", "test-send-1")).status, "sent");
  assert.deepEqual(calls.map((item) => item.path), [
    "/api2/stevilcenje?glavadokumenta=1", "/api2/glavadokumenta/form",
    "/api2/glavadokumenta/form/2176888", "/api2/glavadokumenta/send/2176888",
    "/api2/glavadokumenta/send_status/2176888?send_id=test-send-1",
  ]);
});
