import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {assertLocalPartyWriteConfiguration,assertLocalPartyWriteTarget,assertLocalPartyWriteRequest} from './local-write-policy.ts';
import {quibiWorkflowConfig} from './workflow-config.ts';
const body={Stranka:{naziv:'TEST'}};
const env={NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:55421',APP_ENV:'preproduction',QUIBI_MODE:'dev',QUIBI_DEV_LOCAL_WRITE_ENABLED:'1',QUIBI_DEV_WRITE_ENABLED:'1',SELAN_APPROVED_LOCAL_DEV:'1',PUBLIC_APP_ORIGIN:'http://127.0.0.1:3002',COMPLETION_PUBLIC_ORIGIN:'http://127.0.0.1:3002',QUIBI_DEV_USERNAME:'fixture',QUIBI_DEV_PASSWORD:'fixture',QUIBI_DEV_LOCAL_WRITE_CUSTOMER_ID:'7',QUIBI_DEV_LOCAL_WRITE_BODY_SHA256:createHash('sha256').update(JSON.stringify(body)).digest('hex')};
test('scoped local permission admits only reviewed customer update; no sending or documents',()=>{
 assert.doesNotThrow(()=>assertLocalPartyWriteConfiguration(env));assert.doesNotThrow(()=>assertLocalPartyWriteTarget(env,'/api2/stranka/form/7','POST',body));
 for(const path of ['/api2/stranka/form/8','/api2/stranka/form','/api2/glavadokumenta/form','/api2/glavadokumenta/send/42'])assert.throws(()=>assertLocalPartyWriteTarget(env,path,'POST',body),/SCOPE/);
 assert.throws(()=>assertLocalPartyWriteTarget(env,'/api2/stranka/form/7','POST',{Stranka:{naziv:'CHANGED'}}),/SCOPE/);
 assert.throws(()=>quibiWorkflowConfig(env,'send'),/DISABLED/);
});
test('local write denies hosted environment, external origin, missing flags and protected QA customer',()=>{
 for(const patch of [{NEXT_PUBLIC_SUPABASE_URL:'https://hosted.supabase.co'},{VERCEL:'1'},{APP_ENV:'production'},{QUIBI_MODE:'production'},{QUIBI_DEV_WRITE_ENABLED:'0'},{QUIBI_DEV_LOCAL_WRITE_CUSTOMER_ID:'405956'},{PUBLIC_APP_ORIGIN:'http://localhost:3002'}])assert.throws(()=>assertLocalPartyWriteConfiguration({...env,...patch}),/DISABLED/);
 assert.throws(()=>assertLocalPartyWriteRequest(env,new Headers({host:'evil.test',origin:env.PUBLIC_APP_ORIGIN})),/FORBIDDEN/);
 assert.doesNotThrow(()=>assertLocalPartyWriteRequest(env,new Headers({host:'127.0.0.1:3002',origin:env.PUBLIC_APP_ORIGIN})));
});
