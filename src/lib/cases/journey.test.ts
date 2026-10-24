import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caseJourney } from './journey.ts';
const base = { status: 'new', role: 'owner', stepKind: 'verify_intake', intakeComplete: true, identityReady: true, hosted: true, offerPrepared: false, quoteReviewed: false, customerApproved: false, dispatched: false, hasWorkOrder: false, writeReady: false, sendReady: false };
test('new inquiry offers a real intake form and never claims an estimate exists', () => {
 const j=caseJourney(base); assert.equal(j.action.href,'#podatki'); assert.match(j.action.label,/Preveri podatke/); assert.equal(j.current,1); assert.equal(j.completed[2],false);
});
test('unverified vehicle takes precedence over acceptance and points to identity resolution', () => {
 const j=caseJourney({...base,identityReady:false}); assert.equal(j.action.href,'#quibi-povezava'); assert.match(j.blocker!,/stranke in vozila/);
});
test('missing data and reception explain how to unblock the case', () => {
 assert.match(caseJourney({...base,intakeComplete:false}).blocker!,/Manjkajo/);
 const j=caseJourney({...base,role:'reception'}); assert.equal(j.action.href,'#podatki'); assert.match(j.blocker!,/lastnik ali skrbnik/);
});
test('preparation, review, sending and customer approval have distinct targets', () => {
 assert.equal(caseJourney({...base,status:'preparing_offer',stepKind:'prepare_offer'}).action.href,'#predracun');
 assert.equal(caseJourney({...base,status:'preparing_offer',stepKind:'review_estimate',offerPrepared:true}).action.href,'#pregled-predracuna');
 const send=caseJourney({...base,status:'preparing_offer',stepKind:'send_estimate',quoteReviewed:true}); assert.equal(send.action.href,'#pregled-predracuna'); assert.match(send.blocker!,/Pošiljanje/);
 const approval=caseJourney({...base,status:'awaiting_customer_approval',stepKind:'await_customer',quoteReviewed:true,dispatched:true}); assert.equal(approval.action.href,'#odobritev'); assert.equal(approval.completed[4],false);
});
test('phone approval permits order preparation without fabricating delivery or order', () => {
 const j=caseJourney({...base,status:'awaiting_slot_selection',stepKind:'manual_external_handoff',offerPrepared:true,quoteReviewed:true,customerApproved:true});
 assert.equal(j.current,5); assert.equal(j.action.href,'#poslovni-nalog'); assert.equal(j.completed[3],false); assert.equal(j.completed[5],false); assert.match(j.blocker!,/ustvarjanje/);
});
test('unknown document outcome never suggests creating again',()=>{
 const j=caseJourney({...base,status:'preparing_offer',stepKind:'review_quibi_mismatch'}); assert.match(j.action.label,/Preveri/); assert.match(j.blocker!,/Ne ponavljajte/);
});
test('verified order leads to repair and closed is explicit',()=>{
 assert.equal(caseJourney({...base,status:'converted',hasWorkOrder:true,stepKind:'manual_external_handoff'}).action.href,'#popravilo');
 assert.equal(caseJourney({...base,status:'closed',stepKind:'closed'}).action.href,'#podatki');
});

test('business order exists before mechanic assignment and must not offer CREATE again',()=>{
 const j=caseJourney({...base,status:'awaiting_slot_selection',hasWorkOrder:true,hasAssignedWork:false,customerApproved:true,stepKind:'manual_external_handoff'});assert.equal(j.current,5);assert.equal(j.action.href,'#poslovni-nalog');assert.match(j.action.label,/Preglej/);
});
test('inspection and published price retain their existing forms',()=>{
 assert.equal(caseJourney({...base,inspectionPending:true}).action.href,'#termini');
 assert.equal(caseJourney({...base,status:'preparing_offer',fixedPriceStatus:'prepared'}).action.href,'#objavljena-cena');
});
test('closed repair phase overrides stale inquiry state',()=>{
 const j=caseJourney({...base,status:'awaiting_slot_selection',repairPhase:'closed',hasWorkOrder:true,stepKind:'closed'});assert.equal(j.terminal,true);
});

test('existing order never hides unknown financial document outcome',()=>{const j=caseJourney({...base,status:'converted',hasWorkOrder:true,customerApproved:true,stepKind:'review_quibi_mismatch'});assert.equal(j.action.href,'#poslovni-nalog');assert.match(j.blocker!,/Ne ponavljajte/);});
test('accepted fixed price advances beyond the response form',()=>{const j=caseJourney({...base,status:'awaiting_slot_selection',fixedPriceStatus:'accepted',internalOrdersEnabled:true});assert.equal(j.action.href,'#termini');assert.equal(j.current,5);});

test('rejected estimate opens its existing revision form in the review section',()=>{const j=caseJourney({...base,status:'preparing_offer',stepKind:'revise_estimate',offerPrepared:true});assert.equal(j.action.href,'#pregled-predracuna');});

test('failed and queued sends stay prominent without blocking a real phone approval',()=>{for(const sendState of ['failed','queued',null]){const j=caseJourney({...base,status:'awaiting_customer_approval',stepKind:'await_customer',quoteReviewed:true,sendAttempted:true,sendState});assert.equal(j.action.href,'#odobritev');assert.match(j.blocker!,/Ne pošiljajte|Ne ponavljajte/);}});


test('DEV email is optional and routes a reviewed estimate to separately recorded approval',()=>{
 const j=caseJourney({...base,status:'preparing_offer',quoteReviewed:true,devNoEmail:true,sendAttempted:true,sendState:'failed'});
 assert.equal(j.action.href,'#odobritev');assert.match(j.blocker!,/DEV ne pošilja/);assert.equal(j.completed[3],false);assert.equal(j.completed[4],false);
});

test('automatic preparation skips a separate intake click but preserves uncertainty and missing-data gates',()=>{for(const [state,label] of [['ready','Preglej in potrdi'],['ambiguous','Izberi storitev'],['missing_price','Vnesi ceno']] as const){const j=caseJourney({...base,automaticPreparation:true,automaticDraftState:state});assert.equal(j.action.label,label);assert.equal(j.action.href,'#predracun');}assert.equal(caseJourney({...base,automaticPreparation:true,automaticDraftState:'ready',identityReady:false}).action.href,'#quibi-povezava');});
