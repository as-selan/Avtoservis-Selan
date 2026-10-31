import test from 'node:test';import assert from 'node:assert/strict';import {paymentPresentation} from './invoice-payments.ts';
test('business payment labels distinguish unknown, unpaid evidence, partial and paid independently of pickup',()=>{
 assert.equal(paymentPresentation(null).label,'Plačilo ni potrjeno');assert.equal(paymentPresentation(null).remaining,undefined);
 assert.equal(paymentPresentation({paid:0,remaining:50}).label,'Plačilo ni potrjeno');assert.equal(paymentPresentation({paid:0,remaining:50}).remaining,50);
 assert.equal(paymentPresentation({paid:20,remaining:30}).label,'Delno plačano');assert.equal(paymentPresentation({paid:50,remaining:0}).label,'Plačano');
});
