// Presentation QA: real components with synthetic inputs. Business actions, DB and Quibi are never executed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {createServer} from 'node:http';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {compile} from '@tailwindcss/node';
import {chromium} from '@playwright/test';
const root=process.cwd(),require=createRequire(import.meta.url),h=React.createElement;
const dir='docs/qa/selan-p0-2026-10-22';
fs.mkdirSync(dir,{recursive:true});
const cache=new Map();
const blockedActions=new Proxy({}, {get:()=>()=>{throw Error('Business actions are forbidden in presentation QA');}});
function SafeLink({href,children,...props}){return h('a',{...props,href},children);}
function transpile(file){return ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;}
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file);
 const exports={};cache.set(file,exports);
 vm.runInNewContext(transpile(file),{exports,require:id=>{
  if(id==='next/navigation')return {useRouter:()=>({refresh(){throw Error('Refresh is forbidden in presentation QA');}})};
  if(id==='next/link')return {default:SafeLink};
  if(id.includes('/actions')||id.includes('-actions')||id.includes('-action'))return blockedActions;
  if(id==='./CaseAnchorNavigation')return {CaseAnchorNavigation:()=>null};
  if(id.startsWith('@/'))return load(path.join(root,'src',id.slice(2)+(/\.[jt]sx?$/.test(id)?'':'.ts')));
  if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id+(/\.[jt]sx?$/.test(id)?'':'.ts')));
  return require(id);
 },Number,Intl,Date,FormData,process:{env:{}}});return exports;
}
const {caseJourney}=load('src/lib/cases/journey.ts');
const {CaseJourney}=load('src/components/dashboard/CaseJourney.tsx');
const {CaseWorkspace}=load('src/components/dashboard/CaseWorkspace.tsx');
const {ReviewIntakeButton}=load('src/components/dashboard/ReviewIntakeButton.tsx');
const {ReviewManualEstimate}=load('src/components/dashboard/ReviewManualEstimate.tsx');
const {ManualEstimateHandoff}=load('src/components/dashboard/ManualEstimateHandoff.tsx');
const {QuibiEstimateWorkflowPanel}=load('src/components/dashboard/QuibiEstimateWorkflowPanel.tsx');
const {QuibiDevWritePanel}=load('src/components/dashboard/QuibiDevWritePanel.tsx');
const {QuibiBusinessDocumentForm}=load('src/components/dashboard/QuibiBusinessDocumentForm.tsx');
const base={status:'new',role:'owner',stepKind:'verify_intake',intakeComplete:true,identityReady:true,hosted:true,offerPrepared:false,quoteReviewed:false,customerApproved:false,dispatched:false,hasWorkOrder:false,writeReady:false,sendReady:false};
const cases={new:base,identity:{...base,identityReady:false},missing:{...base,intakeComplete:false},reception:{...base,role:'reception'},prepare:{...base,status:'preparing_offer',stepKind:'manual_quibi_estimate',offerPrepared:true},review:{...base,status:'preparing_offer',stepKind:'review_estimate',offerPrepared:true},send:{...base,status:'preparing_offer',stepKind:'send_estimate',quoteReviewed:true},approval:{...base,status:'awaiting_customer_approval',stepKind:'await_customer',quoteReviewed:true,dispatched:true},order:{...base,status:'awaiting_slot_selection',stepKind:'manual_external_handoff',quoteReviewed:true,customerApproved:true},sendFailed:{...base,status:'awaiting_customer_approval',stepKind:'await_customer',quoteReviewed:true,sendAttempted:true,sendState:'failed'},sendQueued:{...base,status:'awaiting_customer_approval',stepKind:'await_customer',quoteReviewed:true,sendAttempted:true,sendState:'queued'},revision:{...base,status:'preparing_offer',stepKind:'revise_estimate',offerPrepared:true},repair:{...base,status:'converted',stepKind:'manual_external_handoff',hasWorkOrder:true},uncertain:{...base,status:'preparing_offer',stepKind:'review_quibi_mismatch'}};
const catalog={key:'qa:service',articleId:'qa-service',priceListId:'qa',name:'QA servis vozila',code:'QA-SERVICE',priceListName:'Sintetični cenik',unitId:'1',unitLabel:'kos',vatId:'1',vatLabel:'22 %',grossPrice:122,discount:0,priceListNetPrice:'100',priceListDiscount:0,priceListDiffers:false,sourceSha:'a'.repeat(64)};
const lines=[{description:'QA servis vozila',quantity:'1',grossPrice:'122',unitGrossPrice:'122',pricingVerified:true}];
const panel=(id,title,content)=>h('section',{id,tabIndex:-1,className:'scroll-mt-20 rounded-xl border bg-white p-4 space-y-3'},h('h2',{className:'font-semibold'},title),content);
const locked=content=>h('fieldset',{disabled:true,className:'min-w-0 space-y-3'},content);
function sections(input){return [
 {id:'podatki',title:'Povpraševanje, stranka in vozilo',content:panel('podatki','Preverite podatke primera',h(React.Fragment,null,h('p',null,'QA stranka · qa@example.test'),h('p',null,'Testni avto · QA MODEL · LJ QA001'),h('p',null,'Želena storitev: QA servis vozila'),input.role==='reception'?h('p',null,'Sprejem potrdi lastnik ali skrbnik.'):locked(h(ReviewIntakeButton,{serviceRequestId:'qa-case'}))))},
 {id:'quibi-povezava',title:'Povezava s Quibijem',content:panel('quibi-povezava','Povezava s Quibijem',h('p',null,'Sintetični prikaz: primerjajte stranko, VIN in pravo vozilo. Povezava v tem prikazu ni preverjena.'))},
 {id:'predracun',title:'Priprava predračuna',content:panel('predracun','Priprava predračuna iz Quibijevih podatkov',locked(h(QuibiDevWritePanel,{serviceRequestId:'qa-case',mode:'prepare',writeEnabled:false,catalogOptions:[catalog],initialCatalogSource:catalog.key,aiEstimateLines:[{key:catalog.key,quantity:1}],lineDescription:'QA servis vozila',choices:{saleTypes:[{id:'1',label:'QA prodaja'}],units:[{id:'1',label:'kos'}],vatRates:[{id:'1',label:'22 %'}]}})))},
 {id:'pregled-predracuna',title:'Pregled in pošiljanje predračuna',content:panel('pregled-predracuna','Pregled predračuna',locked(h(React.Fragment,null,input.stepKind==='revise_estimate'?h(QuibiDevWritePanel,{serviceRequestId:'qa-case',mode:'update',quoteId:'qa-quote',writeEnabled:false}):!input.quoteReviewed&&h(ReviewManualEstimate,{quoteId:'qa-quote'}),input.stepKind!=='revise_estimate'&&h(QuibiEstimateWorkflowPanel,{serviceRequestId:'qa-case',quoteId:'qa-quote',documentId:'QA-SIM-001',reviewStatus:input.quoteReviewed?'approved_for_send':'unreviewed',sha256:'a'.repeat(64),amount:'122',lines,recipient:'qa@example.test',dev:true,sendEnabled:false,manualIdentityRequired:false,alreadyDelivered:false}))))},
 {id:'odobritev',title:'Odločitev stranke',content:panel('odobritev','Odobritev popravila',locked(h(ManualEstimateHandoff,{quoteId:'qa-quote',delivered:false,decision:null,syntheticQa:true})))},
 {id:'poslovni-nalog',title:'Delovni nalog',content:panel('poslovni-nalog','Delovni nalog iz odobrenega predračuna',locked(h(QuibiBusinessDocumentForm,{orderId:'qa-case',caseId:'qa-case',customerId:'qa-customer',status:'open',syntheticQa:true,writeEnabled:false,choices:{numberings:[{id:'1',label:'Delovni nalog'}],saleTypes:[{id:'1',label:'QA prodaja'}],units:[{id:'1',label:'kos'}],vat:[{id:'1',label:'22 %'}]},references:[]})))},
 {id:'popravilo',title:'Popravilo in zaključek',content:panel('popravilo','Popravilo in zaključek',h('p',null,'Nalog v tem izoliranem prikazu ni ustvarjen. Napredek popravila in račun se tukaj ne simulirata.'))},
 ];}
const files=['src/components/dashboard/CaseJourney.tsx','src/components/dashboard/CaseWorkspace.tsx','src/components/dashboard/ReviewIntakeButton.tsx','src/components/dashboard/ReviewManualEstimate.tsx','src/components/dashboard/ManualEstimateHandoff.tsx','src/components/dashboard/QuibiEstimateWorkflowPanel.tsx','src/components/dashboard/QuibiDevWritePanel.tsx','src/components/dashboard/QuibiBusinessDocumentForm.tsx'];
const source=files.map(file=>fs.readFileSync(file,'utf8')).join('\n');
const compiler=await compile('@import "tailwindcss";',{base:root,onDependency:()=>{}});
const css=compiler.build(source.split(/[\s"'`{}]+/).concat(['max-w-5xl','mx-auto','p-4','bg-slate-50','min-h-screen','mb-3','text-sm','mt-8','rounded-xl','border','bg-white','font-semibold','text-2xl','space-y-5']));
const navigation=transpile('src/lib/cases/navigation.ts');
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 if(url.pathname!=='/'){res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});res.end('<html lang="sl"><body><p>Izolirani UX predogled: podrobnosti Quibi dokumentov in poslovna dejanja so na voljo samo v prijavljeni aplikaciji.</p><a href="/">Nazaj na sintetični prikaz</a></body></html>');return;}
 const scenario=url.searchParams.get('case')??'new',input=cases[scenario]??base;
 const html=renderToStaticMarkup(h(React.Fragment,null,h(CaseJourney,{input,explanation:'Poslovna dejanja v tem prikazu niso izvedena.'}),h(CaseWorkspace,{activeHref:caseJourney(input).action.href,sections:sections(input)})));
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!DOCTYPE html><html lang="sl"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Izolirani prikaz vodenja primera</title><style>${css}body{font-family:Arial,sans-serif}body::after{content:'SINTETIČNI UI · brez poslovnih zapisov';position:fixed;bottom:6px;right:6px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;font-size:10px;color:#334155;pointer-events:none;z-index:10}:target{outline:3px solid #2563eb;outline-offset:4px}select,input,textarea{max-width:100%}</style></head><body class="bg-slate-50"><main class="max-w-5xl mx-auto p-4 space-y-5"><p class="mb-3 text-sm">IZOLIRANI UI PREIZKUS · sintetični podatki · poslovna dejanja onemogočena · brez baze in Quibija</p><header><h1 class="text-2xl font-semibold">Primer #QA-SIM-001</h1><p>QA servis sintetičnega vozila</p></header>${html}</main><script>(()=>{const exports={};${navigation};exports.installCaseNavigation();})();</script></body></html>`);
});
await new Promise(resolve=>server.listen(process.argv.includes('--serve')?47866:0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
if(process.argv.includes('--serve')){console.log('Isolated synthetic UX preview: '+origin+' (business actions disabled)');await new Promise(resolve=>process.once('SIGINT',resolve));await new Promise(resolve=>server.close(resolve));process.exit(0);}
let browser;const report=[];
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const width of [1440,390,350]){
  const context=await browser.newContext({viewport:{width,height:900},locale:'sl-SI',timezoneId:'Europe/Ljubljana'}),page=await context.newPage();
  for(const scenario of Object.keys(cases)){
   const errors=[];const captureError=e=>errors.push(e.message);page.on('pageerror',captureError);
   await page.goto(origin+'/?case='+scenario);
   const action=page.locator('[data-case-primary]');assert.equal(await action.count(),1);
   const box=await action.boundingBox();assert.ok(box&&box.y+box.height<=900&&box.x>=0&&box.x+box.width<=width,`${width}/${scenario}: CTA above fold`);
   assert.equal(await page.locator('[aria-label="Faze postopka"] li').count(),7);
   assert.equal(await page.locator('[aria-current="step"]').count(),1);
   const href=await action.getAttribute('href');assert.equal(await page.locator('[data-case-active]').getAttribute('data-case-active'),href.slice(1));
   for(const {id} of sections(cases[scenario]))assert.equal(await page.locator('#'+id).count(),1,`${id} not duplicated`);
   const dimensions=()=>page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
   let dims=await dimensions();assert.ok(dims.scroll<=dims.width+1,`${width}/${scenario}: initial overflow`);
   if(['new','identity','prepare','approval','order','send'].includes(scenario))await page.screenshot({path:`${dir}/${scenario}-${width}.png`});
   await action.focus();await page.keyboard.press('Enter');assert.equal(new URL(page.url()).hash,href);
   const target=page.locator(href);await target.waitFor({state:'visible'});assert.equal(await page.evaluate(()=>document.activeElement?.id),href.slice(1));
   if(['new','prepare','review','approval','order','send'].includes(scenario))await page.screenshot({path:`${dir}/${scenario}-form-${width}.png`});
   dims=await dimensions();assert.ok(dims.scroll<=dims.width+1,`${width}/${scenario}: form overflow`);
   const secondary=href==='#podatki'?'#predracun':'#podatki';
   await page.goto(origin+'/?case='+scenario+secondary);await page.locator(secondary).waitFor({state:'visible'});
   assert.equal(await page.locator(secondary).evaluate(el=>el.closest('details')?.open),true);
   assert.equal(await page.evaluate(()=>document.activeElement?.id),secondary.slice(1));
   assert.deepEqual(errors,[]);page.off('pageerror',captureError);
   report.push({width,scenario,cta:await action.innerText(),target:href,activeFormFirst:true,singleFormCopies:true,keyboardFocus:true,bookmarkedSectionRevealed:true,pass:true});
  }
  await context.close();
 }
 if(process.argv.includes('--video')){
  const context=await browser.newContext({viewport:{width:390,height:900},recordVideo:{dir:'qa-visual/ux-video',size:{width:390,height:900}}});
  const page=await context.newPage(),video=page.video();
  for(const scenario of ['new','prepare','review','order']){await page.goto(origin+'/?case='+scenario);await page.waitForTimeout(900);await page.locator('[data-case-primary]').click();await page.waitForTimeout(900);}
  await context.close();await video.saveAs(dir+'/ui-navigation.webm');
 }
 fs.writeFileSync(`${dir}/browser-results.json`,JSON.stringify({scope:'Real CaseJourney, CaseWorkspace, native section navigation and real initial form components with synthetic inputs; SSR only, business form actions intentionally disabled; no DB/Quibi/full E2E',checks:report},null,2));
 console.log(`${report.length} UI scenarios passed at 1440/390/350 px; active form first, no duplicate forms, CTA visible, keyboard focus, bookmark expansion, no overflow.`);
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
