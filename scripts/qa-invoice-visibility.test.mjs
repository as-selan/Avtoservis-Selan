import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const Form=()=>null, Decision=()=>null;
async function render({linked=true,confirmed=true,status='accepted',focused=false}={}){
 let reads=0;
 const db={from(table){const data=table==='service_requests'?{customer_id:'c',vehicle_id:'v',status,updated_at:'now'}:table==='vehicles'?{vin:'TEST',registration_current:'TEST',make:'QA',model:'Car'}:table==='integration_links'?{external_id:'405964',sync_status:'ok',quibi_environment:'dev'}:linked?{quibi_vehicle_id:'2391',sync_status:'ok'}:null;const q={select:()=>q,eq:()=>q,single:async()=>({data}),maybeSingle:async()=>({data})};return q}};
 const imports={'react/jsx-runtime':require('react/jsx-runtime'),'@/lib/quibi/vehicle-create-permission':{canConfirmQuibiVehicleCreate:()=>true},'./NewVehicleDecision':{NewVehicleDecision:Decision},'@/lib/quibi/deployment-policy':{isHostedQuibiEnvironment:()=>true,hostedQuibiEnvironment:()=> 'dev'},'@/lib/quibi/workflow-config':{quibiWorkflowConfig:()=>({mode:'dev'})},'@supabase/supabase-js':{createClient:()=>({rpc:async()=>({data:{ok:true}})})},'@/lib/auth/requireWorkshopAccess':{requirePhase1OperationalAccess:async()=>({role:'admin',organizationId:'org',userId:'actor'})},'@/lib/supabase/server':{createClient:async()=>db},'@/lib/quibi/client':{configuredQuibiReadClient:()=>({vehicles:async()=>{reads++;return []}})},'@/lib/quibi/contracts':{vehicleFingerprint:()=> 'fingerprint'},'./VehicleResolutionForm':{VehicleResolutionForm:Form}};
 const exports={};runInNewContext(ts.transpileModule(readFileSync('src/components/dashboard/VehicleResolutionPanel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>{assert.ok(n in imports,n);return imports[n]},process:{env:{SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',NEXT_PUBLIC_SUPABASE_URL:'synthetic-only'}}});
 const tree=await exports.VehicleResolutionPanel({caseId:'case',identityConfirmed:confirmed,focused});const forms=[];function visit(n){if(!n||typeof n!=='object')return;if(Array.isArray(n))return n.forEach(visit);if(n.type===Form)forms.push(n.props.mode);visit(n.props?.children)}visit(tree);return {tree,forms,reads};
}
test('confirmed invoice vehicle has no resolution DOM or unnecessary remote read',async()=>{const r=await render();assert.equal(r.tree,null);assert.equal(r.reads,0)});
test('new vehicle still exposes explicit confirmation',async()=>{const r=await render({linked:false,confirmed:false,status:'new',focused:true});assert.equal(r.tree.type,Decision)});
test('unresolved existing link retains corrections but never CREATE',async()=>{const r=await render({confirmed:false,status:'new'});assert.ok(r.forms.includes('correct'));assert.ok(!r.forms.includes('create'))});
test('business page does not render configuration names; correction route remains',()=>{const s=readFileSync('src/app/dashboard/primeri/[serviceRequestId]/page.tsx','utf8');assert.ok(!s.includes('intakeAiConfiguration'));assert.ok(!s.includes('activation.missing'));assert.ok(s.includes('Preglej povezavo stranke in vozila'));assert.ok(s.includes('identityConfirmed={identityConfirmed} focused='))});
