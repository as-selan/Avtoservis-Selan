import test from "node:test";
import assert from "node:assert/strict";
import {validateCompletionFields} from "./validate.ts";
test("completion accepts absent VIN but rejects malformed supplied VIN",()=>{assert.equal(validateCompletionFields({email:"test-selan-ai@example.test"}).ok,true);assert.equal(validateCompletionFields({vin:"TESTSELANAI2026011"}).ok,false);assert.equal(validateCompletionFields({vin:"TESTSELANAI202601"}).ok,true);});
