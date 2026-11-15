import assert from "node:assert/strict";
import { test } from "node:test";
import { computeManualIntakeCompleteness,currentIntakeCompleteness } from "./completeness.ts";

test("completeness is new only when phone, email, vin, make, model present", () => {
  const full = computeManualIntakeCompleteness({
    phone: "041123456",
    email: "a@b.c",
    vin: "WBA1",
    make: "BMW",
    model: "320d",
  });
  assert.equal(full.status, "new");
  assert.deepEqual(full.missing_fields, []);
});

test("completeness lists missing fields for needs_data", () => {
  const partial = computeManualIntakeCompleteness({
    phone: "041123456",
    email: null,
    vin: null,
    make: "BMW",
    model: null,
  });
  assert.equal(partial.status, "needs_data");
  assert.deepEqual(partial.missing_fields, ["vin", "model"]);
});

test('Quibi-completed fields replace stale missing flags and return to review, never to offer approval',()=>{
 const input={phone:null,email:'test@example.test',vin:'TESTSELANAX202601',make:'TEST',model:'QA',registration:'QA'};
 const result=currentIntakeCompleteness(input,{source:'manual',channel:'phone',intakeRequestId:'manual-idempotency-key'},['phone','vin','make','model','registration']);
 assert.deepEqual(result.missing_fields,[]);assert.equal(result.status,'new');assert.match(result.next_action,/Preveri/);
});
test('continuation accepts an email-only web customer and retains unknown requirements',()=>{
 const input={phone:null,email:'test@example.test',vin:'TESTSELANAX202601',make:'TEST',model:'QA'};
 const result=currentIntakeCompleteness(input,{source:'web',channel:'web',intakeRequestId:'original-web-request',identityConfirmed:true},['extra_requirement']);
 assert.deepEqual(result.missing_fields,['extra_requirement']);assert.equal(result.status,'needs_data');
});

test('email-only linked web intake does not repeat a stale phone requirement',()=>{const result=currentIntakeCompleteness({phone:null,email:'qa@example.test',vin:'TESTVIN',make:'TEST',model:'A'},{source:'web_form',channel:'web',identityConfirmed:true},['phone']);assert.equal(result.status,'new');assert.deepEqual(result.missing_fields,[]);});

test('unconfirmed web identities and invalid email retain the original contact requirements',()=>{for(const origin of [{source:'web_form',channel:'web',identityConfirmed:false},{source:'web_form',channel:'web'}]){assert.deepEqual(currentIntakeCompleteness({phone:null,email:'qa@example.test',vin:'VIN',make:'TEST',model:'A'},origin).missing_fields,['phone']);}assert.ok(currentIntakeCompleteness({phone:null,email:'invalid',vin:'VIN',make:'TEST',model:'A'},{source:'web_form',channel:'web',identityConfirmed:true}).missing_fields.includes('phone'));});
