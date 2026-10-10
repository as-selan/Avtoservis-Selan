import assert from 'node:assert/strict';
import {test} from 'node:test';
import {updatePartyAndVerify} from './party-update-workflow.ts';
import type {Operation,OperationJournal} from './write-workflow.ts';
const id='00000000-0000-4000-8000-000000000001';
function fixture(){let op:Operation|null=null,remote='a'.repeat(64),posts=0;
const journal:OperationJournal={get:async()=>op,insertOnce:async entry=>op??(op={...entry,id:'op',state:'prepared',quibiId:null,quibiContentSha256:null,documentNumber:null,sendId:null,sendStatus:null}),claim:async(_,state)=>{if(!op||op.state!==state)return false;op={...op,state:'dispatching'};return true},patch:async(_,state,patch)=>{if(!op||op.state!==state)throw Error('RACE');return op={...op,...patch}}};
const args={kind:'customer_update' as const,revisionId:id,caseId:id,quibiId:'7',baseline:remote,target:'b'.repeat(64),body:{naziv:'Test'},journal,readFingerprint:async()=>remote,write:async()=>{posts++;remote='b'.repeat(64)}};
return {args,count:()=>posts,state:()=>op?.state,drift:()=>{remote='c'.repeat(64)}}}
test('party update re-reads target and repeated revision never posts twice',async()=>{const f=fixture();await updatePartyAndVerify(f.args);await updatePartyAndVerify(f.args);assert.equal(f.count(),1);assert.equal(f.state(),'verified');f.drift();await assert.rejects(updatePartyAndVerify(f.args),/CHANGED/)});
test('party timeout never retries update and detects changed requests',async()=>{const f=fixture();f.args.write=async()=>{throw Error('TIMEOUT')};await assert.rejects(updatePartyAndVerify(f.args),/RECONCILIATION/);assert.equal(f.state(),'uncertain');await assert.rejects(updatePartyAndVerify(f.args),/RECONCILIATION/);await assert.rejects(updatePartyAndVerify({...f.args,body:{naziv:'Other'}}),/CHANGED/)});
test('fresh conflicting remote data blocks write before durable claim',async()=>{const f=fixture();f.drift();await assert.rejects(updatePartyAndVerify(f.args),/CHANGED/);assert.equal(f.count(),0)});
test('a rejected or timed out no-op is not proof of WRITE permission',async()=>{
 for(const cause of ['QUIBI_HTTP_403','TIMEOUT']){const f=fixture();f.args.target=f.args.baseline;f.args.write=async()=>{throw Error(cause)};await assert.rejects(updatePartyAndVerify(f.args),/REJECTED|RECONCILIATION/);assert.equal(f.state(),cause==='QUIBI_HTTP_403'?'failed':'uncertain');await assert.rejects(updatePartyAndVerify(f.args),/RECONCILIATION/)}
});
