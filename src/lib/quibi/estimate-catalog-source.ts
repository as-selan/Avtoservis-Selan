import {createHash} from 'node:crypto';
import 'server-only';
import {catalogDocumentLine} from './estimate-catalog';
import {unitNetFromGross} from './line-pricing';
import {customerCatalogPricing} from './customer-catalog-pricing';
import type {EstimateReview} from './estimate-preparation';
import type {QuibiArticle,QuibiPriceList} from './pricing-read';
export async function estimateCatalogSource(form:FormData,read:{priceLists():Promise<QuibiPriceList[]>;article(id:string):Promise<QuibiArticle>},catalogs:{units:{id:string;label:string}[];vatRates:{id:string;label:string}[]},customer?:{priceListId?:string|null}){
 const source=form.get('catalogSource');
 if(source==null||source==='')return null;
 if(typeof source!=='string'||!/^\d+:\d+$/.test(source))throw Error('QUIBI_CATALOG_SOURCE_INVALID');
 const [listId,articleId]=source.split(':');
 const [lists,article]=await Promise.all([read.priceLists(),read.article(articleId)]);
 const list=lists.find(list=>list.id===listId);if(!list)throw Error('QUIBI_CATALOG_SOURCE_CHANGED');
 const pricing=customerCatalogPricing(article,list,lists,customer??{}),option=pricing.option;
 if(!catalogs.units.some(unit=>unit.id===option.unitId&&unit.label===option.unitLabel)||!catalogs.vatRates.some(vat=>vat.id===option.vatId&&vat.label===option.vatLabel))throw Error('QUIBI_CATALOG_REFERENCE_CHANGED');
 const quantity=Number(form.get('quantity')??'1');if(!Number.isFinite(quantity)||quantity<=0||quantity>100000)throw Error('QUIBI_CATALOG_QUANTITY_INVALID');
 const line=catalogDocumentLine(option,quantity);
 const reviewedLine:EstimateReview['lines'][number]={description:option.name,quantity,unit:option.unitLabel,vat:option.vatLabel,unitPrice:option.grossPrice,discount:option.discount};
 return {option,line,reviewedLine,total:Math.round(quantity*option.grossPrice*(1-option.discount/100)*100)/100};
}

/** Resolve every draft row freshly. Draft prices are explicit edits only for verified non-stock articles. */
export async function estimateCatalogRows(form:FormData,read:Parameters<typeof estimateCatalogSource>[1],catalogs:Parameters<typeof estimateCatalogSource>[2],customer:Parameters<typeof estimateCatalogSource>[3]){
 const raw=form.get('catalogLines');if(raw===null||raw==='')return null;
 if(typeof raw!=='string'||raw.length>64000)throw Error('QUIBI_CATALOG_LINES_INVALID');
 let rows:unknown;try{rows=JSON.parse(raw)}catch{throw Error('QUIBI_CATALOG_LINES_INVALID')}
 if(!Array.isArray(rows)||rows.length<1||rows.length>100)throw Error('QUIBI_CATALOG_LINES_INVALID');
 const lists=await read.priceLists(),articles=new Map<string,Awaited<ReturnType<typeof read.article>>>();
 const cached={priceLists:async()=>lists,article:async(id:string)=>{if(!articles.has(id))articles.set(id,await read.article(id));return articles.get(id)!}};
 const sources=[];let hasPriceOverrides=false;
 for(const row of rows){
  if(!row||typeof row!=='object'||typeof row.key!=='string'||!/^\d+:\d+$/.test(row.key)||!['string','number'].includes(typeof row.quantity))throw Error('QUIBI_CATALOG_LINES_INVALID');
  const one=new FormData();one.set('catalogSource',row.key);one.set('quantity',String(row.quantity));
  const source=await estimateCatalogSource(one,cached,catalogs,customer);if(!source)throw Error('QUIBI_CATALOG_LINES_INVALID');
  if(Object.prototype.hasOwnProperty.call(row,'unitPrice')){
   hasPriceOverrides=true;
   if(source.option.stockManaged!==false||!('sifra' in source.line))throw Error('QUIBI_CATALOG_PRICE_OVERRIDE_UNSUPPORTED');
   if(typeof row.unitPrice!=='string'||!/^\d+(?:[.,]\d{1,8})?$/.test(row.unitPrice))throw Error('QUIBI_CATALOG_PRICE_INVALID');
   const gross=Number(row.unitPrice.replace(',','.'));
   if(!Number.isFinite(gross)||gross<0||gross>1000000)throw Error('QUIBI_CATALOG_PRICE_INVALID');
   const net=unitNetFromGross(gross,source.option.vatId,catalogs.vatRates);
   source.line.cena=net;source.option.unitNetPrice=net;source.reviewedLine.unitPrice=gross;
  }
  const discount=row.discount==null||row.discount===''?source.option.discount:Number(row.discount);
  if(!['undefined','string','number'].includes(typeof row.discount)||!Number.isFinite(discount)||discount<0||discount>100)throw Error('QUIBI_CATALOG_DISCOUNT_INVALID');
  source.line.popust=discount;source.reviewedLine.discount=discount;sources.push(source);
 }
 const lines=sources.map(s=>s.line),reviewedLines=sources.map(s=>s.reviewedLine);
 const sourceSha=createHash('sha256').update(JSON.stringify(sources.map(s=>({source:s.option.sourceSha,line:s.line,unitGrossPrice:s.reviewedLine.unitPrice})))).digest('hex');
 return {lines,reviewedLines,sourceSha,hasPriceOverrides,unitNetPrices:sources.map(s=>s.option.unitNetPrice!),unitIds:sources.map(s=>s.option.unitId)};
}
