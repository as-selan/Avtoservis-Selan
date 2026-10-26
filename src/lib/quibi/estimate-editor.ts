import {moneyLineCents} from './line-pricing';
import type {IntakeServiceMatch} from '../assistance/intake-analysis';
import type {EstimateCatalogOption} from './estimate-catalog';
export type EstimateDraftRow={key:string;quantity:string;discount:string;unitPrice?:string;requestedService?:string;candidateKeys?:string[];matchSource?:string;description?:string;unitId?:string;vatId?:string};
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
 for(const row of rows){if(row.key===''){if(!(row.description??row.requestedService)?.trim()||!row.unitId||!row.vatId||!row.quantity.trim()||row.unitPrice===undefined||!/^\d+(?:[.,]\d{1,2})?$/.test(row.unitPrice))return null;const quantity=Number(row.quantity.replace(',','.')),price=Number(row.unitPrice.replace(',','.')),discount=Number((row.discount||'0').replace(',','.'));if(!Number.isFinite(quantity)||quantity<=0||quantity>100000||!Number.isFinite(price)||price<0||price>1000000||!Number.isFinite(discount)||discount<0||discount>100)return null;cents+=moneyLineCents(quantity,price,discount);continue;}const option=options.find(o=>o.key===row.key);if(!option||!row.quantity.trim())return null;const quantity=Number(row.quantity.replace(',','.')),{unitPrice,discount}=draftRowPrice(row,option,customerPriceListId);if(!Number.isFinite(quantity)||quantity<=0||quantity>100000||!Number.isFinite(unitPrice)||unitPrice<0||unitPrice>1000000||!Number.isFinite(discount)||discount<0||discount>100)return null;cents+=moneyLineCents(quantity,unitPrice,discount);}
 return Number.isSafeInteger(cents)?cents/100:null;
}

/** One choice per article; the server always applies the assigned customer list. */
export function canonicalEstimateOptions(options:EstimateCatalogOption[],customerPriceListId?:string|null){const articles=[...new Set(options.map(o=>o.articleId))];return articles.map(id=>options.find(o=>o.articleId===id&&o.priceListId===customerPriceListId)??options.find(o=>o.articleId===id)!);}

/** Request text is authoritative; AI availability must never erase requested work. */
export function requestedEstimateRows(wanted:string|null|undefined,description:string|null|undefined,options:EstimateCatalogOption[],customerPriceListId?:string|null):EstimateDraftRow[]{
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('sl').replace(/[^a-z0-9]+/g,' ').trim();
 const categories=new Set(['avtomehanika','druga storitev']);
 const split=(value:string)=>value.replace(/\\r\\n|\\n|\\r/g,'\n').split(/[\n\r;•]+/).map(v=>v.replace(/^\s*(?:[-*]|\d+[.)])\s*/,'').trim()).filter(v=>!!v&&!/^TESTNO POVPRAŠEVANJE\s*[-–:]\s*AVTOSERVIS SELAN$/iu.test(v));
 // Customer problem descriptions are context, never implicit billable services.
 void description;
 const labels=split(wanted??'').filter(v=>!categories.has(normalize(v)));
 const unique=labels.filter((v,i)=>labels.findIndex(other=>normalize(other)===normalize(v))===i);
 const catalog=canonicalEstimateOptions(options,customerPriceListId);
 return unique.slice(0,100).map(requestedService=>{
  const matches=catalog.filter(o=>normalize(o.name)===normalize(requestedService)||normalize(o.code)===normalize(requestedService));
  const candidate=matches.length===1?matches[0]:undefined;
  const match=candidate&&/brezpla[čc]n/i.test(candidate.name)&&candidate.grossPrice>0?undefined:candidate;
  // One requested service is one piece; time, weight and other units need an explicit quantity.
  const quantity=match&&['kos','kom','storitev','piece','pcs'].includes(normalize(match.unitLabel))?'1':'';
  return {key:match?.key??'',quantity,discount:'',requestedService,...(candidate&&!match?{candidateKeys:[candidate.key]}:{})};
 });
}

const serviceWords=(s:string)=>s.split(/\r?\n/)[0].normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\bredni servis vozila\b/g,'servis vozila').replace(/\bbrezplacni\b/g,'').replace(/\bpregled vozila pred tehnicnim pregledom\b/g,'pregled pred tehnicnim pregledom').replace(/\bpregeld\b/g,'pregled').replace(/\bkontrola\b/g,'pregled').replace(/\b(avta|avtomobila)\b/g,'vozila').replace(/\bzavornega sistema\b/g,'zavor').replace(/\bpred tehnicnim(?: pregledom)?\b/g,'pred tehnicnim pregledom').split(/\s+/);
function editDistance(a:string,b:string){const d=Array.from({length:a.length+1},()=>Array<number>(b.length+1).fill(0));for(let i=0;i<=a.length;i++)d[i][0]=i;for(let j=0;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+Number(a[i-1]!==b[j-1]));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);}return d[a.length][b.length];}
/** Suggestions carry catalog identities only. Prices always remain fresh Quibi data. */
export function assistedEstimateRows(rows:EstimateDraftRow[],options:EstimateCatalogOption[],matches:IntakeServiceMatch[]=[]):EstimateDraftRow[]{
 return rows.map(row=>{
  if(row.key||!row.requestedService)return row;
  const words=serviceWords(row.requestedService),text=words.join(' ');
  const ranked=options.map(o=>{const nameWords=serviceWords(o.name),name=nameWords.join(' '),anchors=words.filter(word=>!['','qa','pregled','pregledom','servis','vozila','pred','po','za','na','in'].includes(word));if(words.includes('pregled')&&!nameWords.includes('pregled'))return {o,score:0};if(anchors.length&&!anchors.some(a=>nameWords.some(b=>a===b||a.length>=5&&b.length>=5&&editDistance(a,b)<=1)))return {o,score:0};const distance=text.length<=250&&name.length<=250?editDistance(text,name):Infinity;return {o,score:1-distance/Math.max(text.length,name.length,1)};}).filter(x=>x.score>=0.45).sort((a,b)=>b.score-a.score);
  const ai=matches.find(m=>m.requestedService===row.requestedService);
  const candidates=[...new Set([...(ai?.key?[ai.key]:[]),...(ai?.alternatives??[]),...ranked.slice(0,3).map(x=>x.o.key)])].filter(key=>options.some(o=>o.key===key)).slice(0,3);
  const highAi=ai?.confidence==='high'&&ai.key&&!(ai.alternatives??[]).some(k=>k!==ai.key)?options.find(o=>o.key===ai.key):undefined;
  const typo=ranked[0]?.score>=0.9&&ranked[0].score-(ranked[1]?.score??0)>=0.12?ranked[0].o:undefined;
  const proposed=highAi??typo;
  const selected=proposed&&/brezpla[čc]n/i.test(proposed.name)&&proposed.grossPrice>0?undefined:proposed;
  return {...row,key:selected?.key??'',candidateKeys:candidates,matchSource:highAi?'AI predlog za pregled':typo?'Ujemanje opisa storitve':undefined,quantity:selected?(['kos','kom','storitev','piece','pcs'].includes(serviceWords(selected.unitLabel).join(' '))?'1':''):row.quantity};
 });
}

/** Saved problem text proposes work for review; it never selects a billable identity or price. */
export function suggestedEstimateRows(wanted:string|null|undefined,description:string|null|undefined,options:EstimateCatalogOption[],customerPriceListId?:string|null,matches:IntakeServiceMatch[]=[]):EstimateDraftRow[]{
 const explicit=requestedEstimateRows(wanted,null,options,customerPriceListId);
 if(explicit.length)return assistedEstimateRows(explicit,canonicalEstimateOptions(options,customerPriceListId),matches);
 const clauses=(description??'').replace(/\\r\\n|\\n|\\r/g,'\n').split(/[\n\r;•]+/).map(s=>s.replace(/^\s*(?:[-*]|\d+[.)])\s*/,'').trim());
 const labels=clauses.filter(s=>s.length<=500&&!/\b(ne\s+želim|ne\s+zelim|ni\s+potreb|ne\s+potreb|brez\s+menjave)/i.test(s)&&/^(?:(?:želim|zelim|potrebujem|prosim(?:\s+za)?)\s+)?(?:redni\s+servis|servis|pregled|pregeld|kontrola|menjava|zamenjava|popravilo|diagnostika|vulkanizacija|optika|polnjenje)\b/i.test(s));
 const rows=assistedEstimateRows(requestedEstimateRows(labels.join('\n'),null,options,customerPriceListId),canonicalEstimateOptions(options,customerPriceListId));
 return rows.map(row=>({...row,key:'',quantity:'',unitPrice:undefined,discount:'',candidateKeys:[...new Set([row.key,...(row.candidateKeys??[])].filter(Boolean))],matchSource:'Predlog iz opisa'}));
}
