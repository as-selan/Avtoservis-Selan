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
