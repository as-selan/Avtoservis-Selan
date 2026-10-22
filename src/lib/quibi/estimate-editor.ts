import type {EstimateCatalogOption} from './estimate-catalog';
export type EstimateDraftRow={key:string;quantity:string;discount:string;unitPrice?:string;requestedService?:string};
export function initialEstimateRows(ai:Array<{key:string;quantity:number|null}>,exact:string|null|undefined):EstimateDraftRow[]{return ai.length?ai.map(line=>({key:line.key,quantity:line.quantity===null?'':String(line.quantity),discount:''})):exact?[{key:exact,quantity:'1',discount:''}]:[];}
export function draftRowPrice(row:EstimateDraftRow,option:EstimateCatalogOption,customerPriceListId?:string|null){
 const assigned=customerPriceListId===option.priceListId;
 const vat=Number(option.vatLabel.replace('%','').trim().replace(',','.'));
 const listGross=Number((Number(option.priceListNetPrice)*(1+vat/100)).toFixed(8));
 const unitPrice=row.unitPrice===undefined?(assigned?listGross:option.grossPrice):(row.unitPrice.trim()?Number(row.unitPrice.replace(',','.')):NaN);
 const discount=row.discount===''?(assigned?option.priceListDiscount:0):Number(row.discount.replace(',','.'));
 return {unitPrice,discount,listGross,baseGross:option.grossPrice,assigned};
}
/** Display estimate only; authoritative amounts always come from the fresh server review. */
export function draftTotal(rows:EstimateDraftRow[],options:EstimateCatalogOption[],customerPriceListId?:string|null){
 if(!rows.length)return null;let cents=0;
 for(const row of rows){const option=options.find(o=>o.key===row.key);if(!option||!row.quantity.trim())return null;const quantity=Number(row.quantity.replace(',','.')),{unitPrice,discount}=draftRowPrice(row,option,customerPriceListId);if(!Number.isFinite(quantity)||quantity<=0||quantity>100000||!Number.isFinite(unitPrice)||unitPrice<0||unitPrice>1000000||!Number.isFinite(discount)||discount<0||discount>100)return null;cents+=Math.round((quantity*unitPrice*(1-discount/100)+Number.EPSILON)*100);}
 return Number.isSafeInteger(cents)?cents/100:null;
}

/** One choice per article; the server always applies the assigned customer list. */
export function canonicalEstimateOptions(options:EstimateCatalogOption[],customerPriceListId?:string|null){const articles=[...new Set(options.map(o=>o.articleId))];return articles.map(id=>options.find(o=>o.articleId===id&&o.priceListId===customerPriceListId)??options.find(o=>o.articleId===id)!);}

/** Request text is authoritative; AI availability must never erase requested work. */
export function requestedEstimateRows(wanted:string|null|undefined,description:string|null|undefined,options:EstimateCatalogOption[],customerPriceListId?:string|null):EstimateDraftRow[]{
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('sl').replace(/[^a-z0-9]+/g,' ').trim();
 const categories=new Set(['avtomehanika','druga storitev']);
 const split=(value:string)=>value.split(/[\n\r;•]+/).map(v=>v.replace(/^\s*(?:[-*]|\d+[.)])\s*/,'').trim()).filter(Boolean);
 const detailed=split(description??'');
 const labels=[...split(wanted??'').filter(v=>!detailed.length||!categories.has(normalize(v))),...detailed];
 const unique=labels.filter((v,i)=>labels.findIndex(other=>normalize(other)===normalize(v))===i);
 const catalog=canonicalEstimateOptions(options,customerPriceListId);
 return unique.slice(0,100).map(requestedService=>{
  const matches=catalog.filter(o=>normalize(o.name)===normalize(requestedService)||normalize(o.code)===normalize(requestedService));
  const match=matches.length===1?matches[0]:undefined;
  // One requested service is one piece; time, weight and other units need an explicit quantity.
  const quantity=match&&!['kos','kom','storitev','piece','pcs'].includes(normalize(match.unitLabel))?'':'1';
  return {key:match?.key??'',quantity,discount:'',requestedService};
 });
}
