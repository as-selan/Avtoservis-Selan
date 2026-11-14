import test from 'node:test';
import assert from 'node:assert/strict';
import {syncQuibiCaseUrl} from './case-url-sync.ts';
const caseId='00000000-0000-4000-8000-000000000001';
test('verified documents use case ID and stable key for repeat and domain change',async()=>{
 const calls:unknown[]=[]; const client={addCaseUrl:async(...args:unknown[])=>{calls.push(args);return {id:'1',obstaja:calls.length>1}}};
 for(const origin of ['https://selan.example','https://new-selan.example']) assert.equal(await syncQuibiCaseUrl({documentId:'42',caseId,origin,verified:true},client),true);
 assert.deepEqual(calls.map(c=>(c as [string,{zunanji_id:string}])[1].zunanji_id),[`selan-case:${caseId}`,`selan-case:${caseId}`]);
 assert.equal((calls[0] as [string,{url:string}])[1].url,`https://selan.example/dashboard/primeri/${caseId}`);
});
test('unverified documents and invalid origin never send; provider failure is nonblocking',async()=>{
 let calls=0;const client={addCaseUrl:async()=>{calls++;throw Error('offline')}};
 assert.equal(await syncQuibiCaseUrl({documentId:'42',caseId,origin:'https://selan.example',verified:false},client),false);
 assert.equal(await syncQuibiCaseUrl({documentId:'42',caseId,origin:'https://preview.vercel.app',verified:true,production:true},client),false);
 assert.equal(await syncQuibiCaseUrl({documentId:'42',caseId,origin:'https://selan.example',verified:true},client),false);
 assert.equal(calls,1);
});

test('bounded automatic retry reuses document and case after temporary outage',async()=>{
 const calls:unknown[]=[]; let attempts=0;
 const client={addCaseUrl:async(...args:unknown[])=>{calls.push(args);if(++attempts<3)throw Error('offline');return {id:'1',obstaja:true}}};
 const {retryQuibiCaseUrl}=await import('./case-url-sync.ts');
 const delays:number[]=[];
 assert.equal(await retryQuibiCaseUrl({documentId:'42',caseId,origin:'https://selan.example',verified:true},client,async ms=>{delays.push(ms)}),true);
 assert.equal(calls.length,3); assert.deepEqual(calls[0],calls[1]); assert.deepEqual(calls[1],calls[2]); assert.deepEqual(delays,[1000,2000]);
});
test('automatic retry stops after three failures without creating documents',async()=>{
 let attempts=0;const {retryQuibiCaseUrl}=await import('./case-url-sync.ts');
 const result=await retryQuibiCaseUrl({documentId:'42',caseId,origin:'https://selan.example',verified:true},{addCaseUrl:async()=>{attempts++;throw Error('offline')}},async()=>{});
 assert.equal(result,false);assert.equal(attempts,3);
});

test('synthetic estimate, work order and invoice each retain one case link through retries',async()=>{
 const records=new Map<string,{url:string;naziv:string;zunanji_id:string}>();let failOnce=true;
 const {createQuibiDevWriteClient}=await import('./write-http.ts');
 const env={APP_ENV:'preproduction',QUIBI_MODE:'dev',VERCEL_ENV:'preview',QUIBI_DEV_WRITE_ENABLED:'1',QUIBI_DEV_USERNAME:'fixture',QUIBI_DEV_PASSWORD:'fixture'};
 const client=createQuibiDevWriteClient({username:'fixture',password:'fixture',environment:env,fetcher:async(target,options)=>{
  if(failOnce){failOnce=false;throw Error('offline')}
  const id=new URL(String(target)).pathname.split('/').pop()!;
  const body=JSON.parse(String(options?.body));const exists=records.has(id+':'+body.zunanji_id);records.set(id+':'+body.zunanji_id,body);
  return Response.json({error:false,data:{obstaja:exists,Povezava:{id:15,...body}}});
 }});
 const {retryQuibiCaseUrl}=await import('./case-url-sync.ts');
 for(const documentId of ['101','102','103']){
  const input={documentId,caseId,origin:'https://selan.example',verified:true};
  assert.equal(await retryQuibiCaseUrl(input,client,async()=>{}),true);
  assert.equal(await retryQuibiCaseUrl(input,client,async()=>{}),true);
 }
 assert.equal(records.size,3);
 for(const record of records.values())assert.equal(record.url,`https://selan.example/dashboard/primeri/${caseId}`);
});
