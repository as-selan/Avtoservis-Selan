import {createHash} from 'node:crypto';
import type {DocumentLine} from './write-contract.ts';
import type {QuibiArticle,QuibiPriceList} from './pricing-read.ts';
export type EstimateCatalogOption={key:string;articleId:string;priceListId:string;name:string;code:string;priceListName:string;unitId:string;unitLabel:string;vatId:string;vatLabel:string;grossPrice:number;discount:number;priceListNetPrice:string;priceListDiscount:number;priceListDiffers:boolean;sourceSha:string;stockManaged?:boolean;unitNetPrice?:number};
export function estimateCatalogOption(article:QuibiArticle,list:QuibiPriceList):EstimateCatalogOption {
 const rows=list.lines.filter(line=>line.articleId===article.id);
 const rate=article.vatLabel.trim().match(/^(\d+(?:[.,]\d+)?)\s*%$/);
 if(rows.length!==1||!rate)throw Error('QUIBI_CATALOG_PRICE_REQUIRES_REVIEW');
 const percentage=Number(rate[1].replace(',','.'));
 if(!Number.isFinite(percentage)||percentage>100)throw Error('QUIBI_CATALOG_VAT_UNSUPPORTED');
 const grossPrice=Number((Number(article.netPrice)*(1+percentage/100)).toFixed(8));
 const sourceSha=createHash('sha256').update(JSON.stringify({article,listId:list.id,line:rows[0]})).digest('hex');
 return {stockManaged:article.stockManaged,unitNetPrice:Number(article.netPrice),key:list.id+':'+article.id,articleId:article.id,priceListId:list.id,name:article.name,code:article.code,priceListName:list.name,unitId:article.unitId,unitLabel:article.unitLabel,vatId:article.vatId,vatLabel:article.vatLabel,grossPrice,discount:Number(rows[0].netPrice)===Number(article.netPrice)?Number(rows[0].discount):0,priceListNetPrice:rows[0].netPrice,priceListDiscount:Number(rows[0].discount),priceListDiffers:Number(rows[0].netPrice)!==Number(article.netPrice),sourceSha};
}
export function exactEstimateCatalogMatch(wanted:string,options:EstimateCatalogOption[]):string|null {
 const normalize=(s:string)=>s.trim().normalize('NFKC').toLocaleLowerCase('sl-SI').replace(/\s+/g,' ');
 const matches=options.filter(o=>normalize(o.name)===normalize(wanted));
 const identities=new Set(matches.map(o=>[o.articleId,o.code,o.unitId,o.vatId].join(':')));
 return wanted.trim()&&identities.size===1?matches[0].key:null;
}
export type CatalogSnapshot={articles:QuibiArticle[];lists:QuibiPriceList[];issues:string[];stats?:{total:number;nonStock:number;pages:number;indexed:number;unsupported:number}};
export async function loadEstimateCatalog(read:{priceLists():Promise<QuibiPriceList[]>;article(id:string):Promise<QuibiArticle>;catalogSnapshot?:()=>Promise<CatalogSnapshot>}) {
 const snapshot=read.catalogSnapshot?await read.catalogSnapshot():null;
 const lists=snapshot?.lists??await read.priceLists();
 const allIds=[...new Set(lists.flatMap(list=>list.lines.map(line=>line.articleId)))];
 const ids=snapshot?[]:allIds,articles:QuibiArticle[]=snapshot?.articles??[],issues:string[]=[...(snapshot?.issues??[])];
 for(let i=0;i<ids.length;i+=8){const results=await Promise.allSettled(ids.slice(i,i+8).map(id=>read.article(id)));for(const result of results){if(result.status==='fulfilled')articles.push(result.value);else {const code=result.reason instanceof Error&&/^QUIBI_HTTP_\d{3}$/.test(result.reason.message)?result.reason.message.replace('QUIBI_HTTP_','HTTP '):'neveljaven ali nedostopen odgovor';issues.push('Posameznega artikla ni mogoče prebrati iz Quibija ('+code+').');}}}
 const options:EstimateCatalogOption[]=snapshot?articles.flatMap(article=>{try{return [baseEstimateCatalogOption(article)]}catch{issues.push("Nekatere postavke imajo nepodprt zapis DDV in zahtevajo ročni pregled.");return []}}):[];
 for(const list of lists)for(const article of articles){if(!list.lines.some(line=>line.articleId===article.id))continue;try{const option=estimateCatalogOption(article,list);options.push(option);}catch{issues.push('Povezava cenika ali DDV ni preverljiva. Samodejna priprava te postavke je ustavljena.');}}
 return {options,issues:[...new Set(issues)],...(snapshot?.stats?{stats:snapshot.stats}:{})};
}

export function catalogDocumentLine(option:EstimateCatalogOption,quantity:number):DocumentLine {return {sifra:option.code,kolicina:quantity,popust:option.discount,ddv_id:option.vatId,...(option.stockManaged===false&&Number.isFinite(option.unitNetPrice)?{cena:option.unitNetPrice,opis:option.name}:{})};}

/** Explicit base article identity, not a fabricated Quibi price-list ID. */
export function baseEstimateCatalogOption(article:QuibiArticle):EstimateCatalogOption{
 const rate=article.vatLabel.trim().match(/^(\d+(?:[.,]\d+)?)\s*%$/);if(!rate||Number(rate[1].replace(',','.'))>100)throw Error('QUIBI_CATALOG_VAT_UNSUPPORTED');
 return {key:'article:'+article.id,articleId:article.id,priceListId:'',priceListName:'Osnovna cena artikla',name:article.name,code:article.code,unitId:article.unitId,unitLabel:article.unitLabel,vatId:article.vatId,vatLabel:article.vatLabel,grossPrice:Number((Number(article.netPrice)*(1+Number(rate[1].replace(',','.'))/100)).toFixed(8)),unitNetPrice:Number(article.netPrice),discount:0,priceListNetPrice:article.netPrice,priceListDiscount:0,priceListDiffers:false,stockManaged:article.stockManaged,sourceSha:createHash('sha256').update(JSON.stringify({article,priceListId:null})).digest('hex')};
}
