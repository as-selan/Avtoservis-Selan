type CaseUrlClient = {addCaseUrl: (documentId:string, link:{url:string;naziv:string;zunanji_id:string}, origin:string)=>Promise<unknown>};
/** Caller must supply a document whose association was already verified and persisted. */
export async function syncQuibiCaseUrl(input:{documentId:string;caseId:string;origin:string;verified:boolean;production?:boolean},client:CaseUrlClient):Promise<boolean>{
 try {
  if(!input.verified||!/^\d+$/.test(input.documentId)||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.caseId))return false;
  const origin=new URL(input.origin);
  if(origin.protocol!=='https:'||origin.origin!==input.origin||origin.username||origin.password||(input.production&&origin.hostname.endsWith('.vercel.app')))return false;
  await client.addCaseUrl(input.documentId,{url:`${origin.origin}/dashboard/primeri/${input.caseId}`,naziv:'Fotografije in priloge vozila',zunanji_id:`selan-case:${input.caseId}`},origin.origin);
  return true;
 } catch { return false; }
}
