import test from 'node:test';import assert from 'node:assert/strict';
import {intakeQueue,filterIntakeQueue} from './intake-queue.ts';import type {ServiceOrderDemo} from './types';
const order=(id:string,status:ServiceOrderDemo['status'],extra:Partial<ServiceOrderDemo>={}):ServiceOrderDemo=>({id,serviceRequestId:id,customerName:'QA '+id,vehicleMakeModel:'TEST AUTO',registration:'QA 11',requestSummary:'Pregled',status,nextActionLabel:'Preveri podatke',updatedAt:'2026-10-17T10:00:00Z',updatedLabel:'danes',...extra});
test('one queue covers each open state once and excludes closed/unlinked display rows',()=>{
 const rows=intakeQueue([order('a','novo'),order('b','manjkajo_podatki'),order('c','caka_izbiro_termina'),order('d','caka_potrditev_ponudbe'),order('e','priprava_ponudbe'),order('f','zakljuceno'),order('g','novo',{serviceRequestId:undefined})]);
 assert.deepEqual(rows.map(r=>r.group),['new','data','slots','customer','service']);assert.equal(new Set(rows.map(r=>r.order.id)).size,5);assert.ok(rows.find(r=>r.group==='data')?.href.endsWith('#podatki'));
});
test('real slot progress determines the action, not just the new intake status',()=>{
 const rows=intakeQueue([order('a','novo',{inspectionRequested:true,slotOfferStatus:'proposed'}),order('b','novo',{inspectionRequested:true,slotOfferStatus:'offered'}),order('c','novo',{slotOfferStatus:'selected'}),order('d','novo',{requiresAttention:true,slotOfferStatus:'offered'})]);
 const byId=new Map(rows.map(row=>[row.order.id,row]));
 assert.equal(byId.get('a')?.group,'service');assert.equal(byId.get('b')?.group,'slots');assert.match(byId.get('c')!.label,/še ni rezerviran/);assert.equal(byId.get('d')?.group,'service');assert.equal(byId.get('d')?.label,'Preveri podatke');
});
test('filters and search preserve all-period queue and newest-first ordering',()=>{
 const rows=intakeQueue([order('new','novo'),order('old','manjkajo_podatki',{updatedAt:'2025-01-01T00:00:00Z'})]);assert.equal(rows[0].order.id,'new');assert.equal(filterIntakeQueue(rows,'data','qa 11').length,1);assert.equal(filterIntakeQueue(rows,'all','missing').length,0);
});

test('expired offer requires service action, never waiting on the customer',()=>{
 const rows=intakeQueue([order('a','caka_izbiro_termina',{slotOfferStatus:'offered',slotOfferExpired:true})]);assert.equal(rows[0].group,'service');assert.match(rows[0].label,/potekli/);assert.ok(rows[0].href.endsWith('#termini'));
});

test('approved repair ready for Quibi work does not acquire an artificial appointment gate',()=>{
 const rows=intakeQueue([order('a','caka_izbiro_termina',{nextActionKind:'manual_external_handoff',nextActionLabel:'Nadaljuj s Quibi nalogom.'})]);assert.equal(rows[0].group,'service');assert.equal(rows[0].label,'Nadaljuj s Quibi nalogom.');
});

test('estimate review, sending and replies use the action section before broad status',()=>{
 for(const kind of ['review_estimate','revise_estimate','send_estimate']){
  const [row]=intakeQueue([order(kind,'caka_potrditev_ponudbe',{nextActionKind:kind})]);
  assert.equal(row.group,'estimate');assert.ok(row.href.endsWith('#pregled-predracuna'));
 }
 const [reply]=intakeQueue([order('reply','priprava_ponudbe',{nextActionKind:'await_customer'})]);
 assert.equal(reply.group,'customer');assert.ok(reply.href.endsWith('#odobritev'));
});

test('approved handoff and repair phases do not remain in customer waiting',()=>{
 const rows=intakeQueue([order('handoff','caka_potrditev_ponudbe',{nextActionKind:'manual_external_handoff'}),order('work','aktivno_popravilo'),order('review','potreben_pregled'),order('collect','pripravljeno_za_prevzem')]);
 assert.equal(rows.find(r=>r.order.id==='handoff')?.group,'service');
 for(const id of ['work','review','collect'])assert.ok(rows.find(r=>r.order.id===id)?.href.endsWith('#popravilo'));
 assert.equal(rows.find(r=>r.order.id==='work')?.group,'work');
 assert.equal(rows.find(r=>r.order.id==='review')?.group,'review');
 assert.equal(rows.find(r=>r.order.id==='collect')?.group,'review');
});

test('attention is first and stale slot proposals cannot override the repair action',()=>{
 const rows=intakeQueue([order('recent','novo',{updatedAt:'2026-10-19T10:00:00Z'}),order('blocked','priprava_ponudbe',{requiresAttention:true}),order('repair','potreben_pregled',{slotOfferStatus:'offered',slotOfferExpired:true})]);
 assert.equal(rows[0].order.id,'blocked');
 const repair=rows.find(r=>r.order.id==='repair')!;assert.equal(repair.group,'review');assert.ok(repair.href.endsWith('#popravilo'));assert.equal(repair.label,'Preveri podatke');
});

test('published-price review, send and customer response stay in the published-price section',()=>{
 for(const kind of ['review_estimate','send_estimate','await_customer']){
  const [row]=intakeQueue([order(kind,'priprava_ponudbe',{nextActionKind:kind,fixedPriceStatus:'prepared'})]);
  assert.ok(row.href.endsWith('#objavljena-cena'));
  assert.equal(row.group,kind==='await_customer'?'customer':'estimate');
 }
});
