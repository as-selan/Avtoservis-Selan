import {QuibiValidationError} from './write-http.ts';
type CaseUrlClient = {addCaseUrl: (documentId:string, link:{url:string;naziv:string;zunanji_id:string}, origin:string)=>Promise<unknown>};
type CaseUrlInput={documentId:string;caseId:string;origin:string;verified:boolean;production?:boolean};
type AttemptResult='success'|'permanent_failure'|'transient_failure';
/** Caller must supply a document whose association was already verified and persisted. */
export async function attemptQuibiCaseUrl(input:CaseUrlInput,client:CaseUrlClient):Promise<AttemptResult>{
 try {
  if(!input.verified||!/^\d+$/.test(input.documentId)||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.caseId))return 'permanent_failure';
  let origin:URL;try{origin=new URL(input.origin)}catch{return 'permanent_failure'}
  if(origin.protocol!=='https:'||origin.origin!==input.origin||origin.username||origin.password||(input.production&&origin.hostname.endsWith('.vercel.app')))return 'permanent_failure';
  await client.addCaseUrl(input.documentId,{url:`${origin.origin}/dashboard/primeri/${input.caseId}`,naziv:'Fotografije in priloge vozila',zunanji_id:`selan-case:${input.caseId}`},origin.origin);
  return 'success';
 } catch(error) { return error instanceof QuibiValidationError?'permanent_failure':'transient_failure'; }
}
export async function syncQuibiCaseUrl(input:CaseUrlInput,client:CaseUrlClient):Promise<boolean>{return await attemptQuibiCaseUrl(input,client)==='success';}
/** Bounded retries use the identical validated document, case and idempotency key. */
export async function retryQuibiCaseUrl(input:CaseUrlInput,client:CaseUrlClient,wait:(ms:number)=>Promise<void>=(ms)=>new Promise(resolve=>setTimeout(resolve,ms))):Promise<boolean>{
 for(let attempt=0;attempt<3;attempt++){
  if(attempt)await wait(attempt*1000);
  const result=await attemptQuibiCaseUrl(input,client);
  if(result==='success')return true;
  if(result==='permanent_failure')return false;
 }
 return false;
}
