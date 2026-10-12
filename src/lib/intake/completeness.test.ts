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
test('immutable web provenance retains strict contacts and unknown requirements',()=>{
 const input={phone:null,email:'test@example.test',vin:'TESTSELANAX202601',make:'TEST',model:'QA'};
 const result=currentIntakeCompleteness(input,{source:'web',channel:'web',intakeRequestId:'original-web-request'},['extra_requirement']);
 assert.deepEqual(result.missing_fields,['phone','extra_requirement']);assert.equal(result.status,'needs_data');
});
