import assert from 'node:assert/strict';
import {test} from 'node:test';
import {businessFormStart,businessDispatchMayContinue} from './business-form-state.ts';
test('case proceeds from Quibi work order to invoice without a local order',()=>{
 assert.deepEqual(businessFormStart([]),{kind:'work_order',operation:'create'});
 assert.deepEqual(businessFormStart([{document_kind:'work_order'}]),{kind:'invoice',operation:'create'});
 assert.deepEqual(businessFormStart([{document_kind:'work_order'},{document_kind:'invoice'}]),{kind:'invoice',operation:'update'});
});
test('only explicit failure before dispatch permits corrected preparation',()=>{
 assert.equal(businessDispatchMayContinue({ok:false,dispatchStarted:false}),true);
 for(const result of [{ok:false},{ok:false,dispatchStarted:true},{ok:true,dispatchStarted:false},{ok:true}])assert.equal(businessDispatchMayContinue(result),false);
});
