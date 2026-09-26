import { parseCustomerDetail, parseCustomers, parseDocuments } from "./contracts.ts";

type Config = { username: string; password: string; fetcher?: typeof fetch };
const ORIGIN = "https://dev.quibi.net";

export function createQuibiReadClient(config: Config) {
  if (!config.username || !config.password) throw new Error("QUIBI_NOT_CONFIGURED");
  const fetcher = config.fetcher ?? fetch;

  async function read(path: string, method: "GET" | "POST" = "GET"): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetcher(`${ORIGIN}${path}`, {
          method,
          headers: { username: config.username, password: config.password, "Content-Type": "application/json" },
          body: method === "POST" ? JSON.stringify({ Filtriraj: {} }) : undefined,
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
    if (!/^\d+$/.test(id)) throw new Error("QUIBI_INVALID_CUSTOMER_ID");
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
    async workOrders(customerId: string) {
      return parseDocuments(await read("/api2/dn", "POST"), validId(customerId));
    },
    async estimates(customerId: string) {
      return parseDocuments(await read("/api2/predracuni", "POST"), validId(customerId));
    },
  };
}

export function configuredQuibiReadClient() {
  return createQuibiReadClient({
    username: process.env.QUIBI_DEV_USERNAME ?? "",
    password: process.env.QUIBI_DEV_PASSWORD ?? "",
  });
}
