import {parseQuibiArticle,type QuibiArticle} from './pricing-read.ts';
/** Cursor protocol from /sifranti/seznam. Never cache a partial or inconsistent list. */
export async function readArticlePages(get:(path:string)=>Promise<unknown>,limit=500,selection?:{allowUncoded?:boolean;include?:(row:Record<string,unknown>)=>boolean;invalid?:(id:string)=>void;page?:(rows:Record<string,unknown>[])=>void}):Promise<QuibiArticle[]>{
 if(!Number.isInteger(limit)||limit<1||limit>500)throw Error('QUIBI_CATALOG_PAGE_LIMIT');
 const articles:QuibiArticle[]=[],seen=new Set<string>();let cursor=0;
 for(let page=0;page<2000;page++){
  const value=await get('/api2/sifranti/seznam?po='+cursor+'&limit='+limit+'&arhivirano=0');
  if(!value||typeof value!=='object')throw Error('QUIBI_CATALOG_PAGE_INVALID');
  const envelope=value as Record<string,unknown>,data=envelope.data as Record<string,unknown>|undefined;
  if(envelope.error!==false||!data||!Array.isArray(data.Sifranti)||data.Sifranti.length>limit)throw Error('QUIBI_CATALOG_PAGE_INVALID');
  selection?.page?.(data.Sifranti);
  let last=cursor;
  for(const row of data.Sifranti){
   const id=String(row?.Sifranti?.id??'');if(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<=last||seen.has(id))throw Error('QUIBI_CATALOG_PAGE_DUPLICATE_OR_ORDER');
   seen.add(id);last=Number(id);if(selection?.include&&!selection.include(row))continue;
   try{articles.push(parseQuibiArticle({error:false,data:{Sifranti:row}},id,selection?.allowUncoded));}catch(error){if(!selection?.invalid)throw error;selection.invalid(id);}
  }
  if(envelope.naslednji_po===null)return articles;
  const next=Number(envelope.naslednji_po);
  if(!['number','string'].includes(typeof envelope.naslednji_po)||!Number.isSafeInteger(next)||next<=cursor||next!==last||!data.Sifranti.length)throw Error('QUIBI_CATALOG_CURSOR_INVALID');
  cursor=next;
 }
 throw Error('QUIBI_CATALOG_TOO_MANY_PAGES');
}
