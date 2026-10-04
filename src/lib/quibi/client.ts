import { parseCustomerDetail, parseCustomers, parseDocuments, parseEstimateDetail, parseVehicleDetail, parseVehicles } from "./contracts.ts";
import { assertPreproductionQuibiConfiguration, assertRemoteDemoConfiguration } from "../demo/config.ts";
import { createDemoQuibiReadClient } from "./demo-client.ts";

type Config = { username: string; password: string; fetcher?: typeof fetch; origin?: string };
const ORIGIN = "https://dev.quibi.net";

export function createQuibiReadClient(config: Config) {
  if (!config.username || !config.password) throw new Error("QUIBI_NOT_CONFIGURED");
  const fetcher = config.fetcher ?? fetch;
  const origin = config.origin ?? ORIGIN;

  async function read(path: string, method: "GET" | "POST" = "GET", customerId?: string): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetcher(`${origin}${path}`, {
          method,
          headers: { username: config.username, password: config.password, "Content-Type": "application/json" },
          body: method === "POST" ? JSON.stringify({ Filtriraj: { stranka: Number(customerId) } }) : undefined,
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          if (response.status >= 500 && attempt === 0) continue;
          throw new Error(`QUIBI_HTTP_${response.status}`);
        }
        return await response.json();
      } catch (error) {
        if (attempt === 1 || (error instanceof Error && error.message.startsWith("QUIBI_HTTP_"))) throw error;
      }
    }
    throw new Error("QUIBI_READ_FAILED");
  }

  const validId = (id: string) => {
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) throw new Error("QUIBI_INVALID_CUSTOMER_ID");
    return id;
  };

  return {
    async searchCustomers(query: string) {
      const needle = query.trim().toLocaleLowerCase("sl-SI");
      if (needle.length < 2 || needle.length > 100) return [];
      const customers = parseCustomers(await read("/api2/stranka"));
      return customers.filter((customer) => [customer.id, customer.name, customer.phone, customer.email]
        .some((value) => value.toLocaleLowerCase("sl-SI").includes(needle))).slice(0, 30);
    },
    async customer(id: string) {
      const value = parseCustomerDetail(await read(`/api2/stranka/view/${validId(id)}`));
      if (value.id !== id) throw new Error("QUIBI_CUSTOMER_ID_MISMATCH");
      return value;
    },
    async vehicles(customerId: string) {
      const id = validId(customerId);
      return parseVehicles(await read(`/api2/vozila/index/${id}`)).filter((vehicle) => vehicle.customerId === id);
    },
    async vehicle(id: string, customerId: string) {
      const vehicleId = validId(id);
      return parseVehicleDetail(await read(`/api2/vozila/view/${vehicleId}`), vehicleId, validId(customerId));
    },
    async workOrders(customerId: string) {
      const id = validId(customerId);
      return parseDocuments(await read("/api2/dn", "POST", id), id);
    },
    async estimates(customerId: string) {
      const id = validId(customerId);
      return parseDocuments(await read("/api2/predracuni", "POST", id), id);
    },
    async invoices(customerId: string) {
      const id = validId(customerId);
      return parseDocuments(await read("/api2/fakture", "POST", id), id);
    },
    async estimateDetail(id: string, customerId: string) {
      return parseEstimateDetail(await read(`/api2/glavadokumenta/view/${validId(id)}`), id, validId(customerId));
    },
  };
}

export function configuredQuibiReadClient() {
  if (process.env.APP_ENV === "preproduction") {
    assertPreproductionQuibiConfiguration();
    return createQuibiReadClient({
      username: process.env.QUIBI_DEV_USERNAME ?? "",
      password: process.env.QUIBI_DEV_PASSWORD ?? "",
    });
  }
  if (process.env.SELAN_REMOTE_DEMO === "1") {
    assertRemoteDemoConfiguration();
    return createDemoQuibiReadClient();
  }
  // The fixture is available only in disposable CI, and only on loopback.
  const fixture = process.env.CI === "true" && process.env.SELAN_ISOLATED_E2E === "1"
    ? process.env.QUIBI_E2E_ORIGIN : undefined;
  // A local manual-review session must never silently fall back to dev.quibi.net
  // when one test flag was omitted during an app restart.
  if (process.env.SELAN_LOCAL_REVIEW === "1" && !fixture) {
    throw new Error("QUIBI_LOCAL_FIXTURE_REQUIRED");
  }
  if (fixture && !/^http:\/\/127\.0\.0\.1:\d+$/.test(fixture)) {
    throw new Error("QUIBI_INVALID_TEST_ORIGIN");
  }
  return createQuibiReadClient({
    username: process.env.QUIBI_DEV_USERNAME ?? "",
    password: process.env.QUIBI_DEV_PASSWORD ?? "",
    origin: fixture,
  });
}
