import test from 'node:test';import assert from 'node:assert/strict';
import {createdEstimateSummary} from './created-estimate-summary.ts';
const detail={id:'2222',customerId:'405958',vehicleId:'2389',number:'DEV-1',amount:'122.00',contentSha256:'a'.repeat(64)};
const expected={id:'2222',customerId:'405958',vehicleId:'2389',sha:'a'.repeat(64),amount:122};
test('success displays freshly read Quibi amount and ID; linking and sending are separate',()=>{assert.deepEqual(createdEstimateSummary(detail,expected,'local-customer',true),{id:'2222',number:'DEV-1',amount:'122.00',customerId:'local-customer',linked:true});assert.equal(createdEstimateSummary(detail,expected,'local-customer',false).linked,false);});
test('changed amount, identity, missing vehicle or digest cannot be reported as verified success',()=>{for(const patch of [{amount:'123.00'},{amount:''},{id:'999'},{customerId:'405957'},{vehicleId:'2388'},{vehicleId:undefined},{contentSha256:'b'.repeat(64)}])assert.throws(()=>createdEstimateSummary({...detail,...patch},expected,'local-customer',true),/CHANGED/);});
