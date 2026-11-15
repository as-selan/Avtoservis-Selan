import { computeCompletionLifecycle, remainingCompletionDraft } from "./lifecycle.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
test("completed manual data returns to explicit intake review", () => {
  const result = computeCompletionLifecycle({ phone: null, email: "qa@example.test", vin: "TEST153D7E1AA2026", make: "TEST", model: "QA" }, "manual");
  assert.equal(result.status, "new");
});
test("web completion cannot lower contact requirements", () => {
  assert.equal(computeCompletionLifecycle({ phone: null, email: "qa@example.test", vin: "TEST153D7E1AA2026", make: "TEST", model: "QA" }).status, "needs_data");
});

test("partial completion keeps unresolved identity input instead of silently clearing it",()=>{
 const input={phone:'',email:'qa@example.test',vin:'TESTSELANAX202601',make:'TEST',model:'SELAN AI'};
 assert.deepEqual(remainingCompletionDraft(input,['vin','make','model']),{...input,email:''});
 assert.equal(remainingCompletionDraft(input,['vin']).vin,input.vin);
 assert.deepEqual(remainingCompletionDraft(input,[]),{phone:'',email:'',vin:'',make:'',model:''});
});
