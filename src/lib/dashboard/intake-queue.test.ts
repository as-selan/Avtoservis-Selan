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

import {dashboardQueue,filterDashboardQueue,DASHBOARD_GROUPS} from './intake-queue.ts';
test('seven dashboard groups include every case once while preserving action routing',()=>{
 const orders=[order('new','novo'),order('data','manjkajo_podatki'),order('estimate','priprava_ponudbe',{nextActionKind:'review_estimate'}),order('customer','caka_potrditev_ponudbe'),order('scheduled','termin_potrjen'),order('repair','aktivno_popravilo'),order('review','potreben_pregled'),order('done','zakljuceno')];
 const rows=dashboardQueue(orders);
 assert.equal(DASHBOARD_GROUPS.length,7);assert.equal(rows.length,orders.length);assert.equal(new Set(rows.map(r=>r.order.id)).size,orders.length);
 const groups=Object.fromEntries(rows.map(r=>[r.order.id,r.group]));
 assert.deepEqual(groups,{new:'new',data:'decision',estimate:'decision',customer:'decision',scheduled:'work',repair:'work',review:'work',done:'done'});
 for(const original of intakeQueue(orders)){const row=rows.find(r=>r.order.id===original.order.id)!;assert.equal(row.href,original.href);assert.equal(row.label,original.label);}
 assert.equal(filterDashboardQueue(rows,'done','QA 11').length,1);assert.equal(filterDashboardQueue(rows,'done','missing').length,0);
});
test('dashboard attention and mismatches stay visible as decisions even after booking',()=>{
 const rows=dashboardQueue([order('attention','termin_potrjen',{requiresAttention:true}),order('mismatch','aktivno_popravilo',{nextActionKind:'review_quibi_mismatch'}),order('unlinked','zakljuceno',{serviceRequestId:undefined})]);
 assert.deepEqual(rows.map(r=>r.group),['decision','decision']);assert.equal(rows.length,2);
});


import {isSyntheticOrder,shortNextAction} from './intake-queue.ts';
test('only explicit QA-SIM/TEST markers leave normal daily work; data stays accessible',()=>{
 for(const patch of [{customerName:'TEST-AUTOSERVIS-SELAN-1'},{requestSummary:'QA-SIM-PR19'},{synthetic:true}])assert.equal(isSyntheticOrder(order('x','novo',patch)),true);
 for(const customerName of ['QA Novak','Testar Janez','Atest d.o.o.'])assert.equal(isSyntheticOrder(order('x','novo',{customerName})),false);
 const rows=dashboardQueue([order('x','priprava_ponudbe',{nextActionKind:'review_estimate'})]);assert.equal(shortNextAction(rows[0]),'Preglej predračun');
});

test('one case remains one row even when a snapshot contains an older duplicate',()=>{const rows=dashboardQueue([order('same','novo'),order('same','novo'),order('done','zakljuceno'),order('done','zakljuceno')]);assert.deepEqual(rows.map(r=>r.order.serviceRequestId),['same','done']);});

test('verified repair phases split manager review, invoice and handover without duplicating cases',()=>{
 const rows=dashboardQueue([order('a','potreben_pregled',{repairPhase:'review_required'}),order('b','potreben_pregled',{repairPhase:'invoice_review'}),order('c','pripravljeno_za_prevzem',{repairPhase:'handover'})]);
 assert.deepEqual(rows.map(r=>r.group),['review','invoice','handover']);assert.ok(rows[1].href.endsWith('#poslovni-nalog'));assert.match(shortNextAction(rows[1]),/račun/);
});

import {dashboardStatusLabel} from './intake-queue.ts';
test('invoice phase does not inherit an obsolete manager-review badge',()=>{assert.equal(dashboardStatusLabel(order('invoice','potreben_pregled',{repairPhase:'invoice_review'})),'Priprava računa');});

import {matchesDashboardSearch} from './intake-queue.ts';
test('search matches short/full reference, Quibi order, customer and registration including isolated TEST rows',()=>{
 const row=order('A73DB6BE','potreben_pregled',{serviceRequestId:'a73db6be-7216-4677-bc0a-26e97693ad75',quibiWorkOrderId:'2176933',customerName:'TEST SELAN SPLET 24-10',registration:'TEST-2026'});
 for(const query of ['A73DB6BE','a73db6be-7216-4677-bc0a-26e97693ad75','#2176933','Quibi #2176933','TEST SELAN','TEST-2026'])assert.equal(matchesDashboardSearch(row,query),true);
 assert.equal(isSyntheticOrder(row),true);assert.equal(matchesDashboardSearch(row,'other-org'),false);
});

import {defaultDashboardGroup} from './intake-queue.ts';
test('dashboard starts in the first nonempty real group without counting synthetic cases',()=>{
 assert.equal(defaultDashboardGroup([order('waiting','priprava_ponudbe')]),'decision');
 assert.equal(defaultDashboardGroup([order('test','novo',{synthetic:true}),order('repair','aktivno_popravilo')]),'work');
 assert.equal(defaultDashboardGroup([]),'new');
});

test('an unassigned Quibi work order routes to assignment without reclassifying existing invoice progress',()=>{const row=order('c066','caka_izbiro_termina',{quibiWorkOrderId:'2176935',nextActionKind:'manual_external_handoff',nextActionLabel:'Dodeli mehaniku'});const queued=intakeQueue([row])[0];assert.equal(queued.group,'work');assert.ok(queued.href.endsWith('#popravilo'));const invoiced=intakeQueue([{...row,nextActionLabel:'Račun je ustvarjen.'}])[0];assert.notEqual(invoiced.label,'Dodeli mehaniku');});

test('daily dashboard sorts newest business activity first, without pinning an older attention row',()=>{const rows=dashboardQueue([order('old','priprava_ponudbe',{requiresAttention:true,updatedAt:'2026-10-24T12:00:00Z'}),order('new','novo',{updatedAt:'2026-10-25T12:00:00Z'})]);assert.deepEqual(rows.map(r=>r.order.id),['new','old']);});
test('pickup is not payment collection and routes directly to the same case pickup',()=>{const row=dashboardQueue([order('pickup','pripravljeno_za_prevzem',{repairPhase:'handover'})])[0];assert.equal(dashboardStatusLabel(row.order),'Čaka prevzem');assert.equal(shortNextAction(row),'Prevzem vozila');assert.ok(row.href.endsWith('#prevzem'));});

test('mixed manager preparation and decision tasks retain their existing group with an accurate label',()=>{assert.equal(DASHBOARD_GROUPS.find(group=>group.id==='decision')?.label,'Čaka moje dejanje');assert.equal(DASHBOARD_GROUPS.length,7);const rows=dashboardQueue([order('attention','novo',{requiresAttention:true}),order('prepare','priprava_ponudbe')]);assert.ok(rows.every(row=>row.group==='decision'));});
