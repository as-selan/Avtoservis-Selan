// Hosted Preview READ-only: no DB, WRITE or SEND imports. Credentials stay in Vercel.
import assert from 'node:assert/strict';
import {createQuibiReadClient} from '../src/lib/quibi/client.ts';
import {quibiWorkflowConfig} from '../src/lib/quibi/workflow-config.ts';
import {loadEstimateCatalog} from '../src/lib/quibi/estimate-catalog.ts';
import {canonicalEstimateOptions,requestedEstimateRows,assistedEstimateRows} from '../src/lib/quibi/estimate-editor.ts';
import {estimateCatalogRows} from '../src/lib/quibi/estimate-catalog-source.ts';
import {estimateReviewTotal} from '../src/lib/quibi/estimate-preparation.ts';
assert.equal(process.env.VERCEL_PROJECT_ID,'prj_OSpIMwU9zkrcImKhGxpaq8PnrgUU');assert.equal(process.env.VERCEL_ENV,'preview');assert.equal(process.env.QUIBI_MODE,'dev');
const config=quibiWorkflowConfig(process.env,'read');assert.equal(config.origin,'https://dev.quibi.net');
let first,requests=0;const calls={};
const read=createQuibiReadClient({...config,fetcher:async(url,init)=>{
 assert.equal(init?.method,'GET','READ_ONLY_NO_WRITE_OR_PDF');const parsed=new URL(String(url));assert.equal(parsed.origin,config.origin);
 assert.ok(['/api2/sifranti/seznam','/api2/cenik','/api2/enota','/api2/ddv','/api2/stranka/view/405956'].includes(parsed.pathname)||/^\/api2\/sifranti\/view\/\d+$/.test(parsed.pathname),'READ_PATH_FORBIDDEN');requests++;calls[parsed.pathname]=(calls[parsed.pathname]??0)+1;
 const response=await fetch(url,init);if(!first&&parsed.pathname==='/api2/sifranti/seznam'){const data=await response.clone().json();const row=data.data?.Sifranti?.[0];first={wrapperKeys:Object.keys(row??{}),articleFields:Object.keys(row?.Sifranti??{}),unitFields:Object.keys(row?.Enota??{}),vatFields:Object.keys(row?.Ddv??{}),categoryFields:Object.keys(row?.Kategorije??{})};}return response;
}});
const snapshot=await read.catalogSnapshot();assert.ok(snapshot.stats.total>0);assert.equal(snapshot.stats.pages,Math.ceil(snapshot.stats.total/500));
const catalog=await loadEstimateCatalog({...read,catalogSnapshot:async()=>snapshot});const customer=await read.customer('405956');assert.ok(customer.name.startsWith('TEST-AUTOSERVIS-SELAN-'));assert.notEqual(customer.priceListId,undefined,'CUSTOMER_PRICE_LIST_UNKNOWN');
const options=canonicalEstimateOptions(catalog.options,customer.priceListId),rows=assistedEstimateRows(requestedEstimateRows('Avtomehanika','SERVIS VOZILA\nPREGLED PRED TEHNIČNIM\nPREGELD ZAVOR',options,customer.priceListId),options);assert.equal(rows.length,3);
const filled=rows.filter(row=>row.key&&row.quantity),[units,vatRates]=await Promise.all([read.catalog('units'),read.catalog('vat')]);
const form=new FormData();form.set('catalogLines',JSON.stringify(filled));const verified=filled.length?await estimateCatalogRows(form,read,{units,vatRates},customer):null;
for(const row of filled){const option=options.find(o=>o.key===row.key),detail=await read.article(option.articleId);assert.equal(Number(detail.netPrice),Number(option.unitNetPrice));assert.equal(detail.unitId,option.unitId);assert.equal(detail.vatId,option.vatId);}
const line=o=>({id:o.articleId,code:o.code,name:o.name,unit:o.unitLabel,vat:o.vatLabel,unitNet:o.unitNetPrice,unitGross:o.grossPrice,stockManaged:o.stockManaged});
console.log('SELAN_CATALOG_READ_RESULT '+JSON.stringify({at:new Date().toISOString(),endpoint:'/api2/sifranti/seznam',params:{po:'cursor to null',limit:500,arhivirano:0},...snapshot.stats,selectableArticles:new Set(options.map(o=>o.articleId)).size,first,priceLists:snapshot.lists.map(l=>({id:l.id,name:l.name,count:l.lines.length})),requests,calls,customerPriceListId:customer.priceListId,write:false,send:false}));
for(const row of rows)console.log('SELAN_CATALOG_ROW '+JSON.stringify({requested:row.requestedService,selected:row.key?line(options.find(o=>o.key===row.key)):null,quantity:row.quantity||null,candidates:(row.candidateKeys??[]).slice(0,3).map(key=>line(options.find(o=>o.key===key)))}));
console.log('SELAN_CATALOG_PREPARATION '+JSON.stringify({scope:'Real Quibi DEV READ + real preparation functions; no saved draft/document',freshVerifiedRows:verified?.reviewedLines??[],knownSubtotal:verified?estimateReviewTotal(verified.reviewedLines):null,completeTotal:filled.length===3&&verified?estimateReviewTotal(verified.reviewedLines):null,unknownsPreserved:true}));
