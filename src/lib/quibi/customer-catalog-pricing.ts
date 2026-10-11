import {createHash} from 'node:crypto';
import {estimateCatalogOption} from './estimate-catalog.ts';
import type {QuibiArticle,QuibiPriceList} from './pricing-read.ts';
import {vatFactor} from './line-pricing.ts';
/** A custom customer price is used only when the API explicitly assigns its list. */
export function customerCatalogPricing(article:QuibiArticle,selected:QuibiPriceList,lists:QuibiPriceList[],customer:{priceListId?:string|null}){
 if(customer.priceListId===undefined)throw Error('QUIBI_CUSTOMER_PRICING_UNVERIFIED');
 const assigned=customer.priceListId?lists.find(l=>l.id===customer.priceListId):undefined;
 if(customer.priceListId&&!assigned)throw Error('QUIBI_CUSTOMER_PRICING_UNVERIFIED');
 const option=estimateCatalogOption(article,assigned??selected);
 if(customer.priceListId===undefined&&option.priceListDiffers)throw Error('QUIBI_CUSTOMER_PRICING_UNVERIFIED');
 const custom=!!assigned&&option.priceListDiffers;
 if(custom&&article.stockManaged!==false)throw Error('QUIBI_CUSTOMER_PRICING_UNVERIFIED');
 const net=custom?Number(option.priceListNetPrice):Number(article.netPrice);
 const discount=assigned?option.priceListDiscount:0;
 const gross=Number((net*vatFactor(article.vatLabel)).toFixed(8));
 return {option:{...option,grossPrice:gross,discount,sourceSha:createHash('sha256').update(JSON.stringify({source:option.sourceSha,assigned:customer.priceListId??null,net,discount})).digest('hex')},net,custom};
}
