import {validCustomerRemoteId} from './customer-remote-id.ts';
import {assertLocalPartyWriteTarget} from './local-write-policy.ts';
import {
  assertQuibiDevTestSendAllowed, quibiDevTestRecipient, assertQuibiDevWriteAllowed, parseQuibiWriteResponse, QUIBI_DEV_ORIGIN,
  validQuibiId, type EstimateBody,
} from "./write-contract.ts";

import { quibiWorkflowConfig, actualCustomerEmail } from "./workflow-config.ts";

type Config = { username: string; password: string; fetcher?: typeof fetch; origin?: string;
  statusOnly?: boolean; environment?: Record<string, string | undefined> };

/** Only bounded validation text; never store the raw provider envelope or request. */
export function safeQuibiValidation(value:Record<string,unknown>,secrets:string[]=[]){
 const clean=(value:unknown):string=>{
  if(typeof value!=='string'&&typeof value!=='number')return '';
  let text=String(value).replace(/<[^>]*>/g,' ').replace(/[\r\n\t]+/g,' ');
  for(const secret of secrets.filter(Boolean))text=text.split(secret).join('[redacted]');
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]')
   .replace(/(?:password|geslo|token|authorization|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi,'[credential]')
   .replace(/\beyJ[A-Za-z0-9_.-]+/g,'[token]').replace(/\b(?:\+?\d[ ()-]*){9,}\b/g,'[number]').slice(0,400).trim();
 };
 const errors:Record<string,string>={};
 const collect=(item:unknown,path:string,depth=0)=>{
  if(depth>3||Object.keys(errors).length>=15)return;
  if(typeof item==='string'&&item.length<=4000&&item.trim().startsWith('{')){try{const parsed:unknown=JSON.parse(item);if(parsed&&typeof parsed==='object'){collect(parsed,path,depth+1);return}}catch{}}
  if(typeof item==='string'||typeof item==='number'){const text=clean(item);if(text)errors[path||'document']=text;return}
  if(item&&typeof item==='object')for(const [key,v] of Object.entries(item).slice(0,15)){
   if(!/^[A-Za-z0-9_.]{1,80}$/.test(key)||/password|geslo|token|email|emajl|naslov|telst|username/i.test(key))continue;
   collect(v,path?path+'.'+key:key,depth+1);
  }
 };
 collect(value.errors,'');
 const message=clean(value.message);
 return {message,errors,summary:[message,...Object.entries(errors).map(([field,reason])=>field+': '+reason)].filter(Boolean).join(' ').slice(0,1200)};
}
export class QuibiValidationError extends Error {
 readonly validation:ReturnType<typeof safeQuibiValidation>;
 constructor(value:Record<string,unknown>,secrets:string[]=[]){super('QUIBI_API_REJECTED');this.name='QuibiValidationError';this.validation=safeQuibiValidation(value,secrets)}
}

export function quibiRejectionDiagnostics(value:Record<string,unknown>){
 const text=JSON.stringify({message:value.message,errors:value.errors}).toLocaleLowerCase('sl-SI');
 const reasons=[['customer','strank|customer'],['vehicle','vozil|vehicle'],['numbering','številčen|stevilcen|numbering'],['permission','pravic|permission|dovoljen|forbidden'],['line','postavk|artikel|article'],['price','cen[ae]|price'],['vat','ddv|(^|[^a-z])vat([^a-z]|$)']].filter(([,pattern])=>new RegExp(pattern).test(text)).map(([code])=>code);
 return {reasons,errorShape:Array.isArray(value.errors)?'array':typeof value.errors};
}
function responseData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error("QUIBI_INVALID_RESPONSE");
  const envelope = value as Record<string, unknown>;
  if (envelope.error === true) throw new Error("QUIBI_API_REJECTED");
  if (envelope.error !== false) throw new Error("QUIBI_INVALID_RESPONSE");
  if (!envelope.data || typeof envelope.data !== "object") throw new Error("QUIBI_INVALID_RESPONSE");
  return envelope.data as Record<string, unknown>;
}
export function createQuibiDevWriteClient(config: Config) { return createTransport(config, false); }
export function createQuibiWorkflowWriteClient(config: Config) { return createTransport(config, true); }
function createTransport(config: Config, workflow: boolean) {
  if (typeof window !== "undefined") throw new Error("QUIBI_SERVER_ONLY");
  const env = config.environment ?? process.env;
  const selected = workflow ? quibiWorkflowConfig(env, config.statusOnly ? "read" : "write") : null;
  const origin = config.origin ?? selected?.origin ?? QUIBI_DEV_ORIGIN;
  function guard(capability: "write" | "send") {
    if (workflow) {
      const current = quibiWorkflowConfig(env, config.statusOnly ? "read" : capability);
      if (origin !== current.origin || config.username !== current.username || config.password !== current.password)
        throw new Error("QUIBI_WORKFLOW_DISABLED");
    } else assertQuibiDevWriteAllowed({ ...env, QUIBI_DEV_USERNAME: config.username, QUIBI_DEV_PASSWORD: config.password }, origin);
  }
  guard("write");
  const fetcher = config.fetcher ?? fetch;

  async function call(path: string, method: "GET" | "POST", body?: object): Promise<unknown> {
    // Writes are never retried at the HTTP layer. Callers retry only the exact
    // persisted document body with Quibi's external_id contract.
    if (config.statusOnly && (method !== "GET" || !path.startsWith("/api2/glavadokumenta/send_status/"))) throw Error("QUIBI_STATUS_ONLY");
    guard(path.includes("/send") ? "send" : "write");
    if (workflow && env.QUIBI_DEV_LOCAL_SEND_ENABLED === "1" && method === "POST" &&
        path !== "/api2/glavadokumenta/send/2176888") throw new Error("QUIBI_LOCAL_SEND_ONLY");
    assertLocalPartyWriteTarget(env,path,method,body);
    const response = await fetcher(`${origin}${path}`, {
      method, headers: { username: config.username, password: config.password,
        "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000),
    });
    if (!response.ok){const rejection:unknown=await response.json().catch(()=>null);console.error(JSON.stringify({event:'quibi_transport_failure',path:path.split('?')[0],status:response.status,...(rejection&&typeof rejection==='object'?{validation:safeQuibiValidation(rejection as Record<string,unknown>,[config.username,config.password])}:{})}));if([400,401,403,404,405,410,422].includes(response.status)&&rejection&&typeof rejection==='object'&&(rejection as Record<string,unknown>).error===true)throw new QuibiValidationError(rejection as Record<string,unknown>,[config.username,config.password]);throw new Error(`QUIBI_HTTP_${response.status}`);}
    const payload:unknown=await response.json();
    if(payload&&typeof payload==='object'&&(payload as Record<string,unknown>).error===true){const errors=(payload as Record<string,unknown>).errors;const fields=errors&&typeof errors==='object'?Object.keys(errors).filter(k=>/^[A-Za-z][A-Za-z0-9_.]{0,80}$/.test(k)):[];console.error(JSON.stringify({event:'quibi_api_rejection',path:path.split('?')[0],status:response.status,fields,...quibiRejectionDiagnostics(payload as Record<string,unknown>),validation:safeQuibiValidation(payload as Record<string,unknown>,[config.username,config.password])}));throw new QuibiValidationError(payload as Record<string,unknown>,[config.username,config.password]);}
    return payload;
  }

  return {
    async createCustomer(customer: { remote_id: string; naziv: string; emajl?: string; telst?: string }) {
      if (!validCustomerRemoteId(customer.remote_id) || !customer.naziv.trim())
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
    async getWarehouses() { return responseData(await call("/api2/skladisca", "GET")); },
    async getSaleTypes() { return responseData(await call("/api2/glavadokumenta/vrstaprodaje", "GET")); },
    async getUnits() { return responseData(await call("/api2/enota", "GET")); },
    async getVatRates() { return responseData(await call("/api2/ddv", "GET")); },
    async getArticles() { return responseData(await call("/api2/sifranti", "GET")); },
    async createEstimate(body: EstimateBody) {
      if ("id" in body.Glavadokumenta || !body.Glavadokumenta.external_id ||
          Object.keys(body.Postavkedokumenta).length === 0) throw new Error("QUIBI_INVALID_ESTIMATE_INPUT");
      if(body.Stranka&&body.Stranka.id!==body.Glavadokumenta.stranka_id)throw Error('QUIBI_DOCUMENT_CUSTOMER_MISMATCH');
      return parseQuibiWriteResponse(await call("/api2/glavadokumenta/form", "POST", body));
    },
    async updateEstimate(id: string, body: EstimateBody) {
      if (body.Glavadokumenta.id !== Number(validQuibiId(id)) ||
          Object.keys(body.Postavkedokumenta).length === 0) throw new Error("QUIBI_INVALID_ESTIMATE_INPUT");
      if(body.Stranka&&body.Stranka.id!==body.Glavadokumenta.stranka_id)throw Error('QUIBI_DOCUMENT_CUSTOMER_MISMATCH');
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
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sendId) || !["queued", "sent"].includes(String(data.status))) throw new Error("QUIBI_INVALID_RESPONSE");
      return { sendId, status: data.status as "queued" | "sent" };
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
