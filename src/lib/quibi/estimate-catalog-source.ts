import 'server-only';
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
 const line={sifra:option.code,kolicina:quantity,popust:option.discount,ddv_id:option.vatId,...(pricing.custom?{cena:pricing.net,opis:article.name}:{})};
 const reviewedLine:EstimateReview['lines'][number]={description:option.name,quantity,unit:option.unitLabel,vat:option.vatLabel,unitPrice:option.grossPrice,discount:option.discount};
 return {option,line,reviewedLine,total:Math.round(quantity*option.grossPrice*(1-option.discount/100)*100)/100};
}
