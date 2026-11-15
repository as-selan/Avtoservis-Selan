import assert from 'node:assert/strict';import test from 'node:test';
import {customerRemoteId,validCustomerRemoteId} from './customer-remote-id.ts';
test('customer reference fits observed Quibi limit and preserves every UUID bit',()=>{
 const id='f5b13135-7cd7-4b05-b29e-914377ffc63d',ref=customerRemoteId(id);
 assert.equal(ref.length,22);assert.equal(Buffer.from(ref,'base64url').toString('hex'),id.replaceAll('-',''));assert.ok(validCustomerRemoteId(ref));
 assert.notEqual(ref,customerRemoteId('f5b13135-7cd7-4b05-b29e-914377ffc63e'));
 assert.ok(!validCustomerRemoteId(id.slice(0,22)));assert.throws(()=>customerRemoteId('invalid'));
});
