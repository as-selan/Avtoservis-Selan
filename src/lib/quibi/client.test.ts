import assert from "node:assert/strict";
import { test } from "node:test";
import { configuredQuibiReadClient, createQuibiReadClient } from "./client.ts";

test("local review fails closed when fixture flags are incomplete", () => {
  const previous = { review: process.env.SELAN_LOCAL_REVIEW, ci: process.env.CI,
    isolated: process.env.SELAN_ISOLATED_E2E, origin: process.env.QUIBI_E2E_ORIGIN };
  try {
    process.env.SELAN_LOCAL_REVIEW = "1";
    delete process.env.CI;
    process.env.SELAN_ISOLATED_E2E = "1";
    process.env.QUIBI_E2E_ORIGIN = "http://127.0.0.1:47862";
    assert.throws(() => configuredQuibiReadClient(), /QUIBI_LOCAL_FIXTURE_REQUIRED/);
  } finally {
    for (const [key, value] of Object.entries({ SELAN_LOCAL_REVIEW: previous.review, CI: previous.ci,
      SELAN_ISOLATED_E2E: previous.isolated, QUIBI_E2E_ORIGIN: previous.origin })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("read client uses only approved dev endpoints and filters documents", async () => {
  const calls: Array<{ path: string; method: string }> = [];
  const fake = async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    calls.push({ path, method: init?.method ?? "GET" });
    const response = path === "/api2/stranka" ? { error: false, data: { Stranke: [{ Stranka: { id: 12, naziv: "Ana" } }] } }
      : { error: false, data: { Dokumenti: [{ Glavadokumenta: { id: 4, stranka_id: 12 } }, { Glavadokumenta: { id: 5, stranka_id: 99 } }] } };
    return new Response(JSON.stringify(response), { status: 200 });
  };
  const client = createQuibiReadClient({ username: "test", password: "secret", fetcher: fake as typeof fetch });
  assert.equal((await client.searchCustomers("ana"))[0].id, "12");
  assert.deepEqual((await client.workOrders("12")).map((item) => item.id), ["4"]);
  assert.deepEqual(calls, [{ path: "/api2/stranka", method: "GET" }, { path: "/api2/dn", method: "POST" }]);
});

test("invoice reads use the documented list endpoint and keep only the confirmed customer", async () => {
  const calls: string[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(`${init?.method}:${new URL(String(input)).pathname}`);
    assert.deepEqual(JSON.parse(String(init?.body)), { Filtriraj: { stranka: 12 } });
    return new Response(JSON.stringify({ error: false, data: { Dokumenti: [
      { Glavadokumenta: { id: 81, stranka_id: 12, statusi_id: 4 }, Statusi: { id: 4, naziv: "Izdano" } },
      { Glavadokumenta: { id: 82, stranka_id: 13, statusi_id: 4 }, Statusi: { id: 4, naziv: "Izdano" } },
    ] } }));
  };
  const client = createQuibiReadClient({ username: "test", password: "secret", fetcher: fake as typeof fetch });
  assert.deepEqual((await client.invoices("12")).map((item) => [item.id, item.status]), [["81", "Izdano"]]);
  assert.deepEqual(calls, ["POST:/api2/fakture"]);
});

test("read client rejects arbitrary customer IDs", async () => {
  const client = createQuibiReadClient({ username: "test", password: "secret", fetcher: (() => { throw Error("network must not run"); }) as typeof fetch });
  await assert.rejects(client.customer("12/../../x"), /QUIBI_INVALID_CUSTOMER_ID/);
});

test("vehicle adapter reads only the confirmed customer's Quibi vehicles and validates detail ownership", async () => {
  const calls: string[] = [];
  const fake = async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    calls.push(path);
    const one = { Vozila: { id: 972, stranka_id: 12, internastevilka: "VIN-A", disabled: 0 } };
    const other = { Vozila: { id: 973, stranka_id: 13, internastevilka: "VIN-A", disabled: 0 } };
    const data = path === "/api2/vozila/index/12" ? { Vozila: [one, other] } : { Vozilo: one };
    return new Response(JSON.stringify({ error: false, data }), { status: 200 });
  };
  const client = createQuibiReadClient({ username: "test", password: "secret", fetcher: fake as typeof fetch });
  assert.deepEqual((await client.vehicles("12")).map((vehicle) => vehicle.id), ["972"]);
  assert.equal((await client.vehicle("972", "12")).vin, "VIN-A");
  await assert.rejects(client.vehicle("972", "13"), /QUIBI_CUSTOMER_ID_MISMATCH/);
  assert.deepEqual(calls, ["/api2/vozila/index/12", "/api2/vozila/view/972", "/api2/vozila/view/972"]);
});
