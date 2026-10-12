import assert from 'node:assert/strict';
import {test} from 'node:test';
import {businessFormStart,businessDispatchMayContinue,businessPreparationCanAutoload,hasRecordedCustomerApproval} from './business-form-state.ts';
test('case proceeds from Quibi work order to invoice without a local order',()=>{
 assert.deepEqual(businessFormStart([]),{kind:'work_order',operation:'create'});
 assert.deepEqual(businessFormStart([{document_kind:'work_order'}]),{kind:'invoice',operation:'create'});
 assert.deepEqual(businessFormStart([{document_kind:'work_order'},{document_kind:'invoice'}]),{kind:'invoice',operation:'update'});
});
test('only explicit failure before dispatch permits corrected preparation',()=>{
 assert.equal(businessDispatchMayContinue({ok:false,dispatchStarted:false}),true);
 for(const result of [{ok:false},{ok:false,dispatchStarted:true},{ok:true,dispatchStarted:false},{ok:true}])assert.equal(businessDispatchMayContinue(result),false);
});

test('only an unambiguous case work order is prepared automatically, including invoice, never an update',()=>{
 const ready={caseId:'case',kind:'work_order',operation:'create',numberingCount:1};
 assert.equal(businessPreparationCanAutoload(ready),true);assert.equal(businessPreparationCanAutoload({...ready,kind:'invoice'}),true);
 for(const input of [{...ready,caseId:undefined},{...ready,kind:'unsupported'},{...ready,operation:'update'},{...ready,numberingCount:0},{...ready,numberingCount:2}])assert.equal(businessPreparationCanAutoload(input),false);
});

test('recorded approval requires immutable decision evidence and matching SHA, independently of delivery status',()=>{
 const row={customer_decision:'approved',decided_at:'2026-10-12T10:00:00Z',decision_evidence_reference:'Telefon: potrjeno naročilo',revoked_at:null,content_sha256:'approved-sha'};
 assert.equal(hasRecordedCustomerApproval(row,'approved-sha'),true);
 for(const change of [{customer_decision:'rejected'},{decided_at:null},{decided_at:'invalid'},{decision_evidence_reference:null},{decision_evidence_reference:' '},{revoked_at:'2026-10-12'},{content_sha256:'changed'}])assert.equal(hasRecordedCustomerApproval({...row,...change},'approved-sha'),false);
});
