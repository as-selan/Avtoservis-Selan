import test from 'node:test';
import assert from 'node:assert/strict';
import {hostedQuibiEnvironment,caseWorkQuibiEnvironment,quibiJournalTable} from './deployment-policy.ts';
import {quibiWorkflowConfig,workflowRecipient} from './workflow-config.ts';
import {intakeSyncConfigurationProblem} from './intake-sync-configuration.ts';
import {assertCaseBusinessScope,caseBusinessReference} from './case-business-policy.ts';
import {assertDirectDevRead,assertDirectDevVehicleRead} from './direct-document-read.ts';
const dev={APP_ENV:'preproduction',QUIBI_MODE:'dev',VERCEL_ENV:'preview',QUIBI_DEV_WRITE_ENABLED:'1',QUIBI_DEV_SEND_ENABLED:'1',QUIBI_DEV_USERNAME:'fixture',QUIBI_DEV_PASSWORD:'fixture'};
const production={APP_ENV:'production',QUIBI_MODE:'production',VERCEL_ENV:'production',SELAN_DEV_SUPABASE_PROJECT_REF:'fixture-dev',SELAN_PRODUCTION_SUPABASE_PROJECT_REF:'fixture-prod',NEXT_PUBLIC_SUPABASE_URL:'https://fixture-prod.supabase.co',QUIBI_PRODUCTION_READ_ENABLED:'1',QUIBI_PRODUCTION_WRITE_ENABLED:'1',QUIBI_PRODUCTION_SEND_ENABLED:'1',QUIBI_PRODUCTION_USERNAME:'fixture',QUIBI_PRODUCTION_PASSWORD:'fixture'};
test('same case stages and direct document permissions in both environments',()=>{for(const env of [dev,production]){
 const mode=hostedQuibiEnvironment(env);assert.equal(quibiWorkflowConfig(env,'write').mode,mode);
 for(const status of ['preparing_offer','awaiting_customer_approval','awaiting_slot_selection','appointment_confirmed','converted']){assert.doesNotThrow(()=>assertCaseBusinessScope(env,status,'work_order',false));assert.doesNotThrow(()=>assertCaseBusinessScope(env,status,'invoice',false,true));assert.throws(()=>assertCaseBusinessScope(env,status,'invoice',false));assert.doesNotThrow(()=>assertCaseBusinessScope(env,status,'invoice',true));}
 for(const role of ['owner','admin','reception']){assert.doesNotThrow(()=>assertDirectDevRead(env,role,{customerId:'42',documentId:'43',kind:'invoice'}));assert.doesNotThrow(()=>assertDirectDevVehicleRead(env,role,'42','44'));}
 assert.throws(()=>assertDirectDevRead(env,'mechanic',{customerId:'42',documentId:'43',kind:'invoice'}));
 const row={id:'op',kind:'work_order',state:'verified',quibi_id:'43',quibi_content_sha256:'a'.repeat(64),created_at:'2026-10-15',request_body:JSON.stringify({Glavadokumenta:{stranka_id:42,vozila_id:44}})};
 assert.equal(caseBusinessReference([row],'work_order',mode)?.quibi_environment,mode);
 assert.equal(quibiJournalTable(mode),mode==='dev'?'quibi_dev_operation_journal':'quibi_production_operation_journal');
}});
test('production needs separate database and independent read/write/send approvals',()=>{
 for(const patch of [{SELAN_PRODUCTION_SUPABASE_PROJECT_REF:''},{SELAN_DEV_SUPABASE_PROJECT_REF:'fixture-prod'},{NEXT_PUBLIC_SUPABASE_URL:'https://fixture-dev.supabase.co'},{NEXT_PUBLIC_SUPABASE_URL:'http://fixture-prod.supabase.co'},{QUIBI_MODE:'dev'},{VERCEL_ENV:'preview'},{QUIBI_DEV_LOCAL_SEND_ENABLED:'1'}])assert.throws(()=>quibiWorkflowConfig({...production,...patch},'write'));
 assert.throws(()=>quibiWorkflowConfig({...production,QUIBI_PRODUCTION_READ_ENABLED:'0'},'read'));
 assert.doesNotThrow(()=>quibiWorkflowConfig({...production,QUIBI_PRODUCTION_WRITE_ENABLED:'0'},'read'));
 assert.throws(()=>quibiWorkflowConfig({...production,QUIBI_PRODUCTION_WRITE_ENABLED:'0'},'write'));
 assert.doesNotThrow(()=>quibiWorkflowConfig({...production,QUIBI_PRODUCTION_SEND_ENABLED:'0'},'write'));
 assert.throws(()=>quibiWorkflowConfig({...production,QUIBI_PRODUCTION_SEND_ENABLED:'0'},'send'));
});
test('write preparation is independent from mail configuration; send recipients remain isolated',()=>{
 assert.doesNotThrow(()=>quibiWorkflowConfig(dev,'write'));
 assert.throws(()=>workflowRecipient(dev,'qa@example.test','qa@example.test'));
 const mail={...dev,QUIBI_DEV_TEST_RECIPIENT:'online.gold100@gmail.com'};
 assert.equal(workflowRecipient(mail,'qa@example.test','qa@example.test'),'online.gold100@gmail.com');
 assert.throws(()=>workflowRecipient(mail,'qa@example.test','qa@example.test','qa@example.test'));
 assert.equal(workflowRecipient(production,'customer@fixture.mail','customer@fixture.mail'),'customer@fixture.mail');
 assert.throws(()=>workflowRecipient(production,'qa@example.test','qa@example.test'));
});
test('automatic intake uses shared actor checks and explicit mode-specific activation',()=>{
 const actor={QUIBI_INTAKE_SYNC_ACTOR_ID:'00000000-0000-4000-8000-000000000001',SUPABASE_SERVICE_ROLE_KEY:'fixture'};
 assert.equal(intakeSyncConfigurationProblem({...dev,...actor,QUIBI_DEV_INTAKE_SYNC_ENABLED:'1'}),null);
 assert.equal(intakeSyncConfigurationProblem({...production,...actor,QUIBI_PRODUCTION_INTAKE_SYNC_ENABLED:'1'}),null);
 assert.match(intakeSyncConfigurationProblem({...production,...actor,QUIBI_DEV_INTAKE_SYNC_ENABLED:'1'})??'',/QUIBI_PRODUCTION_INTAKE_SYNC_ENABLED/);
});


test('case work fixture accepts only explicitly isolated loopback CI, leaving hosted environment rules unchanged',()=>{
 const fixture={CI:'true',SELAN_ISOLATED_E2E:'1',QUIBI_E2E_ORIGIN:'http://127.0.0.1:47862',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321'};
 assert.equal(caseWorkQuibiEnvironment(fixture),'dev');assert.throws(()=>hostedQuibiEnvironment(fixture));
 for(const patch of [{CI:'false'},{SELAN_ISOLATED_E2E:'0'},{VERCEL:'1'},{VERCEL_ENV:'preview'},{APP_ENV:'production'},{QUIBI_MODE:'production'},{QUIBI_E2E_ORIGIN:'https://dev.quibi.net'},{NEXT_PUBLIC_SUPABASE_URL:'https://production.supabase.co'}])assert.throws(()=>caseWorkQuibiEnvironment({...fixture,...patch}));
 assert.equal(caseWorkQuibiEnvironment(dev),'dev');assert.equal(caseWorkQuibiEnvironment(production),'production');
});


test('isolated local write and case review share the fixture while hosted environments remain excluded',()=>{
 const env={APP_ENV:'local',CI:'true',SELAN_ISOLATED_E2E:'1',QUIBI_E2E_WRITE_ENABLED:'1',QUIBI_E2E_ORIGIN:'http://127.0.0.1:47862',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',PUBLIC_APP_ORIGIN:'http://127.0.0.1:3000',QUIBI_DEV_USERNAME:'selan-isolated-fixture',QUIBI_DEV_PASSWORD:'selan-isolated-fixture'};
 assert.equal(quibiWorkflowConfig(env,'write').mode,'dev');assert.equal(caseWorkQuibiEnvironment(env),'dev');assert.throws(()=>hostedQuibiEnvironment(env));assert.throws(()=>quibiWorkflowConfig(env,'send'));
 for(const patch of [{VERCEL:'1'},{VERCEL_ENV:'preview'},{APP_ENV:'production'},{CI:'false'},{QUIBI_E2E_ORIGIN:'https://dev.quibi.net'},{NEXT_PUBLIC_SUPABASE_URL:'https://prod.supabase.co'},{PUBLIC_APP_ORIGIN:'https://example.com'},{QUIBI_DEV_WRITE_ENABLED:'1'},{QUIBI_DEV_LOCAL_SEND_ENABLED:'1'},{QUIBI_DEV_PASSWORD:'wrong'}])assert.throws(()=>caseWorkQuibiEnvironment({...env,...patch}));
});


test('isolated intake uses existing enabled actor and local fixture; it never enables real writes',()=>{
 const e={APP_ENV:'local',CI:'true',SELAN_ISOLATED_E2E:'1',QUIBI_E2E_WRITE_ENABLED:'1',QUIBI_E2E_ORIGIN:'http://127.0.0.1:47862',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',PUBLIC_APP_ORIGIN:'http://127.0.0.1:3000',QUIBI_DEV_USERNAME:'selan-isolated-fixture',QUIBI_DEV_PASSWORD:'selan-isolated-fixture',QUIBI_DEV_INTAKE_SYNC_ENABLED:'1',QUIBI_INTAKE_SYNC_ACTOR_ID:'00000000-0000-4000-8000-000000000001',SUPABASE_SERVICE_ROLE_KEY:'fixture'};
 assert.equal(intakeSyncConfigurationProblem(e,'write'),null);assert.ok(intakeSyncConfigurationProblem({...e,QUIBI_INTAKE_SYNC_ACTOR_ID:''},'write'));assert.ok(intakeSyncConfigurationProblem({...e,QUIBI_E2E_ORIGIN:'https://dev.quibi.net'},'write'));assert.ok(intakeSyncConfigurationProblem({...e,VERCEL_ENV:'preview'},'write'));assert.ok(intakeSyncConfigurationProblem({...e,QUIBI_DEV_WRITE_ENABLED:'1'},'write'));
});
