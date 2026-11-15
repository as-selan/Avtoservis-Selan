// Focused browser regression: real hydrated navigation components; synthetic state updates only.
// No DB, authentication, Quibi operation or customer message is performed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {chromium} from '@playwright/test';
import {compile} from '@tailwindcss/node';
const require=createRequire(import.meta.url),root=process.cwd();
const dir=path.join(root,'qa-visual','followup'),out=path.join(root,'docs','qa','selan-p0-2026-10-22','followup');
fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(dir,'loader.cjs'),`module.exports=function(source){return require('typescript').transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4}}).outputText}`);
fs.writeFileSync(path.join(dir,'entry.jsx'),`
import React from 'react';import {createRoot} from 'react-dom/client';
import {CaseWorkspace} from '@/components/dashboard/CaseWorkspace';
import {CaseOverview} from '@/components/dashboard/CaseOverview';
import {CaseJourney} from '@/components/dashboard/CaseJourney';
import {CaseWorkSummary} from '@/components/dashboard/CaseWorkSummary';
const states={new:['#podatki','new','verify_intake'],prepare:['#predracun','preparing_offer','prepare_offer'],review:['#pregled-predracuna','preparing_offer','review_estimate'],send:['#pregled-predracuna','preparing_offer','send_estimate'],approval:['#odobritev','awaiting_customer_approval','await_customer'],order:['#poslovni-nalog','awaiting_slot_selection','manual_external_handoff']};
function App(){const [snapshot,setSnapshot]=React.useState('new');React.useEffect(()=>{window.applySyntheticSnapshot=setSnapshot},[]);
const [href,status,stepKind]=states[snapshot];const input={status,stepKind,role:'owner',intakeComplete:true,identityReady:true,hosted:true,offerPrepared:snapshot!=='new',quoteReviewed:['send','approval','order'].includes(snapshot),customerApproved:snapshot==='order',dispatched:snapshot==='approval',hasWorkOrder:false,writeReady:false,sendReady:false};
if(location.search.includes('mechanic'))return <><h1>Moja naloga · sintetični prikaz</h1><CaseWorkSummary role="mechanic" work={{status:snapshot==='new'?'assigned':'work_completed',mechanicName:'QA mehanik',mechanicEmail:'qa@example.test',vehicle:{make:'QA',model:'Model',registration:'QA-001'},lastActivity:'2026-10-22T10:00:00Z',photoCount:1,noteCount:2,phase:{label:'Račun',next:'USTVARI POSLOVNI RAČUN'}}}/></>;
return <><header><h1 className="text-2xl font-semibold">Primer #QA-SIM-001</h1></header><CaseOverview customer="QA stranka · qa@example.test" vehicle="QA Model · QA-001" request="Pregled zavor in priprava predračuna." missing={[]}/><CaseJourney input={input} explanation="Sintetična sprememba prikaza; poslovno dejanje ni izvedeno."/><CaseWorkspace activeHref={href} progressKey={snapshot} sections={Object.entries(states).filter(([key])=>key!=='send').map(([key,[id]])=>({id:id.slice(1),title:key,content:<section id={id.slice(1)} className="rounded-xl border bg-white p-4"><h2>{key}</h2><label>QA vnos<input className="border" aria-label={'QA vnos '+key}/></label><button type="button">QA pregled</button></section>}))}/></>;
}createRoot(document.getElementById('root')).render(<App/>);
`);
const {webpack}=require('next/dist/compiled/webpack/webpack');
await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,entry:path.join(dir,'entry.jsx'),output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.jsx','.js'],alias:{'@':path.join(root,'src')}},module:{rules:[{test:/\.(tsx?|jsx)$/,use:path.join(dir,'loader.cjs')}]},optimization:{minimize:false}},(error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
const source=['CaseWorkspace','CaseOverview','CaseJourney','CaseWorkSummary'].map(n=>fs.readFileSync(path.join(root,'src/components/dashboard',n+'.tsx'),'utf8')).join('\n');
const compiler=await compile('@import "tailwindcss";',{base:root,onDependency:()=>{}});
const css=compiler.build(source.split(/[\s"'`{}]+/).concat(['max-w-5xl','mx-auto','p-4','space-y-5','bg-slate-50','text-2xl','font-semibold','border']));
const server=createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(dir,'bundle.js')));return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="sl"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'body{font-family:Arial,sans-serif}input{max-width:100%}body::after{content:"SINTETIČNI UI · brez poslovnih zapisov";position:fixed;bottom:4px;right:4px;background:white;padding:4px;font-size:10px}</style></head><body class="bg-slate-50"><main id="root" class="max-w-5xl mx-auto p-4 space-y-5"></main><script src="/bundle.js"></script></body></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,results=[];let browser;
try{browser=await chromium.launch({channel:'chrome',headless:true});for(const width of [1440,390,350]){
 const page=await browser.newPage({viewport:{width,height:900},locale:'sl-SI'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.locator('[data-case-primary]').waitFor();
 assert.match(await page.locator('[aria-label="Povzetek povpraševanja"]').innerText(),/QA stranka[\s\S]*QA Model[\s\S]*Pregled zavor/);
 const box=await page.locator('[data-case-primary]').boundingBox();assert.ok(box.y+box.height<900,'CTA visible with overview');
 await page.screenshot({path:path.join(out,'case-'+width+'.png')});
 await page.locator('[data-case-primary]').click();
 for(const [state,target] of [['prepare','predracun'],['review','pregled-predracuna'],['send','pregled-predracuna'],['approval','odobritev'],['order','poslovni-nalog']]){
  // An explicit synthetic read snapshot tests navigation after props change; no action is mocked as successful.
  await page.evaluate(state=>window.applySyntheticSnapshot(state),state);
  await page.waitForFunction(id=>document.activeElement?.id===id,target);
  assert.equal(new URL(page.url()).hash,'#'+target);
  assert.equal(await page.locator('[data-case-active]').getAttribute('data-case-active'),target);
 }
 // Background updates must not take focus from text being entered.
 await page.getByLabel('QA vnos order').fill('Ne prekini vnosa');
 await page.evaluate(()=>window.applySyntheticSnapshot('approval'));
 await page.waitForFunction(()=>document.querySelector('[data-case-active]')?.getAttribute('data-case-active')==='odobritev');
 assert.equal(await page.getByLabel('QA vnos order').inputValue(),'Ne prekini vnosa');
 assert.equal(await page.getByLabel('QA vnos order').evaluate(el=>el===document.activeElement),true);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.goto(origin+'/?mechanic');await page.getByText('Povzetek popravila').waitFor();
 assert.match(await page.locator('main').innerText(),/Začni delo/);assert.doesNotMatch(await page.locator('main').innerText(),/POSLOVNI RAČUN|Poslovna faza/);
 await page.screenshot({path:path.join(out,'mechanic-'+width+'.png')});
 await page.evaluate(()=>window.applySyntheticSnapshot('review'));await page.getByText(/Delo je predano vodji/).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 results.push({width,essentialContext:true,ctaVisible:true,refreshSteps:5,sameAnchorProgress:true,editingPreserved:true,mechanicRoleCopy:true,noOverflow:true,pageErrors:0});await page.close();
}fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({scope:'Hydrated real components with synthetic read snapshots. No application/backend E2E.',results},null,2));console.log(JSON.stringify(results));}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
