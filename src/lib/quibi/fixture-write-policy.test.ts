import assert from 'node:assert/strict';
import test from 'node:test';
import {quibiWorkflowConfig} from './workflow-config.ts';
const env={APP_ENV:'local',CI:'true',SELAN_ISOLATED_E2E:'1',QUIBI_E2E_WRITE_ENABLED:'1',QUIBI_E2E_ORIGIN:'http://127.0.0.1:47863',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:55421',PUBLIC_APP_ORIGIN:'http://127.0.0.1:3003',QUIBI_DEV_USERNAME:'selan-isolated-fixture',QUIBI_DEV_PASSWORD:'selan-isolated-fixture',QUIBI_DEV_WRITE_ENABLED:'0'};
test('simulated writes stay on the isolated loopback adapter and can never send',()=>{
 assert.equal(quibiWorkflowConfig(env,'write').origin,env.QUIBI_E2E_ORIGIN);
 assert.throws(()=>quibiWorkflowConfig(env,'send'));
 for(const patch of [{CI:'false'},{SELAN_ISOLATED_E2E:'0'},{APP_ENV:'production'},{QUIBI_E2E_ORIGIN:'https://dev.quibi.net'},{NEXT_PUBLIC_SUPABASE_URL:'https://hosted.supabase.co'},{QUIBI_DEV_PASSWORD:'real-credential'},{QUIBI_DEV_WRITE_ENABLED:'1'}])assert.throws(()=>quibiWorkflowConfig({...env,...patch},'write'));
});
