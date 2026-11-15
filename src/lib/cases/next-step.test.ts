import assert from "node:assert/strict";
import { test } from "node:test";
import { nextCaseStep } from "./next-step.ts";

test("missing data continues the same case before any offer step", () => {
  assert.equal(nextCaseStep({ status: "needs_data", offerPrepared: false, quibiLinked: false }).kind, "request_data");
});

test("prepared case directs staff to create and link a real Quibi estimate", () => {
  assert.equal(nextCaseStep({ status: "preparing_offer", offerPrepared: true, quibiLinked: true }).kind, "manual_quibi_estimate");
  assert.equal(nextCaseStep({ status: "preparing_offer", offerPrepared: true, quibiLinked: true,
    quoteReviewStatus: "unreviewed" }).kind, "review_estimate");
  assert.equal(nextCaseStep({ status: "preparing_offer", offerPrepared: true, quibiLinked: true,
    quoteReviewStatus: "approved_for_send" }).kind, "send_estimate");
  assert.equal(nextCaseStep({ status: "preparing_offer", offerPrepared: true, quibiLinked: true,
    quoteReviewStatus: "approved_for_send", customerDecision: "rejected" }).kind, "revise_estimate");
});

test("changed customer data blocks the next Quibi-dependent step", () => {
  assert.equal(nextCaseStep({ status: "preparing_offer", offerPrepared: false, quibiLinked: true, quibiSyncStatus: "both_changed" }).kind, "review_quibi_mismatch");
});

test("confirmed internal appointment never claims external calendar sync", () => {
  const step = nextCaseStep({ status: "appointment_confirmed", offerPrepared: true, quibiLinked: true });
  assert.equal(step.kind, "manual_external_handoff");
  assert.equal(step.externalConfirmed, false);
});

test("selected manual slot asks for the real external booking instead of repeating the offer", () => {
  const step = nextCaseStep({ status: "awaiting_slot_selection", offerPrepared: true,
    quibiLinked: false, slotOfferStatus: "selected" });
  assert.equal(step.kind, "manual_scheduling");
  assert.match(step.label, /rezerviraj/i);
  assert.equal(step.externalConfirmed, false);
});

test("published final price uses a distinct human review and decision path", () => {
  assert.equal(nextCaseStep({ status: "preparing_offer", offerPrepared: false, quibiLinked: false,
    fixedPriceStatus: "prepared" }).kind, "review_estimate");
  assert.equal(nextCaseStep({ status: "preparing_offer", offerPrepared: false, quibiLinked: false,
    fixedPriceStatus: "approved" }).kind, "send_estimate");
  assert.equal(nextCaseStep({ status: "awaiting_customer_approval", offerPrepared: false, quibiLinked: false,
    fixedPriceStatus: "communicated" }).kind, "await_customer");
  assert.equal(nextCaseStep({ status: "declined", offerPrepared: false, quibiLinked: false,
    fixedPriceStatus: "rejected" }).kind, "closed");
});

test("declined repair after inspection remains visible as a manual billing task", () => {
  const step = nextCaseStep({ status: "declined", offerPrepared: false, quibiLinked: false,
    inspectionRepairDecision: "not_ordered" });
  assert.equal(step.kind, "manual_inspection_billing");
  assert.equal(step.externalConfirmed, false);
});

test("ordered repair after inspection returns to explicit intake review", () => {
  const step = nextCaseStep({ status: "new", offerPrepared: false, quibiLinked: false,
    inspectionRepairDecision: "ordered" });
  assert.equal(step.kind, "verify_intake");
  assert.match(step.label, /naročenem popravilu/);
});

test("converted cases direct work execution, parts and invoice closure", () => {
 const base={status:"converted",offerPrepared:true,quibiLinked:true};
 assert.match(nextCaseStep(base).label,/delovni nalog/);
 assert.match(nextCaseStep({...base,workOrderStatus:"awaiting_parts"}).label,/dele/);
 assert.match(nextCaseStep({...base,workOrderStatus:"ready_for_collection"}).label,/račun.*prevzem/);
 assert.equal(nextCaseStep({...base,status:"closed"}).kind,"closed");
});

test("synthetic appointment never claims an external reservation", () => {
 const step=nextCaseStep({status:"appointment_confirmed",offerPrepared:true,quibiLinked:true,syntheticAppointment:true});
 assert.match(step.label,/QA-SIM/);
 assert.match(step.label,/Zunanje rezervacije ni/);
 assert.equal(step.externalConfirmed,false);
});

test('unknown Quibi CREATE is the next action instead of a new estimate',()=>{const step=nextCaseStep({status:'preparing_offer',offerPrepared:true,quibiLinked:true,quibiCreateUncertain:true});assert.equal(step.kind,'review_quibi_mismatch');assert.match(step.label,/informativno pregledate/);assert.match(step.label,/ponovno ustvarjanje ostaja ustavljeno/)});

test('recorded customer approval proceeds to direct Quibi business flow without inventing delivery',()=>{
 const step=nextCaseStep({status:'awaiting_slot_selection',offerPrepared:true,quibiLinked:true,directQuibiBusiness:true,customerDecision:'approved',deliveryStatus:'pending'});
 assert.equal(step.kind,'manual_external_handoff');assert.equal(step.externalConfirmed,false);
});

test('verified approval overrides stale offer status without requiring delivery; uncertain CREATE and invalid identity still block',()=>{const base={status:'preparing_offer',offerPrepared:true,quibiLinked:true,directQuibiBusiness:true,quoteReviewStatus:'approved_for_send',customerApprovalVerified:true,deliveryStatus:'pending'};assert.equal(nextCaseStep(base).kind,'manual_external_handoff');assert.equal(nextCaseStep({...base,status:'awaiting_customer_approval'}).kind,'manual_external_handoff');assert.equal(nextCaseStep({...base,quibiCreateUncertain:true}).kind,'review_quibi_mismatch');assert.equal(nextCaseStep({...base,quibiSyncStatus:'both_changed'}).kind,'review_quibi_mismatch');assert.notEqual(nextCaseStep({...base,customerApprovalVerified:false}).kind,'manual_external_handoff');});

test('definitive CREATE rejection directs review and never suggests a new document',()=>{const step=nextCaseStep({status:'preparing_offer',offerPrepared:true,quibiLinked:true,quibiCreateRejected:true});assert.equal(step.kind,'review_quibi_mismatch');assert.match(step.label,/zavrnil/);assert.match(step.label,/zaklenjen/);});

import {quibiBusinessNextAction} from './next-step.ts';
const invoice={kind:'invoice',state:'verified',quibi_id:'2176902',quibi_content_sha256:'a'.repeat(64)};
test('verified invoice replaces stale appointment next action without claiming receipt or closure',()=>{const progress=quibiBusinessNextAction([invoice,{kind:'send',state:'verified',quibi_id:'2176902',send_status:'sent',request_body:JSON.stringify({sha:'a'.repeat(64)})}])!;const step=nextCaseStep({status:'awaiting_slot_selection',offerPrepared:true,quibiLinked:true,directQuibiBusiness:true,businessNextAction:progress});assert.match(step.label,/2176902.*predan poštnemu strežniku/);assert.match(step.label,/niso potrjeni/);assert.equal(step.externalConfirmed,false);assert.notEqual(step.kind,'closed')});
test('rejected empty CREATE preserves verified invoice progress; unknown SEND blocks new send',()=>{assert.match(quibiBusinessNextAction([{...invoice,state:'failed',quibi_id:null},invoice])!.label,/je ustvarjen/);assert.match(quibiBusinessNextAction([invoice,{kind:'send',state:'uncertain',quibi_id:'2176902'}])!.label,/Ne pošiljaj ponovno/)});
test('old-version SEND does not confirm current invoice version',()=>assert.match(quibiBusinessNextAction([invoice,{kind:'send',state:'verified',quibi_id:'2176902',send_status:'sent',request_body:JSON.stringify({sha:'b'.repeat(64)})}])!.label,/je ustvarjen/));


test('unpaid preliminary inspection is not hidden by existing Quibi business progress',()=>{
 const step=nextCaseStep({status:'declined',offerPrepared:true,quibiLinked:true,directQuibiBusiness:true,inspectionRepairDecision:'not_ordered',businessNextAction:{kind:'manual_external_handoff',label:'Existing document',externalConfirmed:false}});
 assert.equal(step.kind,'manual_inspection_billing');assert.match(step.label,/plačljiv/);
});
test('dashboard without case-specific write readiness offers preview without inventing a configuration failure',()=>{
 const step=nextCaseStep({status:'preparing_offer',offerPrepared:true,quibiLinked:true});
 assert.match(step.label,/preglej ponudbo/);assert.doesNotMatch(step.label,/konfiguriraj/);
});

test('a verified work order requests assignment, not an invoice',()=>{const step=quibiBusinessNextAction([{kind:'work_order',state:'verified',quibi_id:'2176935'}])!;assert.equal(step.label,'Dodeli mehaniku');});
