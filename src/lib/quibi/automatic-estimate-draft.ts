import {loadHistoricalPrices,type HistoricalPriceSuggestion} from './estimate-history';
import {loadEstimateCatalog,type EstimateCatalogOption} from './estimate-catalog.ts';
import {suggestedEstimateRows,canonicalEstimateOptions,draftTotal,type EstimateDraftRow} from './estimate-editor.ts';
import {estimateCatalogSource} from './estimate-catalog-source.ts';
import type {QuibiChoice} from './write-options';
import {quibiEstimateDefaults} from './estimate-defaults.ts';
export type AutomaticDraftState='preparing'|'ready'|'missing_price'|'ambiguous'|'needs_data'|'blocked'|'failed';
export type AutomaticEstimateDraft={serviceSuggestionVersion?:number;rows:EstimateDraftRow[];options:EstimateCatalogOption[];customerPriceListId:string|null;defaults:ReturnType<typeof quibiEstimateDefaults>;preparedAt:string;historySuggestions?:HistoricalPriceSuggestion[];historyIssues?:string[]};
/** No CREATE, SEND, acceptance or browser lifetime dependency. */
export async function buildAutomaticEstimateDraft(input:{wanted:string|null;description:string|null;customerId:string;vehicleId?:string;allowOrganizationHistory?:boolean},read:Parameters<typeof loadEstimateCatalog>[0]&Parameters<typeof estimateCatalogSource>[1]&{catalog:(kind:'saleTypes'|'units'|'vat'|'warehouses')=>Promise<QuibiChoice[]>;customer:(id:string)=>Promise<{priceListId?:string|null}>}&Partial<Parameters<typeof loadHistoricalPrices>[0]>){
 const [catalog,customer,saleTypes,units,vatRates,warehouses]=await Promise.all([loadEstimateCatalog(read),read.customer(input.customerId),read.catalog('saleTypes'),read.catalog('units'),read.catalog('vat'),read.catalog('warehouses')]);
 if(customer.priceListId===undefined)throw Error('QUIBI_CUSTOMER_PRICING_UNVERIFIED');
 const defaults=quibiEstimateDefaults({saleTypes,units,vatRates,warehouses});
 let options=canonicalEstimateOptions(catalog.options,customer.priceListId);
 const rows=suggestedEstimateRows(input.wanted,input.description,options,customer.priceListId).map(row=>({...row,description:row.requestedService,unitId:row.unitId??defaults.unitId,vatId:row.vatId??defaults.vatId}));
 // Selected prices, units, VAT and customer list are verified freshly, outside catalog cache.
 for(const row of rows.filter(r=>r.quantity&&(r.key||r.unitId&&r.vatId&&r.candidateKeys?.length===1))){const form=new FormData();form.set('catalogSource',row.key||row.candidateKeys![0]);form.set('quantity',row.quantity);const fresh=await estimateCatalogSource(form,read,{units,vatRates},customer);if(fresh){options=options.map(o=>o.key===fresh.option.key?fresh.option:o);row.unitId=fresh.option.unitId;row.vatId=fresh.option.vatId;}}
 const needed=new Set(rows.flatMap(row=>[row.key,...(row.candidateKeys??[])]));
 const draft:AutomaticEstimateDraft={serviceSuggestionVersion:2,rows,options:options.filter(o=>needed.has(o.key)),customerPriceListId:customer.priceListId,defaults,preparedAt:new Date().toISOString()};
 if(input.vehicleId&&read.historyDocuments&&read.documentDetail){try{const history=await loadHistoricalPrices({historyDocuments:read.historyDocuments,documentDetail:read.documentDetail,documents:read.documents},{customerId:input.customerId,vehicleId:input.vehicleId,allowOrganizationHistory:input.allowOrganizationHistory===true,vatRates},rows,options);draft.historySuggestions=history.suggestions;draft.historyIssues=history.issues;}catch{draft.historyIssues=['Zgodovina ni dostopna. Ročna priprava ostaja na voljo.'];}}
 const state:AutomaticDraftState=!rows.length?'needs_data':rows.some(row=>!row.key&&(row.candidateKeys?.length||row.matchSource==='Predlog iz opisa'))?'ambiguous':draftTotal(rows,options,customer.priceListId)===null?'missing_price':'ready';
 return {draft,state};
}

/** Repair only untouched generated rows. User choices, prices, quantities and removed rows stay intact. */
export function needsCatalogFieldRepair(draft:AutomaticEstimateDraft){return draft.rows.some(row=>row.key?(!row.unitId||!row.vatId):row.matchSource==='Predlog iz opisa'&&!row.quantity&&!row.discount&&!Object.hasOwn(row,'unitPrice')&&(row.description??row.requestedService)===row.requestedService&&(!row.unitId||row.unitId===draft.defaults.unitId)&&(!row.vatId||row.vatId===draft.defaults.vatId));}
export function repairCatalogDraftFields(saved:AutomaticEstimateDraft,fresh:AutomaticEstimateDraft){
 const options=new Map([...saved.options,...fresh.options].map(option=>[option.key,option]));
 const rows=saved.rows.map(row=>{
  if(row.key){const option=options.get(row.key);return option?{...row,unitId:row.unitId||option.unitId,vatId:row.vatId||option.vatId}:row;}
  if(!needsCatalogFieldRepair({...saved,rows:[row]}))return row;
  const proposed=fresh.rows.find(item=>item.requestedService===row.requestedService);
  return proposed?{...proposed,description:row.description??proposed.description}:row;
 });
 const needed=new Set(rows.flatMap(row=>[row.key,...(row.candidateKeys??[])]));
 const draft={...saved,rows,options:[...options.values()].filter(option=>needed.has(option.key)),defaults:fresh.defaults};
 const state:AutomaticDraftState=draftTotal(rows,draft.options,draft.customerPriceListId)!==null?'ready':rows.some(row=>!row.key&&row.candidateKeys?.length)?'ambiguous':'missing_price';
 return {draft,state};
}
