import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import {parseWebIntakeBody} from '../../src/lib/intake/web-public.ts';
import {validateWebIntakeForm} from '../../src/lib/intake/web-validate.ts';

test('the actual isolated seed satisfies current web validation, including mandatory email',()=>{
 const seed=readFileSync('scripts/e2e/seed-isolated.mjs','utf8');
 const declaration=seed.match(/const webArgs = (\{[\s\S]*?\n\});/);assert.ok(declaration);
 const args=runInNewContext('('+declaration[1]+')',{randomUUID});
 const body=Object.fromEntries(Object.entries(args).map(([key,value])=>[({p_client_request_id:'clientRequestId',p_display_name:'displayName',p_phone:'phone',p_email:'email',p_vin:'vin',p_registration:'registration',p_make:'make',p_model:'model',p_service_wanted:'serviceWanted',p_problem_description:'problemDescription'})[key],value]));
 const parsed=parseWebIntakeBody(JSON.stringify(body));assert.ok(parsed.ok&&!parsed.honeypotTriggered);assert.equal(validateWebIntakeForm(parsed.raw).ok,true);
 const missing=validateWebIntakeForm({...parsed.raw,email:''});assert.equal(missing.ok,false);assert.ok(missing.fieldErrors.email);
 assert.match(seed,/anonError\?\.code !== "42501"/,'anonymous RPC denial must still be verified');
});
