import {readArticlePages} from './article-pages.ts';
import {quibiReadRejection,quibiReadEndpoint} from './read-rejection.ts';
import {extraDocumentPaths,type ExtraDocumentKind} from './document-read.ts';
import {parseVehicleInfo,parseAddresses,parseLots,parseStock,parsePaymentMethods,parseDocumentPayments} from './operational-read.ts';
import {parseQuibiArticle,parseQuibiPriceLists} from './pricing-read.ts';
import {quibiCatalogs,parseQuibiCatalog,type QuibiCatalogKind} from "./catalog-read.ts";
import {readQuibiPdf} from "./pdf-read.ts";
import { parseCustomerDetail, parseCustomers, parseDocuments, parseDocumentStatus, parseEstimateDetail, parseVehicleDetail, parseVehicles, parseVehicleCandidates } from "./contracts.ts";
import { assertPreproductionQuibiConfiguration, assertRemoteDemoConfiguration } from "../demo/config.ts";
import { createDemoQuibiReadClient } from "./demo-client.ts";

type Config = { username: string; password: string; fetcher?: typeof fetch; origin?: string };
import { quibiWorkflowConfig } from "./workflow-config.ts";
const ORIGIN = "https://dev.quibi.net";

export function createQuibiReadClient(config: Config) {
  if (!config.username || !config.password) throw new Error("QUIBI_NOT_CONFIGURED");
  const fetcher = config.fetcher ?? fetch;
  const origin = config.origin ?? ORIGIN;

  async function read(path: string, method: "GET" | "POST" = "GET", customerId?: string,dates?:{from:string;to:string}): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const started=Date.now();
      try {
        const response = await fetcher(`${origin}${path}`, {
          method,
          headers: { username: config.username, password: config.password, "Content-Type": "application/json" },
          body: method === "POST" ? JSON.stringify({ Filtriraj: { ...(customerId ? {stranka: Number(customerId)} : {}),...(dates?{datod:dates.from,datdo:dates.to}:{}) } }) : undefined,
          redirect: "error", cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          if ([401,403,429].includes(response.status)) console.warn(JSON.stringify(await quibiReadRejection(response,path,method)));
          if (response.status >= 500 && attempt === 0) continue;
          throw new Error(`QUIBI_HTTP_${response.status}`);
        }
        const data=await response.json();
        if(Date.now()-started>=8000)console.info(JSON.stringify({event:'quibi_read_slow',endpoint:quibiReadEndpoint(path),method,status:response.status,durationMs:Date.now()-started}));
        return data;
      } catch (error) {
        if(error instanceof Error&&['TimeoutError','AbortError'].includes(error.name))console.warn(JSON.stringify({event:'quibi_read_transport_failed',endpoint:quibiReadEndpoint(path),method,errorType:error.name,durationMs:Date.now()-started,attempt:attempt+1}));
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
    async vehicleInfo(vehicleId:string,customerId:string){return parseVehicleInfo(await read('/api2/vozila/view/'+validId(vehicleId)),vehicleId,validId(customerId))},
    async addresses(customerId:string){return parseAddresses(await read('/api2/address/index/'+validId(customerId)),customerId)},
    async lots(articleId:string){return parseLots(await read('/api2/loti/index/'+validId(articleId)))},
    async stock(warehouseId:string,reserved:boolean){if(typeof reserved!=='boolean')throw Error('QUIBI_INVALID_STOCK_FILTER');return parseStock(await read('/api2/sifranti/trenutnazaloga/'+validId(warehouseId)+'/'+(reserved?'1':'0')))},
    async paymentMethods(){return parsePaymentMethods(await read('/api2/glavadokumenta/placila'))},
    async documentPayments(documentId:string){return parseDocumentPayments(await read('/api2/delnaplacila/placiladokumenta/'+validId(documentId)),documentId)},
    async documents(kind:ExtraDocumentKind,customerId:string){if(!Object.hasOwn(extraDocumentPaths,kind))throw Error('QUIBI_INVALID_DOCUMENT');const id=validId(customerId);return parseDocuments(await read(extraDocumentPaths[kind],'POST',id),id)},
    async catalogSnapshot(){
      const lists=parseQuibiPriceLists(await read('/api2/cenik')),listed=new Set(lists.flatMap(l=>l.lines.map(r=>r.articleId)));let total=0,nonStock=0,pages=0;const invalid:string[]=[];
      const articles=await readArticlePages(path=>read(path),500,{allowUncoded:true,page:rows=>{pages++;total+=rows.length;nonStock+=rows.filter(r=>[0,'0',false].includes((r.Sifranti as Record<string,unknown>)?.vodiZalogo as string|number|boolean)).length},include:r=>{const a=r.Sifranti as Record<string,unknown>;return [0,'0',false].includes(a.vodiZalogo as string|number|boolean)||listed.has(String(a.id))},invalid:id=>invalid.push(id)});
      return {articles,lists,issues:invalid.length?['Nekatere postavke nimajo preverljive šifre, cene, enote ali DDV; zanje uporabite prosto storitev.']:[],stats:{total,nonStock,pages,indexed:articles.length,unsupported:invalid.length}};
    },
    async activeArticle(id:string){
      const articleId=validId(id);if(Number(articleId)<1)throw Error('QUIBI_INVALID_ARTICLE_ID');
      const value=await read('/api2/sifranti/seznam?po='+(Number(articleId)-1)+'&limit=1&arhivirano=0') as {error?:unknown;data?:{Sifranti?:Array<{Sifranti?:{id?:unknown}}>}};
      const row=value.data?.Sifranti?.[0];if(value.error!==false||value.data?.Sifranti?.length!==1||!row||String(row.Sifranti?.id)!==articleId)throw Error('QUIBI_ARTICLE_INACTIVE');
      return parseQuibiArticle({error:false,data:{Sifranti:row}},articleId,true);
    },
    async priceLists() { return parseQuibiPriceLists(await read("/api2/cenik")); },
    async article(id: string,allowUncoded=false) { return parseQuibiArticle(await read(`/api2/sifranti/view/${validId(id)}`), id,allowUncoded); },
    async customers() { return parseCustomers(await read("/api2/stranka")); },
    async searchCustomers(query: string) {
      const needle = query.trim().toLocaleLowerCase("sl-SI");
      if (needle.length < 2 || needle.length > 100) return [];
      const customers = await this.customers();
      return customers.filter((customer) => [customer.id, customer.name, customer.phone, customer.email]
        .some((value) => value.toLocaleLowerCase("sl-SI").includes(needle))).slice(0, 30);
    },
    async customer(id: string) {
      const value = parseCustomerDetail(await read(`/api2/stranka/view/${validId(id)}`));
      if (value.id !== id) throw new Error("QUIBI_CUSTOMER_ID_MISMATCH");
      return value;
    },
    async allVehicles() { return parseVehicleCandidates(await read("/api2/vozila/index")); },
    async vehicles(customerId: string) {
      const id = validId(customerId);
      return parseVehicles(await read(`/api2/vozila/index/${id}`)).filter((vehicle) => vehicle.customerId === id);
    },
    async vehicle(id: string, customerId: string) {
      const vehicleId = validId(id);
      return parseVehicleDetail(await read(`/api2/vozila/view/${vehicleId}`), vehicleId, validId(customerId));
    },
    /** Documented list filters are optional; caller must authorize account-wide history. */
    async historyDocuments(kind: 'work_order'|'estimate'|'invoice', customerId?:string,dates?:{from:string;to:string}) {
      const paths={work_order:'/api2/dn',estimate:'/api2/predracuni',invoice:'/api2/fakture'};
      if(!Object.hasOwn(paths,kind))throw Error('QUIBI_INVALID_DOCUMENT');
      const id=customerId ? validId(customerId) : undefined;
      return parseDocuments(await read(paths[kind],'POST',id,dates),id);
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
    async documentStatus(id: string, customerId: string) {
      return parseDocumentStatus(await read(`/api2/glavadokumenta/view/${validId(id)}`), id, validId(customerId));
    },
    async catalog(kind: QuibiCatalogKind) {
      if(!Object.hasOwn(quibiCatalogs,kind))throw Error("QUIBI_INVALID_CATALOG");
      return parseQuibiCatalog(await read(quibiCatalogs[kind].path),kind);
    },
    async documentPdf(id: string) {
      return readQuibiPdf(fetcher, origin+"/api2/glavadokumenta/pdf", {username:config.username,password:config.password,"Content-Type":"application/json"}, validId(id));
    },
    async documentDetail(id: string, customerId: string) {
      return parseEstimateDetail(await read(`/api2/glavadokumenta/view/${validId(id)}`), id, validId(customerId));
    },
    async estimateDetail(id: string, customerId: string) {
      return parseEstimateDetail(await read(`/api2/glavadokumenta/view/${validId(id)}`), id, validId(customerId));
    },
  };
}

function withCatalogCache(config:Config){const read=createQuibiReadClient(config);return {...read,historyDocuments:async(kind:'work_order'|'estimate'|'invoice',customerId?:string,dates?:{from:string;to:string})=>{const {cachedHistoryList}=await import('./catalog-cache');return cachedHistoryList(config,kind,customerId,dates)},catalogSnapshot:async()=>{const {cachedCatalogSnapshot}=await import('./catalog-cache');return cachedCatalogSnapshot(config)}};}

export function configuredQuibiReadClient() {
  if (process.env.APP_ENV === "production" || process.env.QUIBI_MODE === "production") {
    const config = quibiWorkflowConfig(process.env, "read");
    return withCatalogCache(config);
  }
  if (process.env.APP_ENV === "preproduction") {
    assertPreproductionQuibiConfiguration();
    return withCatalogCache({
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
  // A local review needs either its isolated fixture or an explicit DEV opt-in.
  // A missing test flag must never silently select dev.quibi.net.
  if (process.env.SELAN_LOCAL_REVIEW === "1" && !fixture && process.env.QUIBI_MODE !== "dev") {
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
