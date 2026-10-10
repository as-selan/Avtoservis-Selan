import {
  assertQuibiDevTestSendAllowed, quibiDevTestRecipient, assertQuibiDevWriteAllowed, parseQuibiWriteResponse, QUIBI_DEV_ORIGIN,
  validQuibiId, type EstimateBody,
} from "./write-contract.ts";

import { quibiWorkflowConfig, actualCustomerEmail } from "./workflow-config.ts";

type Config = { username: string; password: string; fetcher?: typeof fetch; origin?: string;
  environment?: Record<string, string | undefined> };

function responseData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error("QUIBI_INVALID_RESPONSE");
  const envelope = value as Record<string, unknown>;
  if (envelope.error !== false) throw new Error("QUIBI_API_REJECTED");
  if (!envelope.data || typeof envelope.data !== "object") throw new Error("QUIBI_INVALID_RESPONSE");
  return envelope.data as Record<string, unknown>;
}
export function createQuibiDevWriteClient(config: Config) { return createTransport(config, false); }
export function createQuibiWorkflowWriteClient(config: Config) { return createTransport(config, true); }
function createTransport(config: Config, workflow: boolean) {
  if (typeof window !== "undefined") throw new Error("QUIBI_SERVER_ONLY");
  const env = config.environment ?? process.env;
  const selected = workflow ? quibiWorkflowConfig(env, "write") : null;
  const origin = config.origin ?? selected?.origin ?? QUIBI_DEV_ORIGIN;
  function guard(capability: "write" | "send") {
    if (workflow) {
      const current = quibiWorkflowConfig(env, capability);
      if (origin !== current.origin || config.username !== current.username || config.password !== current.password)
        throw new Error("QUIBI_WORKFLOW_DISABLED");
    } else assertQuibiDevWriteAllowed({ ...env, QUIBI_DEV_USERNAME: config.username, QUIBI_DEV_PASSWORD: config.password }, origin);
  }
  guard("write");
  const fetcher = config.fetcher ?? fetch;

  async function call(path: string, method: "GET" | "POST", body?: object): Promise<unknown> {
    // Writes are never retried at the HTTP layer. Callers retry only the exact
    // persisted document body with Quibi's external_id contract.
    guard(path.includes("/send") ? "send" : "write");
    const response = await fetcher(`${origin}${path}`, {
      method, headers: { username: config.username, password: config.password,
        "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`QUIBI_HTTP_${response.status}`);
    return response.json();
  }

  return {
    async createCustomer(customer: { remote_id: string; naziv: string; emajl?: string; telst?: string }) {
      if (!/^[0-9a-f-]{36}$/i.test(customer.remote_id) || !customer.naziv.trim())
        throw new Error("QUIBI_INVALID_CUSTOMER_INPUT");
      return responseData(await call("/api2/stranka/form", "POST", { Stranka: customer }));
    },
    async updateCustomer(id: string, customer: { naziv?: string; emajl?: string; telst?: string }) {
      return responseData(await call(`/api2/stranka/form/${validQuibiId(id)}`, "POST", { Stranka: customer }));
    },
    async createVehicle(vehicle: { stranka_id: string; registrskastevilka: string;
      internastevilka?: string; proizvajalec?: string; model?: string }) {
      if (!vehicle.registrskastevilka.trim()) throw new Error("QUIBI_REGISTRATION_REQUIRED");
      const data = responseData(await call("/api2/vozila/form", "POST", { Vozila: {
        ...vehicle, stranka_id: Number(validQuibiId(vehicle.stranka_id)),
      } }));
      const entry = data.Vozila as Record<string, unknown> | undefined;
      const id = String(entry?.Vozilo ?? "");
      return validQuibiId(id);
    },
    async updateVehicle(id: string, vehicle: { registrskastevilka?: string; internastevilka?: string;
      proizvajalec?: string; model?: string }) {
      return responseData(await call(`/api2/vozila/form/${validQuibiId(id)}`, "POST", { Vozila: vehicle }));
    },
    async getNumberings() {
      const data = responseData(await call("/api2/stevilcenje?glavadokumenta=1", "GET"));
      if (!Array.isArray(data.Stevilcenje)) throw new Error("QUIBI_INVALID_RESPONSE");
      return data.Stevilcenje as Array<{ Stevilcenje: { id: string; naziv: string; glava_id: string } }>;
    },
    async getSaleTypes() { return responseData(await call("/api2/glavadokumenta/vrstaprodaje", "GET")); },
    async getUnits() { return responseData(await call("/api2/enota", "GET")); },
    async getVatRates() { return responseData(await call("/api2/ddv", "GET")); },
    async getArticles() { return responseData(await call("/api2/sifranti", "GET")); },
    async createEstimate(body: EstimateBody) {
      if ("id" in body.Glavadokumenta || !body.Glavadokumenta.external_id ||
          Object.keys(body.Postavkedokumenta).length === 0) throw new Error("QUIBI_INVALID_ESTIMATE_INPUT");
      return parseQuibiWriteResponse(await call("/api2/glavadokumenta/form", "POST", body));
    },
    async updateEstimate(id: string, body: EstimateBody) {
      if (body.Glavadokumenta.id !== Number(validQuibiId(id)) ||
          Object.keys(body.Postavkedokumenta).length === 0) throw new Error("QUIBI_INVALID_ESTIMATE_INPUT");
      return parseQuibiWriteResponse(await call(`/api2/glavadokumenta/form/${id}`, "POST", body));
    },
    async sendDocument(id: string, email: string, subject?: string, content?: string) {
      if (workflow) {
        guard("send");
        if (selected?.mode === "production") actualCustomerEmail(email, email);
        else if (email !== quibiDevTestRecipient(env)) throw new Error("QUIBI_TEST_RECIPIENT_REQUIRED");
      } else assertQuibiDevTestSendAllowed({ ...env, QUIBI_DEV_USERNAME: config.username, QUIBI_DEV_PASSWORD: config.password }, origin);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          (selected?.mode !== "production" && email !== env.QUIBI_DEV_TEST_RECIPIENT))
        throw new Error("QUIBI_TEST_RECIPIENT_REQUIRED");
      const value = await call(`/api2/glavadokumenta/send/${validQuibiId(id)}`, "POST", {
        email, ...(subject ? { zadeva: subject } : {}), ...(content ? { vsebina: content } : {}),
      });
      const data = responseData(value);
      const sendId = String(data.send_id ?? "");
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sendId) || data.status !== "queued") throw new Error("QUIBI_INVALID_RESPONSE");
      return { sendId, status: "queued" as const };
    },
    async getSendStatus(id: string, sendId: string) {
      if (workflow) guard("send");
      else assertQuibiDevTestSendAllowed({ ...env, QUIBI_DEV_USERNAME: config.username, QUIBI_DEV_PASSWORD: config.password }, origin);
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sendId)) throw new Error("QUIBI_INVALID_SEND_ID");
      const data = responseData(await call(`/api2/glavadokumenta/send_status/${validQuibiId(id)}?send_id=${encodeURIComponent(sendId)}`, "GET"));
      if (!["queued", "sent", "failed"].includes(String(data.status))) throw new Error("QUIBI_INVALID_RESPONSE");
      return { status: data.status as "queued" | "sent" | "failed",
        error: typeof data.napaka === "string" ? data.napaka.slice(0, 200) : null };
    },
  };
}
