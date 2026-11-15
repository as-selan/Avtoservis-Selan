import test from 'node:test';import assert from 'node:assert/strict';import {localSyntheticQaAllowed,isSyntheticQaReference} from './synthetic-qa-policy.ts';
const env={APP_ENV:'local',CI:'true',SELAN_ISOLATED_E2E:'1',SELAN_LOCAL_REVIEW:'1',QUIBI_E2E_WRITE_ENABLED:'1',QUIBI_E2E_ORIGIN:'http://127.0.0.1:47863',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:55421',PUBLIC_APP_ORIGIN:'http://127.0.0.1:3003',QUIBI_DEV_USERNAME:'selan-isolated-fixture',QUIBI_DEV_PASSWORD:'selan-isolated-fixture',QUIBI_DEV_WRITE_ENABLED:'0'};
test('synthetic booking requires the isolated loopback fixture and never a real DEV or hosted environment',()=>{
 assert.ok(localSyntheticQaAllowed(env));for(const patch of [{SELAN_LOCAL_REVIEW:'0'},{APP_ENV:'preproduction'},{CI:'false'},{NEXT_PUBLIC_SUPABASE_URL:'https://verxxsjbewmkgoxwqvxo.supabase.co'},{QUIBI_E2E_ORIGIN:'https://dev.quibi.net'},{QUIBI_DEV_WRITE_ENABLED:'1'},{QUIBI_DEV_PASSWORD:'real-credential'},{VERCEL_ENV:'preview'}])assert.equal(localSyntheticQaAllowed({...env,...patch}),false);
 assert.ok(isSyntheticQaReference('QA-SIM-BOOKING-84BE9001'));assert.equal(isSyntheticQaReference('MyPlanly confirmed'),false);
});
