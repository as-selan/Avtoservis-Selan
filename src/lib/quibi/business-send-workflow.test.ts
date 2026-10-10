import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sendBusinessDocument,businessSendKey} from './business-send-workflow.ts';
import type {Operation,OperationJournal} from './write-workflow.ts';
function fixture(){let op:Operation|null=null,dispatches=0;
const journal:OperationJournal={get:async()=>op,insertOnce:async entry=>op??(op={...entry,id:'op',state:'prepared',quibiId:null,quibiContentSha256:null,documentNumber:null,sendId:null,sendStatus:null}),claim:async(_,state)=>{if(!op||op.state!==state)return false;op={...op,state:'dispatching'};return true},patch:async(_,state,patch)=>{if(!op||op.state!==state)throw Error('RACE');return op={...op,...patch}}};
const args={caseId:'00000000-0000-4000-8000-000000000001',documentId:'42',sha:'a'.repeat(64),amount:'122',recipient:'owner@qa.test',journal,write:{sendDocument:async()=>{dispatches++;return {sendId:'fixture-send',status:'queued' as const}}}};
return {args,count:()=>dispatches};}
test('business dispatch is durably locked; same content does not send again',async()=>{const f=fixture();const first=await sendBusinessDocument(f.args);assert.equal(first.sendId,'fixture-send');await sendBusinessDocument(f.args);assert.equal(f.count(),1);assert.equal(businessSendKey(f.args.caseId,'42',f.args.sha),first.localEntityId)});
test('definitive provider rejection and timeout keep different outcomes and neither retries',async()=>{for(const [error,state] of [['QUIBI_HTTP_403','failed'],['TIMEOUT','uncertain']]){const f=fixture();let posts=0;f.args.write.sendDocument=async()=>{posts++;throw Error(error)};assert.equal((await sendBusinessDocument(f.args)).state,state);await sendBusinessDocument(f.args);assert.equal(posts,1)}});
test('old QA document and changed recipient are blocked',async()=>{const f=fixture();await assert.rejects(sendBusinessDocument({...f.args,documentId:'2176888'}),/INVALID/);await sendBusinessDocument(f.args);await assert.rejects(sendBusinessDocument({...f.args,recipient:'other@qa.test'}),/CHANGED/);assert.equal(f.count(),1)});
test('simultaneous business send claims dispatch exactly once',async()=>{
 const f=fixture();const results=await Promise.allSettled([sendBusinessDocument(f.args),sendBusinessDocument(f.args)]);
 assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(f.count(),1);
});
