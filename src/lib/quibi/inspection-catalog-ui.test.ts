import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import ts from 'typescript';import * as jsx from 'react/jsx-runtime';import {inspectionCatalogSuggestions} from './inspection-catalog.ts';
type Element={type:unknown;props:Record<string,unknown>};
function elements(node:unknown):Element[]{if(Array.isArray(node))return node.flatMap(elements);if(!node||typeof node!=='object'||!('props' in node))return [];const e=node as Element;return [e,...elements(e.props.children)];}
test('actual estimate form transfers inspected service IDs without copying prices or dispatching',()=>{
 const writes:unknown[]=[];const exports:Record<string,unknown>={};
 const imports:Record<string,unknown>={'react/jsx-runtime':jsx,'react':{useRef:(v:unknown)=>({current:v}),useState:(v:unknown)=>[v,(next:unknown)=>writes.push(next)],useEffect:()=>{},useTransition:()=>[false,()=>{throw Error('Unexpected action')} ]},'next/navigation':{useRouter:()=>({refresh:()=>{}})},'@/lib/quibi/inspection-catalog':{inspectionCatalogSuggestions},'@/lib/quibi/dev-write-actions':new Proxy({},{get:()=>()=>{throw Error('No external action allowed')}})};
 const code=ts.transpileModule(readFileSync(new URL('../../components/dashboard/QuibiDevWritePanel.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(code,{exports,require:(n:string)=>{assert.ok(n in imports,n);return imports[n];}});
 const render=exports.QuibiDevWritePanel as(p:Record<string,unknown>)=>unknown;
 const tree=render({serviceRequestId:'qa-case',mode:'prepare',inspectionFindings:'ZAV',catalogOptions:[{key:'189:1',code:'ZAV',name:'Pregled zavor'}],choices:{saleTypes:[{id:'1',label:'Prodaja'}],units:[{id:'1',label:'kos'}],vatRates:[{id:'1',label:'22 %'}]}});
 const button=elements(tree).find(e=>e.type==='button'&&e.props.children==='Pripravi postavke iz pregleda');assert.ok(button);(button.props.onClick as()=>void)();const rows=writes.find(Array.isArray);assert.equal(JSON.stringify(rows),JSON.stringify([{key:'189:1',quantity:'',discount:''}]));assert.ok(elements(tree).some(e=>e.props['aria-label']==='Podlaga opravljenega pregleda'));
});
