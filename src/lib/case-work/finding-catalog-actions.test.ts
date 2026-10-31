import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

function fixture(state:'approved'|'rejected'='approved'){
 const events:string[]=[],body={Glavadokumenta:{id:42}},snapshot={body,baselineSha:'a'.repeat(64),requestSha:'b'.repeat(64),expectedAmount:'10',unitPrices:[10],unitIds:['1']};let bound=false;
 const query=(name:string)=>{const q={select:()=>q,eq:()=>q,is:()=>q,order:()=>q,limit:()=>q,single:async()=>({data:name==='service_case_assignments'?{organization_id:'org',vehicle_id:'vehicle',quibi_customer_id:'7'}:name==='service_requests'?{customer_id:'customer',vehicle_id:'vehicle'}:name==='customers'?{}:name==='vehicles'?{customer_id:'customer'}:{id:'finding',state},error:null}),maybeSingle:async()=>({data:{id:'offer',lines:[snapshot],quibi_operation_id:bound?'operation':null},error:null})};return q;};
 const db={from:query},admin={rpc:async(name:string)=>{events.push(name);bound=true;return {error:null}}},exports:Record<string,unknown>={};
 const imports:Record<string,unknown>={'node:crypto':{},'@supabase/supabase-js':{createClient:()=>admin},'next/cache':{revalidatePath:()=>{}},'@/lib/auth/requireWorkshopAccess':{requireWorkshopAccess:async()=>({role:'admin',organizationId:'org',userId:'actor'})},'@/lib/supabase/server':{createClient:async()=>db},'@/lib/quibi/client':{configuredQuibiReadClient:()=>({})},'@/lib/quibi/write-client':{configuredQuibiWorkflowWriteClient:()=>({})},'@/lib/quibi/write-journal':{quibiWorkflowJournal:()=>({})},'@/lib/quibi/deployment-policy':{caseWorkQuibiEnvironment:()=> 'dev'},'@/lib/quibi/estimate-catalog':{},'@/lib/quibi/estimate-catalog-source':{},'@/lib/quibi/business-source-lines':{},'@/lib/quibi/business-document-workflow':{businessUpdatePayload:()=>({sha256:'b'.repeat(64)}),updateBusinessDocument:async()=>{events.push('update');return {id:'operation'}}},'@/lib/quibi/write-contract':{},'@/lib/quibi/document-read':{},'@/lib/quibi/line-pricing':{},'@/lib/quibi/synthetic-case-evidence':{syntheticCaseEvidenceAllowed:()=>true},'@/lib/quibi/contracts':{}};
 const code=ts.transpileModule(readFileSync(new URL('./finding-catalog-actions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{exports,require:(name:string)=>imports[name],process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'}},FormData,String,Number,JSON,Error,Promise,Set});
 const form=new FormData();form.set('caseId','case');form.set('findingId','finding');return {events,form,save:exports.saveFindingCatalogItem as (form:FormData)=>Promise<{ok:boolean}>};
}
test('saved approval resumes verified operation and binds once; repeated click does not dispatch',async()=>{const f=fixture();assert.equal((await f.save(f.form)).ok,true);assert.equal((await f.save(f.form)).ok,true);assert.deepEqual(f.events,['update','bind_finding_catalog_operation']);});
test('rejected finding cannot dispatch or bind',async()=>{const f=fixture('rejected');assert.equal((await f.save(f.form)).ok,false);assert.deepEqual(f.events,[]);});
