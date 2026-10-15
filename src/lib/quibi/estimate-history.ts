import {estimateReviewTotal} from './estimate-preparation.ts';
import {customerCatalogPricing} from './customer-catalog-pricing.ts';
import {vatFactor} from './line-pricing.ts';
import {quibiSourceNotes} from './business-source-lines.ts';
import {createHash} from 'node:crypto';
import type {QuibiDocument,QuibiEstimateDetail} from './contracts.ts';
import {catalogDocumentLine,loadEstimateCatalog,type EstimateCatalogOption} from './estimate-catalog.ts';
import type {QuibiArticle,QuibiPriceList} from './pricing-read.ts';
import type {EstimateReview} from './estimate-preparation.ts';
import type {DocumentLine} from './write-contract.ts';
export type HistoryKind='work_order'|'estimate'|'invoice';
export type HistoryRead={historyDocuments(kind:HistoryKind,customerId?:string):Promise<QuibiDocument[]>;documentDetail(id:string,customerId:string):Promise<QuibiEstimateDetail>;priceLists():Promise<QuibiPriceList[]>;article(id:string):Promise<QuibiArticle>};
export type EstimateHistoryProposal={key:string;kind:HistoryKind;documentId:string;date:string;saleTypeId?:string;scope:'vehicle'|'other';ready:boolean;issues:string[];sourceSha:string;lines:Array<{description:string;articleCode:string;quantity:number;unit:string;vat:string;unitId:string;vatId:string;historicalVat:string;previousPrice:string;previousDiscount:string;currentPrice:number;discount:number}>;payloadLines:DocumentLine[];reviewedLines:EstimateReview['lines'];total:number};
const exact=(s:string)=>s.trim().normalize('NFKC').toLocaleLowerCase('sl-SI').replace(/\s+/g,' ');
export function historyProposal(detail:QuibiEstimateDetail,kind:HistoryKind,input:{customerId:string;vehicleId:string;wanted:string;code?:string;priceListId?:string|null},options:EstimateCatalogOption[]):EstimateHistoryProposal|null {
 if(!input.wanted.trim()&&!input.code)return null;
 const anchor=detail.lines.filter(l=>!quibiSourceNotes(detail).includes(l)).some(line=>input.code ? line.articleCode===input.code || options.some(o=>o.code===input.code&&line.articleId===o.articleId) : exact(line.description)===exact(input.wanted));
 if(!anchor||!detail.lines.length)return null;
 const issues:string[]=[],lines:EstimateHistoryProposal['lines']=[],payloadLines:DocumentLine[]=[],reviewedLines:EstimateReview['lines']=[],sources:string[]=[];
 const chargeable=detail.lines.filter(l=>!quibiSourceNotes(detail).includes(l));
 for(const line of chargeable){
  // A present article identity always wins; never substitute an identical description for a different ID.
  const matches=options.filter(o=>line.articleId ? o.articleId===line.articleId&&(!line.articleCode||line.articleCode===o.code) : line.articleCode ? o.code===line.articleCode : exact(o.name)===exact(line.description));
  const unique=[...new Map(matches.map(o=>[o.articleId+':'+o.sourceSha,o])).values()];
  const quantity=Number(line.quantity),old=Number(line.unitGrossPrice),discount=Number(line.discount??0);
  if(unique.length!==1||!line.unitId||line.unitId!==unique[0].unitId||!line.quantity.trim()||!Number.isFinite(quantity)||quantity<=0||quantity>100000||(!line.pricingVerified||!line.unitGrossPrice)||!Number.isFinite(old)||old<0||!Number.isFinite(discount)||discount<0||discount>100){issues.push('Postavka '+line.description+' nima enolično preverjene aktualne cene, DDV ali količine.');continue;}
  const o=unique[0];sources.push(o.sourceSha);
  lines.push({description:o.name,articleCode:o.code,quantity,unit:o.unitLabel,vat:o.vatLabel,unitId:o.unitId,vatId:o.vatId,historicalVat:line.historicalVatLabel??'ni vrnjen',previousPrice:line.unitGrossPrice!,previousDiscount:line.discount??'ni vrnjen',currentPrice:o.grossPrice,discount:o.discount});
  payloadLines.push(catalogDocumentLine(o,quantity));
  reviewedLines.push({description:o.name,quantity,unit:o.unitLabel,vat:o.vatLabel,unitPrice:o.grossPrice,discount:o.discount});
 }
 const total=estimateReviewTotal(reviewedLines);
 const ready=issues.length===0&&payloadLines.length===chargeable.length&&detail.lines.length<=100;
 if(detail.lines.length>100)issues.push('Dokument ima več kot 100 postavk.');
 return {key:kind+':'+detail.customerId+':'+detail.id,kind,documentId:detail.id,date:detail.date??'Datum ni vrnjen',saleTypeId:detail.saleTypeId,scope:detail.customerId===input.customerId&&detail.vehicleId===input.vehicleId?'vehicle':'other',ready,issues,sourceSha:createHash('sha256').update(JSON.stringify({document:detail.contentSha256,sources,payloadLines,reviewedLines})).digest('hex'),lines,payloadLines,reviewedLines,total};
}
async function documentCatalog(read:HistoryRead,detail:QuibiEstimateDetail,options:EstimateCatalogOption[],priceListId?:string|null){
 const result=[...options];
 const ids=[...new Set(detail.lines.map(l=>l.articleId).filter((id):id is string=>!!id&&!options.some(o=>o.articleId===id)))];
 for(let i=0;i<ids.length;i+=8){const reads=await Promise.allSettled(ids.slice(i,i+8).map(id=>read.article(id)));for(const r of reads){if(r.status!=='fulfilled')continue;const a=r.value,rate=a.vatLabel.match(/^(\d+(?:[.,]\d+)?)\s*%$/);if(!rate)continue;const percentage=Number(rate[1].replace(',','.'));if(!Number.isFinite(percentage)||percentage>100)continue;result.push({stockManaged:a.stockManaged,unitNetPrice:Number(a.netPrice),key:'article:'+a.id,articleId:a.id,priceListId:'',priceListName:'Osnovna cena artikla',name:a.name,code:a.code,unitId:a.unitId,unitLabel:a.unitLabel,vatId:a.vatId,vatLabel:a.vatLabel,grossPrice:Number((Number(a.netPrice)*(1+percentage/100)).toFixed(8)),discount:0,priceListNetPrice:a.netPrice,priceListDiscount:0,priceListDiffers:false,sourceSha:createHash('sha256').update(JSON.stringify(a)).digest('hex')});}}
 if(priceListId===undefined)return result;
 // Resolve one live price per article from the actual customer's policy, not an arbitrary list.
 const lists=await read.priceLists(),resolved:EstimateCatalogOption[]=[];
 const relevant=result.filter(o=>detail.lines.some(l=>l.articleId?l.articleId===o.articleId:l.articleCode?l.articleCode===o.code:exact(l.description)===exact(o.name)));
 for(const option of [...new Map(relevant.map(o=>[o.articleId,o])).values()]){
  try{
   const article=await read.article(option.articleId);
   if(priceListId){const list=lists.find(l=>l.id===priceListId);if(!list)continue;resolved.push(customerCatalogPricing(article,list,lists,{priceListId}).option);}
   else resolved.push({...option,key:'article:'+article.id,priceListId:'',priceListName:'Osnovna cena artikla',name:article.name,code:article.code,stockManaged:article.stockManaged,unitId:article.unitId,unitLabel:article.unitLabel,vatId:article.vatId,vatLabel:article.vatLabel,unitNetPrice:Number(article.netPrice),grossPrice:Number((Number(article.netPrice)*vatFactor(article.vatLabel)).toFixed(8)),discount:0,sourceSha:createHash('sha256').update(JSON.stringify({article,priceListId:null})).digest('hex')});
  }catch{/* Missing or unsupported customer pricing excludes this line; never fall back. */}
 }
 return resolved;
}
export async function loadEstimateHistory(read:HistoryRead,input:{customerId:string;vehicleId:string;wanted:string;code?:string;priceListId?:string|null},page?:{scope:'vehicle'|'other';offset:number}){
 const catalog=await loadEstimateCatalog(read),issues=catalog.issues.filter(issue=>input.priceListId===undefined||!issue.includes('Priprava s šifro uporablja osnovno ceno')),proposals:EstimateHistoryProposal[]=[];
 let nextPage:{scope:'vehicle'|'other';offset:number}|undefined;
 const kinds:HistoryKind[]=['work_order','estimate','invoice'];
 async function scan(customerId?:string){
 const lists=await Promise.allSettled(kinds.map(kind=>read.historyDocuments(kind,customerId)));
 const refs: Array<{kind:HistoryKind;doc:QuibiDocument}>=[];
 lists.forEach((result,index)=>{if(result.status==='rejected'){issues.push('Zgodovina '+kinds[index]+' ni dostopna; pregled ni popoln.');return;}const docs=result.value.filter(d=>d.id!=='2176888').sort((a,b)=>Number(b.id)-Number(a.id));for(const doc of docs)refs.push({kind:kinds[index],doc});});
 const offset=page?.offset??0,end=page?Math.min(offset+24,refs.length):refs.length;
 if(end<refs.length)nextPage={scope:customerId?'vehicle':'other',offset:end};
 for(let i=offset;i<end;i+=4){
 const batch=refs.slice(i,Math.min(i+4,end)),results=await Promise.allSettled(batch.map(r=>read.documentDetail(r.doc.id,r.doc.customerId)));
 for(let index=0;index<results.length;index++){
 const r=results[index],ref=batch[index];
 if(r.status==='rejected'){issues.push('Podrobnosti enega dokumenta niso dostopne; pregled ni popoln.');continue;}
 if(r.value.id!==ref.doc.id||r.value.customerId!==ref.doc.customerId){issues.push('Identiteta dokumenta ni potrjena.');continue;}
 if(customerId&&(r.value.customerId!==input.customerId||r.value.vehicleId!==input.vehicleId))continue;
 const initial=historyProposal(r.value,ref.kind,input,catalog.options);if(!initial||proposals.some(p=>p.key===initial.key))continue;
 if(proposals.length>=5){issues.push('Prikazanih je največ pet natančnih zgodovinskih predlogov.');continue;}
 const expanded=await documentCatalog(read,r.value,catalog.options,input.priceListId);
 const proposal=historyProposal(r.value,ref.kind,input,expanded);if(proposal)proposals.push(proposal);
 }
 }
 }
 if(page?.scope==='other')await scan();else await scan(input.customerId);
 if(!nextPage&&page?.scope!=='other'&&!proposals.some(p=>p.ready&&p.scope==='vehicle')){issues.push('Pregledani so tudi drugi dokumenti. Ti predlogi niso dokaz zgodovine tega vozila.');if(page)nextPage={scope:'other',offset:0};else await scan();}
 return {proposals,issues:[...new Set(issues)],nextPage};
}
export async function freshHistorySource(form:FormData,read:HistoryRead,input:{customerId:string;vehicleId:string;wanted:string;code?:string;priceListId?:string|null}){
 const selected=form.get('historySource');if(!selected)return null;
 if(typeof selected!=='string'||!/^(work_order|estimate|invoice):\d+:\d+$/.test(selected))throw Error('QUIBI_HISTORY_INVALID');
 const [kind,customerId,id]=selected.split(':');if(id==='2176888')throw Error('QUIBI_HISTORY_INVALID');
 // Re-establish document type and ownership from the documented list, not browser data.
 const listed=await read.historyDocuments(kind as HistoryKind,customerId);
 if(!listed.some(d=>d.id===id&&d.customerId===customerId))throw Error('QUIBI_HISTORY_INVALID');
 const [detail,catalog]=await Promise.all([read.documentDetail(id,customerId),loadEstimateCatalog(read)]);
 if(detail.id!==id||detail.customerId!==customerId)throw Error('QUIBI_HISTORY_INVALID');
 const proposal=historyProposal(detail,kind as HistoryKind,input,await documentCatalog(read,detail,catalog.options,input.priceListId));
 if(!proposal?.ready)throw Error('QUIBI_HISTORY_REQUIRES_REVIEW');
 return proposal;
}

export function verifyHistoryCatalogReferences(proposal:EstimateHistoryProposal,catalogs:{units:{id:string;label:string}[];vatRates:{id:string;label:string}[]}){
 if(proposal.lines.some(line=>!catalogs.units.some(u=>u.id===line.unitId&&u.label===line.unit)||!catalogs.vatRates.some(v=>v.id===line.vatId&&v.label===line.vat)))throw Error('QUIBI_CATALOG_REFERENCE_CHANGED');
}
