import test from 'node:test';
import assert from 'node:assert/strict';
import {matchSyntheticCases} from './quibi-dev-identity-match.mjs';

test('maps local customer UUID to verified external Quibi ID within the same organization',()=>{
 const cases=[{id:'case-1',organization_id:'org-1',customer_id:'local-uuid',summary:'QA-SIM sample',problem_description:'QA-SIM sample'}];
 const links=[{organization_id:'org-1',entity_id:'local-uuid',external_id:'405956',provider:'quibi',entity_type:'customer',sync_status:'ok',quibi_environment:'dev'}];
 assert.deepEqual(matchSyntheticCases(cases,links,['405956']),[{caseId:'case-1',customerId:'local-uuid',quibiCustomerId:'405956'}]);
 for(const patch of [{organization_id:'other'},{entity_id:'other'},{external_id:'123'},{sync_status:'failed'},{quibi_environment:'production'},{provider:'other'}])assert.deepEqual(matchSyntheticCases(cases,[{...links[0],...patch}],['405956']),[]);
});
