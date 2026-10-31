import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import path from 'node:path';
// Execute the real server action with isolated auth/DB/Quibi adapters. No network or real writes.
function fixture({role='admin',production=false,confirmed=true,linkFails=false,stale=false}={}){
 const calls=[];const fields={vin:'SYNTHETICVIN000001',registration:'QA-001',make:'QA',model:'Test'};
 const request={customer_id:'customer',vehicle_id:'vehicle',status:'new',updated_at:'expected'};
 const customer={display_name:'QA',phone:'',email:''};const link={external_id:'405',sync_status:'ok',quibi_environment:production?'production':'dev',external_fingerprint:'customer',local_fingerprint:'customer'};
 const env=production?{APP_ENV:'production',QUIBI_MODE:'production',VERCEL_ENV:'production',SELAN_DEV_SUPABASE_PROJECT_REF:'dev',SELAN_PRODUCTION_SUPABASE_PROJECT_REF:'prod',NEXT_PUBLIC_SUPABASE_URL:'https://prod.supabase.co'}:{APP_ENV:'preproduction',QUIBI_MODE:'dev',VERCEL_ENV:'preview',NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid'};
 env.SUPABASE_SERVICE_ROLE_KEY='fixture-only';
 const db={from(table){const data=table==='service_requests'?request:table==='vehicles'?{...fields,registration_current:fields.registration}:table==='customers'?customer:table==='integration_links'?link:[];const result={data,error:null};const q=new Proxy({}, {get:(_,key)=>key==='then'?Promise.resolve(result).then.bind(Promise.resolve(result)):()=>q});return q;}};
 const store={rpc:async(_name,args)=>{calls.push(args.p_action);return args.p_action==='link'&&linkFails?{error:{message:'failed'}}:{data:{ok:true,vehicleId:'vehicle'}}}};
 const read={customer:async()=>customer,vehicle:async()=>({id:'501',customerId:'405',disabled:false,...fields})};
 const mocks={
 './automatic-intake-sync':{scheduleIntakeSynchronization:id=>calls.push('prepare:'+id)},
 './workflow-config':{quibiWorkflowConfig:()=>({mode:production?'production':'dev'})},
 '@/lib/intake/completeness':{currentIntakeCompleteness:()=>({})},
 './party-write-input':{UUID_RE:/^[a-f0-9-]{36}$/},
 'next/cache':{revalidatePath:()=>{}},'@supabase/supabase-js':{createClient:()=>store},
 '@/lib/supabase/server':{createClient:async()=>{calls.push('db');return db}},
 '@/lib/auth/requireWorkshopAccess':{requirePhase1OperationalAccess:async()=>({role,userId:'actor',organizationId:'org'})},
 './client':{configuredQuibiReadClient:()=>read},'./contracts':{customerFingerprint:()=> 'customer',vehicleFingerprint:()=> 'vehicle'},
 './vehicle-identity':{assertSamePhysicalVehicle:()=>{}},
 './party-write-workflow':{createOrReconcileVehicle:async()=>{calls.push('synthetic-create');return {quibiId:'501'}}},
 './write-journal':{quibiWorkflowJournal:()=>({})},'./write-client':{configuredQuibiWorkflowWriteClient:()=>({})}
 };
 const cache={};function load(file){if(cache[file])return cache[file];const exports={};cache[file]=exports;const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports,URL,process:{env},require:name=>mocks[name]??load(path.resolve(path.dirname(file),name+'.ts'))},{filename:file});return exports;}
 const action=load(path.resolve('src/lib/quibi/vehicle-resolution-actions.ts'));
 const form=new FormData();for(const [key,value] of Object.entries({caseId:'a73db6be-7216-4677-bc0a-26e97693ad75',revision:'00000000-0000-4000-8000-000000000019',expected:stale?'stale':'expected',confirmed:confirmed?'yes':'no',baselineFingerprint:'vehicle',mode:'link',remoteId:'501',remoteFingerprint:'vehicle'}))form.set(key,value);
 return {action,form,calls};
}
test('DEV admin explicit CREATE links verified result and schedules preparation exactly once',async()=>{const f=fixture();assert.equal((await f.action.createVehicleForCase(f.form)).ok,true);assert.deepEqual(f.calls,['db','ready','synthetic-create','link','prepare:a73db6be-7216-4677-bc0a-26e97693ad75']);});
test('production admin, mechanic and absent explicit confirmation cannot reach DB or CREATE',async()=>{for(const options of [{production:true},{role:'mechanic'},{confirmed:false}]){const f=fixture(options);assert.equal((await f.action.createVehicleForCase(f.form)).ok,false);assert.deepEqual(f.calls,[]);}});
test('owner production permission is preserved',async()=>{const f=fixture({production:true,role:'owner'});const result=await f.action.createVehicleForCase(f.form);assert.equal(result.ok,true,JSON.stringify(f.calls));assert.ok(f.calls.includes('synthetic-create'));});
test('stale input cannot create; failed link cannot start preparation',async()=>{const stale=fixture({stale:true});assert.equal((await stale.action.createVehicleForCase(stale.form)).ok,false);assert.deepEqual(stale.calls,['db']);const failed=fixture({linkFails:true});assert.equal((await failed.action.createVehicleForCase(failed.form)).ok,false);assert.equal(failed.calls.some(x=>x.startsWith('prepare:')),false);});
test('linking an existing verified vehicle schedules preparation without CREATE',async()=>{const f=fixture();assert.equal((await f.action.resolveCaseVehicle(f.form)).ok,true);assert.deepEqual(f.calls,['db','link','prepare:a73db6be-7216-4677-bc0a-26e97693ad75']);});


