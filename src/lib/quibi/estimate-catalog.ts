import {createHash} from 'node:crypto';
import type {QuibiArticle,QuibiPriceList} from './pricing-read.ts';
export type EstimateCatalogOption={key:string;articleId:string;priceListId:string;name:string;code:string;priceListName:string;unitId:string;unitLabel:string;vatId:string;vatLabel:string;grossPrice:number;discount:number;sourceSha:string};
export function estimateCatalogOption(article:QuibiArticle,list:QuibiPriceList):EstimateCatalogOption {
 const rows=list.lines.filter(line=>line.articleId===article.id);
 const rate=article.vatLabel.trim().match(/^(\d+(?:[.,]\d+)?)\s*%$/);
 if(rows.length!==1||!rate||Number(rows[0].netPrice)!==Number(article.netPrice))throw Error('QUIBI_CATALOG_PRICE_REQUIRES_REVIEW');
 const percentage=Number(rate[1].replace(',','.'));
 if(!Number.isFinite(percentage)||percentage>100)throw Error('QUIBI_CATALOG_VAT_UNSUPPORTED');
 const grossPrice=Math.round(Number(article.netPrice)*(1+percentage/100)*100)/100;
 const sourceSha=createHash('sha256').update(JSON.stringify({article,listId:list.id,line:rows[0]})).digest('hex');
 return {key:list.id+':'+article.id,articleId:article.id,priceListId:list.id,name:article.name,code:article.code,priceListName:list.name,unitId:article.unitId,unitLabel:article.unitLabel,vatId:article.vatId,vatLabel:article.vatLabel,grossPrice,discount:Number(rows[0].discount),sourceSha};
}
export function exactEstimateCatalogMatch(wanted:string,options:EstimateCatalogOption[]):string|null {
 const normalize=(s:string)=>s.trim().normalize('NFKC').toLocaleLowerCase('sl-SI').replace(/\s+/g,' ');
 const matches=options.filter(o=>normalize(o.name)===normalize(wanted));
 return wanted.trim()&&matches.length===1?matches[0].key:null;
}
export async function loadEstimateCatalog(read:{priceLists():Promise<QuibiPriceList[]>;article(id:string):Promise<QuibiArticle>}) {
 const lists=await read.priceLists();
 const allIds=[...new Set(lists.flatMap(list=>list.lines.map(line=>line.articleId)))];
 const ids=allIds.slice(0,60),articles:QuibiArticle[]=[],issues:string[]=[];
 for(let i=0;i<ids.length;i+=8){const results=await Promise.allSettled(ids.slice(i,i+8).map(id=>read.article(id)));for(const result of results){if(result.status==='fulfilled')articles.push(result.value);else {const code=result.reason instanceof Error&&/^QUIBI_HTTP_\d{3}$/.test(result.reason.message)?result.reason.message.replace('QUIBI_HTTP_','HTTP '):'neveljaven ali nedostopen odgovor';issues.push('Posameznega artikla ni mogoče prebrati iz Quibija ('+code+').');}}}
 const options:EstimateCatalogOption[]=[];
 for(const list of lists)for(const article of articles){if(!list.lines.some(line=>line.articleId===article.id))continue;try{options.push(estimateCatalogOption(article,list));}catch{issues.push('Cenik se razlikuje od osnovne cene artikla ali DDV ni preverljiv. Samodejna priprava te postavke je ustavljena.');}}
 if(allIds.length>ids.length)issues.push('Prikazan je omejen izbor prvih 60 artiklov iz cenikov; celoten šifrant ni bil prebran.');
 return {options,issues:[...new Set(issues)]};
}
