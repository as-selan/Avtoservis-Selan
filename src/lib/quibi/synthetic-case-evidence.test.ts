import test from 'node:test';import assert from 'node:assert/strict';import {syntheticCaseEvidenceAllowed} from './synthetic-case-evidence.ts';const env={APP_ENV:'preproduction',QUIBI_MODE:'dev',VERCEL_ENV:'preview'},data={description:'QA-SIM-E2E',name:'TEST-SELAN-AI',email:'test@example.test',vin:'TESTSELANAX202601'};test('explicit synthetic evidence is limited to marked own DEV Preview case',()=>{assert.equal(syntheticCaseEvidenceAllowed(env,data),true);for(const change of [{QUIBI_MODE:'production'},{VERCEL_ENV:'production'},{APP_ENV:'production'}])assert.equal(syntheticCaseEvidenceAllowed({...env,...change},data),false);for(const change of [{name:'Customer'},{email:'customer@gmail.com'},{vin:'WBA123456789'},{description:'real repair'}])assert.equal(syntheticCaseEvidenceAllowed(env,{...data,...change}),false);});

test('A73 requires the exact authorized DEV fixture identity, not generic TEST markers',()=>{const a73={caseId:'a73db6be-7216-4677-bc0a-26e97693ad75',description:'TESTNO POVPRAŠEVANJE – AVTOSERVIS SELAN\nServis vozila',name:'TEST SELAN SPLET 24-10',email:'selan.test.2410@example.com',vin:'TESTSELANBX202602'};assert.equal(syntheticCaseEvidenceAllowed(env,a73),true);for(const patch of [{caseId:'other'},{vin:'TESTOTHER'},{email:'customer@example.com'},{name:'TEST OTHER'},{description:'real repair'}])assert.equal(syntheticCaseEvidenceAllowed(env,{...a73,...patch}),false);for(const patch of [{VERCEL_ENV:'production'},{QUIBI_MODE:'production'},{SELAN_REMOTE_DEMO:'1'}])assert.equal(syntheticCaseEvidenceAllowed({...env,...patch},a73),false);});

test('the user-authorized C066 fixture is labelled as simulation only for its exact DEV identity',()=>{
 const fixture={caseId:'c066482d-0002-43c4-9090-b23833928f71',name:'TEST REA E2E 20261025',email:'test.rea.e2e.20261025@example.test',vin:'TESTREA20261025XX',description:'Sintetični TEST REA E2E – brez dejanske storitve.'};
 assert.equal(syntheticCaseEvidenceAllowed(env,fixture),true);
 for(const patch of [{caseId:'another'},{name:'Real customer'},{email:'customer@example.test'},{vin:'TESTOTHER'},{description:'Dejansko popravilo'}])assert.equal(syntheticCaseEvidenceAllowed(env,{...fixture,...patch}),false);
 assert.equal(syntheticCaseEvidenceAllowed({...env,QUIBI_MODE:'production'},fixture),false);
});


test('only an isolated loopback fixture may record marked synthetic approval locally',()=>{
 const fixture={APP_ENV:'local',CI:'true',SELAN_ISOLATED_E2E:'1',QUIBI_E2E_WRITE_ENABLED:'1',QUIBI_E2E_ORIGIN:'http://127.0.0.1:47862',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',PUBLIC_APP_ORIGIN:'http://127.0.0.1:3000',QUIBI_DEV_USERNAME:'selan-isolated-fixture',QUIBI_DEV_PASSWORD:'selan-isolated-fixture'};
 assert.equal(syntheticCaseEvidenceAllowed(fixture,data),true);assert.equal(syntheticCaseEvidenceAllowed({...fixture,VERCEL_ENV:'preview'},data),false);assert.equal(syntheticCaseEvidenceAllowed({...fixture,NEXT_PUBLIC_SUPABASE_URL:'https://remote.supabase.co'},data),false);assert.equal(syntheticCaseEvidenceAllowed(fixture,{...data,email:'real@example.com'}),false);
});
