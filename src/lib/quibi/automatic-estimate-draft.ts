import {loadEstimateCatalog,type EstimateCatalogOption} from './estimate-catalog.ts';
import {requestedEstimateRows,assistedEstimateRows,canonicalEstimateOptions,draftTotal,type EstimateDraftRow} from './estimate-editor.ts';
import {estimateCatalogSource} from './estimate-catalog-source.ts';
import type {QuibiChoice} from './write-options';
import {quibiEstimateDefaults} from './estimate-defaults.ts';
export type AutomaticDraftState='preparing'|'ready'|'missing_price'|'ambiguous'|'needs_data'|'blocked'|'failed';
export type AutomaticEstimateDraft={rows:EstimateDraftRow[];options:EstimateCatalogOption[];customerPriceListId:string|null;defaults:ReturnType<typeof quibiEstimateDefaults>;preparedAt:string};
/** No CREATE, SEND, acceptance or browser lifetime dependency. */
export async function buildAutomaticEstimateDraft(input:{wanted:string|null;description:string|null;customerId:string},read:Parameters<typeof loadEstimateCatalog>[0]&Parameters<typeof estimateCatalogSource>[1]&{catalog:(kind:'saleTypes'|'units'|'vat'|'warehouses')=>Promise<QuibiChoice[]>;customer:(id:string)=>Promise<{priceListId?:string|null}>}){
 const [catalog,customer,saleTypes,units,vatRates,warehouses]=await Promise.all([loadEstimateCatalog(read),read.customer(input.customerId),read.catalog('saleTypes'),read.catalog('units'),read.catalog('vat'),read.catalog('warehouses')]);
 if(customer.priceListId===undefined)throw Error('QUIBI_CUSTOMER_PRICING_UNVERIFIED');
 const defaults=quibiEstimateDefaults({saleTypes,units,vatRates,warehouses});
 let options=canonicalEstimateOptions(catalog.options,customer.priceListId);
 const rows=assistedEstimateRows(requestedEstimateRows(input.wanted,input.description,options,customer.priceListId),options).map(row=>({...row,description:row.requestedService,unitId:defaults.unitId,vatId:defaults.vatId}));
 // Selected prices, units, VAT and customer list are verified freshly, outside catalog cache.
 for(const row of rows.filter(r=>r.key&&r.quantity)){const form=new FormData();form.set('catalogSource',row.key);form.set('quantity',row.quantity);const fresh=await estimateCatalogSource(form,read,{units,vatRates},customer);if(fresh)options=options.map(o=>o.key===row.key?fresh.option:o);}
 const needed=new Set(rows.flatMap(row=>[row.key,...(row.candidateKeys??[])]));
 const draft:AutomaticEstimateDraft={rows,options:options.filter(o=>needed.has(o.key)),customerPriceListId:customer.priceListId,defaults,preparedAt:new Date().toISOString()};
 const state:AutomaticDraftState=!rows.length?'needs_data':rows.some(row=>!row.key&&row.candidateKeys?.length)?'ambiguous':draftTotal(rows,options,customer.priceListId)===null?'missing_price':'ready';
 return {draft,state};
}
