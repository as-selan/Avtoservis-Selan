import {isPretechnicalInspection} from './inspection-catalog.ts';
import test from 'node:test';import assert from 'node:assert/strict';import {inspectionBillingReview} from './inspection-billing-review.ts';
const input={caseId:'case',customerId:'7',vehicleId:'8',findings:'Preverjeno',sourceSha:'a'.repeat(64),quantity:1,total:61};
test('review ties service pricing to same case, identity, findings and quantity',()=>{const first=inspectionBillingReview(input);assert.equal(inspectionBillingReview({...input}).sha,first.sha);for(const patch of [{caseId:'other'},{customerId:'9'},{vehicleId:'10'},{findings:'Druga ugotovitev'},{sourceSha:'b'.repeat(64)},{quantity:2},{total:62}])assert.notEqual(inspectionBillingReview({...input,...patch}).sha,first.sha);assert.equal(first.reference,'selan-inspection:case');});
test('missing verified price source or invalid quantity never produces a review',()=>{for(const patch of [{sourceSha:''},{quantity:0},{total:NaN}])assert.throws(()=>inspectionBillingReview({...input,...patch}));});

test('technical inspection never becomes the conditional preliminary inspection service',()=>{assert.equal(isPretechnicalInspection('BREZPLAČNI PREGLED VOZILA PRED TEHNIČNIM PREGLEDOM'),true);assert.equal(isPretechnicalInspection('Predhodni pregled za odločitev o popravilu'),false);assert.equal(isPretechnicalInspection('Pregled zavor'),false);});
