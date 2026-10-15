import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import {createHash} from 'node:crypto';import ts from 'typescript';
import {catalogDocumentLine} from './estimate-catalog.ts';import {customerCatalogPricing} from './customer-catalog-pricing.ts';
const exported:Record<string,unknown>={};
runInNewContext(ts.transpileModule(readFileSync(new URL('./estimate-catalog-source.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exported,require:(name:string)=>({'server-only':{},'node:crypto':{createHash},'./estimate-catalog':{catalogDocumentLine},'./customer-catalog-pricing':{customerCatalogPricing}}[name]),FormData,Map,JSON,Number,Error});
const estimateCatalogRows=exported.estimateCatalogRows as typeof import('./estimate-catalog-source.ts').estimateCatalogRows;
import {estimatePreparationPayload,estimateReviewTotal} from './estimate-preparation.ts';
import type {QuibiArticle} from './pricing-read.ts';
const articles:QuibiArticle[]=[
 {id:'11',code:'WORK',name:'Delo mehanika',netPrice:'100',unitId:'2',unitLabel:'ura',vatId:'5',vatLabel:'22 %',stockManaged:false},
 {id:'12',code:'PART',name:'Rezervni del',netPrice:'50',unitId:'1',unitLabel:'kos',vatId:'5',vatLabel:'22 %',stockManaged:true},
 {id:'13',code:'MATERIAL',name:'Material',netPrice:'0.335',unitId:'1',unitLabel:'kos',vatId:'2',vatLabel:'9,5 %',stockManaged:false},
];
const list={id:'189',name:'Cenik',lines:articles.map(a=>({articleId:a.id,netPrice:a.netPrice,discount:'0'}))};
const catalogs={numberings:[{id:'2061',label:'Predračun'}],saleTypes:[{id:'1',label:'Dobava'}],units:[{id:'1',label:'kos'},{id:'2',label:'ura'}],vatRates:[{id:'5',label:'22 %'},{id:'2',label:'9,5 %'}]};
const draft=[{key:'189:11',quantity:'1.5',discount:'5'},{key:'189:12',quantity:'2',discount:'10'},{key:'189:13',quantity:'3',discount:''}];
const form=(rows:unknown)=>{const f=new FormData();f.set('catalogLines',JSON.stringify(rows));return f};
function reader(rows=articles,priceList=list){const events:string[]=[];return {events,priceLists:async()=>{events.push('lists');return [priceList]},article:async(id:string)=>{events.push(id);return rows.find(a=>a.id===id)!}}}
const input={serviceRequestId:'00000000-0000-4000-8000-000000000001',customerId:'7',vehicleId:'8',saleTypeId:'1'};
test('three service/part/material lines are freshly resolved once each and preserve quantity, VAT and discount',async()=>{
 const read=reader(),r=(await estimateCatalogRows(form(draft),read,catalogs,{priceListId:null}))!;
 assert.deepEqual(read.events,['lists','11','12','13']);assert.equal(r.lines.length,3);assert.deepEqual(r.lines[1],{sifra:'PART',kolicina:2,popust:10,ddv_id:'5'});
 const p=estimatePreparationPayload({...input,lines:r.lines},catalogs,r.reviewedLines);
 assert.equal(p.review.total,284.75);assert.equal(p.review.lines[0].unit,'ura');assert.equal(Object.keys(p.body.Postavkedokumenta).length,3);
});
test('assigned price list is honored and unverifiable stock price override requires review',async()=>{
 const custom={...list,lines:list.lines.map(l=>({...l,netPrice:l.articleId==='11'?'80':l.netPrice,discount:l.articleId==='11'?'5':'0'}))};
 const r=(await estimateCatalogRows(form([{key:'189:11',quantity:2}]),reader(articles,custom),catalogs,{priceListId:'189'}))!;
 assert.equal(r.reviewedLines[0].unitPrice,97.6);assert.equal(r.reviewedLines[0].discount,5);assert.equal(estimateReviewTotal(r.reviewedLines),185.44);
 await assert.rejects(estimateCatalogRows(form(draft),reader(articles,{...custom,lines:custom.lines.map(l=>l.articleId==='12'?{...l,netPrice:'40'}:l)}),catalogs,{priceListId:'189'}),/PRICING_UNVERIFIED/);
 await assert.rejects(estimateCatalogRows(form(draft),reader(),catalogs,{}),/PRICING_UNVERIFIED/);
});
test('add/remove/edit/discount/current price changes invalidate the approved source and payload hashes',async()=>{
 const prepare=async(rows:unknown,read=reader())=>{const r=(await estimateCatalogRows(form(rows),read,catalogs,{priceListId:null}))!;return {...r,...estimatePreparationPayload({...input,lines:r.lines},catalogs,r.reviewedLines)}};
 const baseline=await prepare(draft);
 for(const rows of [draft.slice(0,2),[...draft,{key:'189:11',quantity:1,discount:0}],draft.map((r,i)=>i? r:{...r,quantity:2}),draft.map((r,i)=>i? r:{...r,discount:10})]){const p=await prepare(rows);assert.notEqual(p.sourceSha,baseline.sourceSha);assert.notEqual(p.sha256,baseline.sha256)}
 const changed=await prepare(draft,reader(articles.map(a=>a.id==='11'?{...a,netPrice:'101'}:a)));assert.notEqual(changed.sha256,baseline.sha256);assert.notEqual(changed.sourceSha,baseline.sourceSha);
});
test('round each line in cents and sum cents; reject malformed/over-limit drafts and unknown VAT',async()=>{
 assert.equal(estimateReviewTotal([1,2,3].map(()=>({description:'fraction',quantity:1,unit:'kos',vat:'0 %',unitPrice:.105,discount:0}))),.33);
 for(const rows of [[],Array(101).fill(draft[0]),[{key:'bad',quantity:1}],[{...draft[0],quantity:0}],[{...draft[0],discount:101}],[{...draft[0],discount:false}]])await assert.rejects(estimateCatalogRows(form(rows),reader(),catalogs,{priceListId:null}));
 await assert.rejects(estimateCatalogRows(form(draft),reader(),{...catalogs,vatRates:[]},{priceListId:null}),/REFERENCE_CHANGED/);
});
test('repeated article rows reuse one READ without merging separately reviewed discounts',async()=>{const r=reader();const result=(await estimateCatalogRows(form([draft[0],{...draft[0],discount:'10'}]),r,catalogs,{priceListId:null}))!;assert.deepEqual(r.events,['lists','11']);assert.deepEqual(Array.from(result.reviewedLines,l=>l.discount),[5,10])});

import {createAndVerifyEstimate,type Operation,type OperationJournal} from './write-workflow.ts';
import {businessSourceLines} from './business-source-lines.ts';
import {businessDocumentBody,createBusinessDocument,confirmBusinessContent,assertBusinessStage} from './business-document-workflow.ts';
import {hasRecordedCustomerApproval} from './business-form-state.ts';
import {sendBusinessDocument} from './business-send-workflow.ts';
import {createQuibiWorkflowWriteClient} from './write-http.ts';
import {workflowRecipient} from './workflow-config.ts';
import type {EstimateBody} from './write-contract.ts';import type {QuibiEstimateDetail} from './contracts.ts';
test('one isolated real-logic flow: multi-line preview → estimate → explicit QA approval → work order → completed repair → invoice → simulated production SEND protocol',async()=>{
 const resolved=(await estimateCatalogRows(form(draft),reader(),catalogs,{priceListId:null}))!;
 const preparation=estimatePreparationPayload({...input,lines:resolved.lines},catalogs,resolved.reviewedLines);
 const records=new Map<string,Operation>(),documents=new Map<string,QuibiEstimateDetail>();let dispatches=0;
 const journal:OperationJournal={get:async(kind,id)=>records.get(kind+':'+id)??null,insertOnce:async n=>{const key=n.kind+':'+n.localEntityId;if(!records.has(key))records.set(key,{...n,id:key,state:'prepared',quibiId:null,quibiContentSha256:null,documentNumber:null,sendId:null,sendStatus:null});return records.get(key)!},claim:async(id,state)=>{const row=records.get(id);if(row?.state!==state)return false;records.set(id,{...row,state:'dispatching'});return true},patch:async(id,state,patch)=>{const row=records.get(id);if(!row||row.state!==state)throw Error('CONCURRENT');const next={...row,...patch};records.set(id,next);return next}};
 const create=async(body:EstimateBody)=>{dispatches++;const id=String(5000+documents.size),number='QA-'+id;
 const reviewed=Object.values(body.Postavkedokumenta).map(line=>{if(!('sifra' in line))throw Error('FIXTURE_EXPECTED_ARTICLE');const a=articles.find(a=>a.code===line.sifra)!;return {description:line.opis??a.name,quantity:line.kolicina,unit:a.unitLabel,vat:a.vatLabel,unitPrice:Number(line.cena??a.netPrice)*(1+Number(a.vatLabel.replace(',','.').replace('%',''))/100),discount:line.popust??0}});
 documents.set(id,{id,number,customerId:input.customerId,vehicleId:input.vehicleId,externalId:body.Glavadokumenta.external_id,numberingId:String(body.Glavadokumenta.stevilcenje_id),amount:estimateReviewTotal(reviewed).toFixed(2),status:'',contentSha256:createHash('sha256').update(JSON.stringify(body)).digest('hex'),lines:Object.values(body.Postavkedokumenta).map((line,i)=>{if(!('sifra' in line))throw Error('FIXTURE_EXPECTED_ARTICLE');const a=articles.find(a=>a.code===line.sifra)!;return {articleId:a.id,articleCode:a.code,description:reviewed[i].description,quantity:String(line.kolicina),grossPrice:String(reviewed[i].unitPrice),unitNetPrice:String(line.cena??a.netPrice),unitId:a.unitId,vatId:a.vatId,discount:String(line.popust??0),pricingVerified:true}})});return {id,number}};
 const listed=async()=>[...documents.values()].map(d=>({id:d.id}));const detail=async(id:string)=>documents.get(id)!;
 const read={estimates:listed,workOrders:listed,invoices:listed,estimateDetail:detail,documentDetail:detail,documentPdf:async()=>new TextEncoder().encode('%PDF-fixture')};
 const write={createEstimate:create,getNumberings:async()=>[{Stevilcenje:{id:'2061',naziv:'Predračun',glava_id:'2'}}],updateEstimate:async()=>{throw Error('NOT_EXPECTED')},sendDocument:async()=>{throw Error('NOT_EXPECTED')},getSendStatus:async()=>({status:'queued' as const})};
 const estimate=await createAndVerifyEstimate({journal,read,write,input:{...input,lines:resolved.lines},expectedRequestSha256:preparation.sha256,verifyContent:(doc,body)=>confirmBusinessContent(doc as QuibiEstimateDetail,body,resolved.unitNetPrices,resolved.unitIds)});
 assert.equal(estimate.state,'verified');const source=documents.get(estimate.quibiId!)!;
 const approval={customer_decision:'approved',decided_at:'2026-10-15T12:00:00Z',decision_evidence_reference:'QA-SIM isolated customer decision',revoked_at:null,content_sha256:source.contentSha256};assert.equal(hasRecordedCustomerApproval(approval,source.contentSha256),true);assert.equal(hasRecordedCustomerApproval({...approval,customer_decision:'rejected'},source.contentSha256),false);
 const make=async(kind:'work_order'|'invoice',doc:QuibiEstimateDetail)=>{const lines=businessSourceLines(doc,catalogs.units,catalogs.vatRates,articles);const body=businessDocumentBody(kind,input.serviceRequestId,{...input,numberingId:kind==='work_order'?'6483':'801',lines},kind==='invoice'?'2026-10-15':undefined);return createBusinessDocument({kind,orderId:input.serviceRequestId,caseId:input.serviceRequestId,body,expectedAmount:doc.amount,expectedUnitNetPrices:resolved.unitNetPrices,expectedUnitIds:resolved.unitIds,journal,read,write})};
 const order=await make('work_order',source);assert.equal(order.state,'verified');assert.throws(()=>assertBusinessStage('invoice','in_progress'));assert.doesNotThrow(()=>assertBusinessStage('invoice','ready_for_collection'));
 const invoice=await make('invoice',documents.get(order.quibiId!)!);assert.equal(invoice.state,'verified');assert.equal(documents.get(invoice.quibiId!)!.amount,'284.75');assert.equal(dispatches,3);await make('invoice',documents.get(order.quibiId!)!);assert.equal(dispatches,3);
 const env={APP_ENV:'production',QUIBI_MODE:'production',VERCEL_ENV:'production',SELAN_PRODUCTION_SUPABASE_PROJECT_REF:'fixture-prod',SELAN_DEV_SUPABASE_PROJECT_REF:'fixture-dev',NEXT_PUBLIC_SUPABASE_URL:'https://fixture-prod.supabase.co',QUIBI_PRODUCTION_READ_ENABLED:'1',QUIBI_PRODUCTION_WRITE_ENABLED:'1',QUIBI_PRODUCTION_SEND_ENABLED:'1',QUIBI_PRODUCTION_USERNAME:'fixture',QUIBI_PRODUCTION_PASSWORD:'fixture'};
 const protocol:string[]=[];const transport=createQuibiWorkflowWriteClient({username:'fixture',password:'fixture',environment:env,fetcher:async(url,init)=>{protocol.push(new URL(String(url)).pathname);if(init?.body)assert.equal(JSON.parse(String(init.body)).email,'customer@fixture.mail');return new Response(JSON.stringify({error:false,data:String(url).includes('send_status')?{status:'sent'}:{send_id:'fixture-send',status:'queued'}}))}});
 const recipient=workflowRecipient(env,'customer@fixture.mail','customer@fixture.mail');const args={caseId:input.serviceRequestId,documentId:invoice.quibiId!,sha:invoice.quibiContentSha256!,amount:'284.75',recipient,journal,write:transport};
 const sent=await sendBusinessDocument(args);assert.equal(sent.sendStatus,'queued');await sendBusinessDocument(args);assert.equal(protocol.length,1);assert.equal((await transport.getSendStatus(invoice.quibiId!,sent.sendId!)).status,'sent');assert.deepEqual(protocol,['/api2/glavadokumenta/send/'+invoice.quibiId,'/api2/glavadokumenta/send_status/'+invoice.quibiId]);
});
