import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import ts from 'typescript';
test('expanded history loads on mount without a click; toggle never duplicates the pending READ',async()=>{
 for(const expanded of [true,false]){
  const calls:unknown[]=[],effects:(()=>void)[]=[],pending:Promise<unknown>[]=[];const jsx=(type:unknown,props:Record<string,unknown>)=>({type,props});
  const imports:Record<string,unknown>={'react':{useState:(v:unknown)=>[v,()=>{}],useRef:(v:unknown)=>({current:v}),useCallback:(fn:unknown)=>fn,useEffect:(fn:()=>void)=>effects.push(fn),useTransition:()=>[false,(fn:()=>Promise<unknown>)=>pending.push(fn())]},'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'link',__esModule:true},'next/image':{default:'image',__esModule:true},'@/lib/customers/vehicle-history-action':{loadVehicleHistory:async(scope:unknown,offset:number,part:string)=>{calls.push({scope,offset,part});return {cases:[],documents:[],next:null,unavailable:false};}}};
  const exports:Record<string,unknown>={};runInNewContext(ts.transpileModule(readFileSync(new URL('./VehicleHistory.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:(id:string)=>{assert.ok(id in imports,id);return imports[id];},Map});
  const scope={caseId:'c066482d-0002-43c4-9090-b23833928f71',includeCurrent:true};const tree=(exports.VehicleHistory as (props:unknown)=>{props:{onToggle:(event:unknown)=>void}})({scope,expanded});effects.forEach(fn=>fn());assert.equal(calls.length,expanded?1:0);tree.props.onToggle({currentTarget:{open:true}});tree.props.onToggle({currentTarget:{open:true}});await Promise.all(pending);assert.equal(calls.length,2);assert.deepEqual(calls[0],{scope,offset:0,part:'local'});assert.deepEqual(calls[1],{scope,offset:0,part:'remote'});
 }
});

 test('local visits are rendered before a slow Quibi response',async()=>{
  const updates:unknown[]=[],effects:(()=>void)[]=[],pending:Promise<unknown>[]=[];let release!:(v:unknown)=>void;
  const remote=new Promise(resolve=>{release=resolve;});const local={cases:[{id:'visit'}],documents:[],next:null,unavailable:false};
  const jsx=(type:unknown,props:unknown)=>({type,props});
  const imports:Record<string,unknown>={'react':{useState:(v:unknown)=>[v,(next:unknown)=>updates.push(next)],useRef:(v:unknown)=>({current:v}),useCallback:(fn:unknown)=>fn,useEffect:(fn:()=>void)=>effects.push(fn),useTransition:()=>[false,(fn:()=>Promise<unknown>)=>pending.push(fn())]},'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'link',__esModule:true},'next/image':{default:'image',__esModule:true},'@/lib/customers/vehicle-history-action':{loadVehicleHistory:async(_scope:unknown,_offset:number,part:string)=>part==='local'?local:remote}};
  const exports:Record<string,unknown>={};runInNewContext(ts.transpileModule(readFileSync(new URL('./VehicleHistory.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:(id:string)=>imports[id],Map});
  (exports.VehicleHistory as (props:unknown)=>unknown)({scope:{caseId:'c066482d-0002-43c4-9090-b23833928f71'},expanded:true});effects.forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));assert.ok(updates.includes(local));
  release({cases:[],documents:[],next:null,unavailable:false});await Promise.all(pending);
 });
