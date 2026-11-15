import assert from 'node:assert/strict';
import {test} from 'node:test';
import {businessFormStart,businessDispatchMayContinue,businessPreparationCanAutoload,hasRecordedCustomerApproval,businessDispatchConfirmation,businessHeaderSelection} from './business-form-state.ts';
test('case proceeds from Quibi work order to invoice without a local order',()=>{
 assert.deepEqual(businessFormStart([]),{kind:'work_order',operation:'create'});
 assert.deepEqual(businessFormStart([{document_kind:'work_order'}]),{kind:'invoice',operation:'create'});
 assert.deepEqual(businessFormStart([{document_kind:'work_order'},{document_kind:'invoice'}]),{kind:'invoice',operation:'update'});
});
test('only explicit failure before dispatch permits corrected preparation',()=>{
 assert.equal(businessDispatchMayContinue({ok:false,dispatchStarted:false}),true);
 for(const result of [{ok:false},{ok:false,dispatchStarted:true},{ok:true,dispatchStarted:false},{ok:true}])assert.equal(businessDispatchMayContinue(result),false);
});

test('READ source preview autoloads before numbering choice, including invoice, never an update',()=>{
 const ready={caseId:'case',kind:'work_order',operation:'create',numberingCount:1};
 assert.equal(businessPreparationCanAutoload(ready),true);for(const numberingCount of [0,2])assert.equal(businessPreparationCanAutoload({...ready,numberingCount}),true);assert.equal(businessPreparationCanAutoload({...ready,kind:'invoice'}),true);
 for(const input of [{...ready,caseId:undefined},{...ready,kind:'unsupported'},{...ready,operation:'update'}])assert.equal(businessPreparationCanAutoload(input),false);
});

test('recorded approval requires immutable decision evidence and matching SHA, independently of delivery status',()=>{
 const row={customer_decision:'approved',decided_at:'2026-10-12T10:00:00Z',decision_evidence_reference:'Telefon: potrjeno naročilo',revoked_at:null,content_sha256:'approved-sha'};
 assert.equal(hasRecordedCustomerApproval(row,'approved-sha'),true);
 for(const change of [{customer_decision:'rejected'},{decided_at:null},{decided_at:'invalid'},{decision_evidence_reference:null},{decision_evidence_reference:' '},{revoked_at:'2026-10-12'},{content_sha256:'changed'}])assert.equal(hasRecordedCustomerApproval({...row,...change},'approved-sha'),false);
});

test('one explicit business click binds confirmation to the fresh reviewed request SHA',()=>{
 const sha='a'.repeat(64);assert.deepEqual(businessDispatchConfirmation(sha),{dispatch:'yes',confirmed:'yes',expectedSha:sha});
 for(const invalid of [undefined,'','unreviewed','a'.repeat(63)])assert.throws(()=>businessDispatchConfirmation(invalid),/PREPARATION_REQUIRED/);
});

test('business headers inherit verified source sale type and unique numbering; ambiguous or invalid choices never allow CREATE',()=>{const options=[{id:'1',label:'Delovni nalog'},{id:'2',label:'Račun'}],sales=[{id:'sale'}],input={numberingId:'',saleTypeId:'',sourceSaleTypeId:'sale'};assert.deepEqual(businessHeaderSelection('work_order',options,sales,input),{numberingId:'1',saleTypeId:'sale',ready:true});assert.equal(businessHeaderSelection('invoice',[...options,{id:'3',label:'Račun'}],sales,input).ready,false);assert.equal(businessHeaderSelection('invoice',[...options,{id:'3',label:'Račun'}],sales,{...input,numberingId:'3'}).ready,true);assert.equal(businessHeaderSelection('invoice',options,sales,{...input,numberingId:'1'}).ready,false);assert.equal(businessHeaderSelection('invoice',options,sales,{...input,sourceSaleTypeId:'unknown'}).ready,false);});
