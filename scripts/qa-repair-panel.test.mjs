import {businessLineDescription} from '../src/lib/quibi/price-presentation.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const Form=()=>null;
const jsx=require('react/jsx-runtime');
async function panel(status,{locked=false,role='admin',assigned=true,customerName='QA Customer',inspect=false,phase, lazyRepairHref}={}){
 const work={caseId:'case',quibiId:'2176933',mechanicId:'mechanic',status,phase:phase?{id:phase}:undefined,vehicle:{make:'QA',model:'Car',registration:'TEST',vin:'TEST'},review:{workLocked:locked}};
 const db={from(table){const result={data:table==='service_requests'?{customer_id:'customer'}:table==='customers'?{display_name:customerName}:[]};const q={...result,select:()=>q,eq:()=>q,is:()=>q,not:()=>q,in:()=>q,order:()=>q,single:async()=>result,maybeSingle:async()=>result};return q;},rpc:async()=>({data:[]}),auth:{getUser:async()=>({data:{user:{id:'actor'}}})},storage:{from:()=>({createSignedUrl:()=>{throw Error('No photo path in fixture')}})}};
 const imports={'@/lib/quibi/price-presentation':{businessLineDescription},'./CasePickupPanel':{CasePickupPanel:'pickup-panel'},'react':require('react'),'react/jsx-runtime':jsx,'next/link':{default:'link',__esModule:true},'next/image':()=>null,'./CaseReviewPanel':{CaseReviewPanel:()=>null},'./CaseWorkSummary':{CaseWorkSummary:()=>null},'@/lib/case-work/overview':{activityTime:()=>''},'@/lib/case-work/read':{loadCaseWork:async()=>({db,rows:assigned?[work]:[],error:null}),verifiedRepairLines:()=>{throw Error('No Quibi transport allowed')}},'./CaseWorkForms':{CaseWorkForm:Form}};
 const exports={};const code=ts.transpileModule(readFileSync('src/components/dashboard/CaseWorkPanel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(code,{exports,require:name=>{if(!(name in imports))throw Error('Unexpected import '+name);return imports[name]},Map,Set,Promise});
 async function resolve(node){if(Array.isArray(node))return Promise.all(node.map(resolve));if(!node||typeof node!=='object'||!node.props)return node;if(typeof node.type==='function'&&['Assignment','CustomerName','CaseWorkEvidence'].includes(node.type.name))return resolve(await node.type(node.props));return {...node,props:{...node.props,children:await resolve(node.props.children)}};}
 const tree=await resolve(await exports.CaseWorkPanel({caseId:'case',role,lazyRepairHref}));const forms=[];function visit(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}if(node.type===Form)forms.push(node.props.mode);visit(node.props?.children)}visit(tree);return inspect?tree:forms;
}
test('completed and locked work hide reassignment, progress and upload forms',async()=>{assert.deepEqual(await panel('work_completed'),['note']);assert.deepEqual(await panel('in_progress',{locked:true}),[])});
test('active manager retains secondary reassignment; mechanic never gets assignment',async()=>{assert.deepEqual(await panel('in_progress'),['assign','progress','photo']);assert.deepEqual(await panel('in_progress',{role:'mechanic'}),['progress','photo'])});
test('unassigned work has only assignment, and mechanic cannot assign',async()=>{assert.deepEqual(await panel('assigned',{assigned:false}),['assign']);assert.deepEqual(await panel('assigned',{assigned:false,role:'mechanic'}),[])});

function content(node){if(Array.isArray(node))return node.map(content).join(' ');if(node&&typeof node==='object')return content(node.props?.children);return typeof node==='string'?node:'';}
test('existing authorized customer name is displayed; denied or absent name has no empty customer heading',async()=>{
 assert.match(content(await panel('assigned',{role:'mechanic',customerName:'Existing Customer',inspect:true})),/Existing Customer/);
 for(const customerName of [null,'','   '])assert.doesNotMatch(content(await panel('assigned',{role:'mechanic',customerName,inspect:true})),/Stranka|QA Customer/);
});

test('closed repair details do not read notes or photographs until the details link is opened',async()=>{const tree=await panel('work_completed',{phase:'closed',lazyRepairHref:'/dashboard/nalogi/case?podrobnosti=popravilo',inspect:true});assert.doesNotMatch(content(tree),/Servisni zapiski|Zasebne fotografije/);function findLink(n){if(Array.isArray(n))return n.some(findLink);return !!n&&typeof n==='object'&&(n.props?.href==='/dashboard/nalogi/case?podrobnosti=popravilo'||findLink(n.props?.children));}assert.ok(findLink(tree));});
test('repair details remain accessible after opening',async()=>{const tree=await panel('work_completed',{phase:'closed',inspect:true});assert.match(content(tree),/Servisni zapiski/);assert.match(content(tree),/Zasebne fotografije/);});
