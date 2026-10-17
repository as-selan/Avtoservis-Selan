import test from 'node:test';import assert from 'node:assert/strict';
import {intakeQueue,filterIntakeQueue} from './intake-queue.ts';import type {ServiceOrderDemo} from './types';
const order=(id:string,status:ServiceOrderDemo['status'],extra:Partial<ServiceOrderDemo>={}):ServiceOrderDemo=>({id,serviceRequestId:id,customerName:'QA '+id,vehicleMakeModel:'TEST AUTO',registration:'QA 11',requestSummary:'Pregled',status,nextActionLabel:'Preveri podatke',updatedAt:'2026-10-17T10:00:00Z',updatedLabel:'danes',...extra});
test('one queue covers each open state once and excludes closed/unlinked display rows',()=>{
 const rows=intakeQueue([order('a','novo'),order('b','manjkajo_podatki'),order('c','caka_izbiro_termina'),order('d','caka_potrditev_ponudbe'),order('e','priprava_ponudbe'),order('f','zakljuceno'),order('g','novo',{serviceRequestId:undefined})]);
 assert.deepEqual(rows.map(r=>r.group),['new','data','slots','customer','service']);assert.equal(new Set(rows.map(r=>r.order.id)).size,5);assert.ok(rows.find(r=>r.group==='data')?.href.endsWith('#podatki'));
});
test('real slot progress determines the action, not just the new intake status',()=>{
 const rows=intakeQueue([order('a','novo',{inspectionRequested:true,slotOfferStatus:'proposed'}),order('b','novo',{inspectionRequested:true,slotOfferStatus:'offered'}),order('c','novo',{slotOfferStatus:'selected'}),order('d','novo',{requiresAttention:true,slotOfferStatus:'offered'})]);
 assert.equal(rows[0].group,'service');assert.equal(rows[1].group,'slots');assert.match(rows[2].label,/še ni rezerviran/);assert.equal(rows[3].group,'service');assert.equal(rows[3].label,'Preveri podatke');
});
test('filters and search preserve all-period queue and oldest-first ordering',()=>{
 const rows=intakeQueue([order('new','novo'),order('old','manjkajo_podatki',{updatedAt:'2025-01-01T00:00:00Z'})]);assert.equal(rows[0].order.id,'old');assert.equal(filterIntakeQueue(rows,'data','qa 11').length,1);assert.equal(filterIntakeQueue(rows,'all','missing').length,0);
});

test('expired offer requires service action, never waiting on the customer',()=>{
 const rows=intakeQueue([order('a','caka_izbiro_termina',{slotOfferStatus:'offered',slotOfferExpired:true})]);assert.equal(rows[0].group,'service');assert.match(rows[0].label,/potekli/);assert.ok(rows[0].href.endsWith('#termini'));
});

test('approved repair ready for Quibi work does not acquire an artificial appointment gate',()=>{
 const rows=intakeQueue([order('a','caka_izbiro_termina',{nextActionKind:'manual_external_handoff',nextActionLabel:'Nadaljuj s Quibi nalogom.'})]);assert.equal(rows[0].group,'service');assert.equal(rows[0].label,'Nadaljuj s Quibi nalogom.');
});
