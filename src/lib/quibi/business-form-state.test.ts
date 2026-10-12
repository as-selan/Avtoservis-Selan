import assert from 'node:assert/strict';
import {test} from 'node:test';
import {businessFormStart,businessDispatchMayContinue,businessPreparationCanAutoload} from './business-form-state.ts';
test('case proceeds from Quibi work order to invoice without a local order',()=>{
 assert.deepEqual(businessFormStart([]),{kind:'work_order',operation:'create'});
 assert.deepEqual(businessFormStart([{document_kind:'work_order'}]),{kind:'invoice',operation:'create'});
 assert.deepEqual(businessFormStart([{document_kind:'work_order'},{document_kind:'invoice'}]),{kind:'invoice',operation:'update'});
});
test('only explicit failure before dispatch permits corrected preparation',()=>{
 assert.equal(businessDispatchMayContinue({ok:false,dispatchStarted:false}),true);
 for(const result of [{ok:false},{ok:false,dispatchStarted:true},{ok:true,dispatchStarted:false},{ok:true}])assert.equal(businessDispatchMayContinue(result),false);
});

test('only an unambiguous case work order is prepared automatically, never an invoice or update',()=>{
 const ready={caseId:'case',kind:'work_order',operation:'create',numberingCount:1};
 assert.equal(businessPreparationCanAutoload(ready),true);
 for(const input of [{...ready,caseId:undefined},{...ready,kind:'invoice'},{...ready,operation:'update'},{...ready,numberingCount:0},{...ready,numberingCount:2}])assert.equal(businessPreparationCanAutoload(input),false);
});
