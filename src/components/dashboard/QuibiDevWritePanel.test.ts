import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

type Element = {type:unknown;props:Record<string,unknown>};
function panel(state:string, readFails=false, selectedCatalog=false){
 const calls:string[]=[],effects:(()=>unknown)[]=[];let slot=0,refreshes=0;
 const jsx=(type:unknown,props:Record<string,unknown>)=>({type,props});
 const actions=Object.fromEntries(['prepareQuibiEstimate','prepareQuibiEstimateHistory','createQuibiDevEstimate','reconcileQuibiEstimate'].map(name=>[name,async()=>{calls.push(name);if(readFails&&name==='prepareQuibiEstimate')throw Error('READ unavailable');return name==='prepareQuibiEstimateHistory'?{proposals:[],issues:[]}:{ok:true,sha:'a'.repeat(64),detail:'Priprava preverjena'};}]));
 const react={useRef:(value:unknown)=>({current:value}),useState:(value:unknown)=>{const i=slot++;return [i===7?'a'.repeat(64):i===10?true:i===5?false:value,()=>{}]},useEffect:(effect:()=>unknown)=>effects.push(effect),useTransition:()=>[false,(fn:()=>Promise<void>)=>fn()]};
 const exports:Record<string,unknown>={};
 const code=ts.transpileModule(readFileSync(new URL('./QuibiDevWritePanel.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 class Form extends FormData{constructor(){super();this.set('createConfirmed','yes')}}
 runInNewContext(code,{exports,require:(name:string)=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='next/navigation'?{useRouter:()=>({refresh:()=>{refreshes++}})}:actions,FormData:Form,HTMLInputElement:class{},JSON,Map,Set});
 const element=(exports.QuibiDevWritePanel as (p:unknown)=>Element)({serviceRequestId:'case',mode:'create',operationState:state,initialCatalogSource:selectedCatalog?'189:11':undefined,catalogOptions:selectedCatalog?[{key:'189:11',name:'Service',code:'SERVICE',grossPrice:122,unitLabel:'kos',vatLabel:'22 %',discount:0,unitId:'1',vatId:'5'}]:[],choices:{saleTypes:[{id:'1',label:'Sale'}],units:[{id:'1',label:'kos'}],vatRates:[{id:'5',label:'22 %'}]}});
 return {element,calls,effects,refreshes:()=>refreshes};
}
for(const state of ['failed','uncertain','dispatching','verified']){
 test(`${state}: READ preview remains available while confirmed CREATE cannot dispatch`,async()=>{
  const {element,calls}=panel(state);assert.equal(element.type,'form');
  const submit=element.props.onSubmit as (e:unknown)=>void;
  submit({preventDefault(){},currentTarget:{},nativeEvent:{submitter:{getAttribute:()=> 'yes'}}});
  await new Promise(r=>setImmediate(r));assert.deepEqual(calls,[]);
  submit({preventDefault(){},currentTarget:{},nativeEvent:{submitter:null}});
  await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['prepareQuibiEstimate']);
 });
}
test('failed CREATE no longer suppresses history READ',async()=>{const p=panel('failed');p.effects[0]();await new Promise(r=>setImmediate(r));assert.deepEqual(p.calls,['prepareQuibiEstimateHistory'])});
test('normal confirmed CREATE still uses its original action',async()=>{const p=panel('prepared');(p.element.props.onSubmit as (e:unknown)=>void)({preventDefault(){},currentTarget:{},nativeEvent:{submitter:{getAttribute:()=> 'yes'}}});await new Promise(r=>setImmediate(r));assert.deepEqual(p.calls,['createQuibiDevEstimate'])});

test('temporary READ failure can be retried and does not refresh the case or dispatch',async()=>{const p=panel('uncertain',true);const submit=p.element.props.onSubmit as (e:unknown)=>void;const event={preventDefault(){},currentTarget:{},nativeEvent:{submitter:null}};submit(event);await new Promise(r=>setImmediate(r));submit(event);await new Promise(r=>setImmediate(r));assert.deepEqual(p.calls,['prepareQuibiEstimate','prepareQuibiEstimate']);assert.equal(p.refreshes(),0)});

test('explicit catalog choice stops additional history scans but keeps the preview form',async()=>{const p=panel('failed',false,true);function find(value:unknown):Element|undefined{if(Array.isArray(value)){for(const child of value){const found=find(child);if(found)return found}}else if(value&&typeof value==='object'&&'props' in value){const node=value as Element;if(node.props.name==='catalogSource')return node;return find(node.props.children)}}const select=find(p.element);assert.ok(select);(select.props.onChange as (e:unknown)=>void)({target:{value:'189:11'}});p.effects[0]();await new Promise(r=>setImmediate(r));assert.deepEqual(p.calls,[]);assert.equal(p.element.type,'form')});
