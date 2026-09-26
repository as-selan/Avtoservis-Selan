import assert from "node:assert/strict";
import { test } from "node:test";
import { createQuibiReadClient } from "./client.ts";

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

test("read client rejects arbitrary customer IDs", async () => {
  const client = createQuibiReadClient({ username: "test", password: "secret", fetcher: (() => { throw Error("network must not run"); }) as typeof fetch });
  await assert.rejects(client.customer("12/../../x"), /QUIBI_INVALID_CUSTOMER_ID/);
});
