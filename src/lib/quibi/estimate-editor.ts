import type {EstimateCatalogOption} from './estimate-catalog';
export type EstimateDraftRow={key:string;quantity:string;discount:string;unitPrice?:string};
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
