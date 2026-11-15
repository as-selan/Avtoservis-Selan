import test from 'node:test';
import assert from 'node:assert/strict';
import { findingInvoiceEvidenceCovers } from './finding-invoice-evidence.ts';

const original = { description:'Delo', articleCode:'A', quantity:'1', unitId:'1', vatId:'5', unitNetPrice:'10', discount:'0', grossPrice:'10', pricingVerified:true };
const extra = { ...original, description:'Del', articleCode:'B', unitNetPrice:'20', grossPrice:'20' };
const doc = { id:'1', customerId:'7', vehicleId:'8', amount:'10', status:'', number:'1', contentSha256:'a'.repeat(64), lines:[original] };
const order = { ...doc, amount:'30', contentSha256:'b'.repeat(64), lines:[original,extra] };
const evidence = { decision:'approved', completed:true, operationState:'verified', documentId:'1', documentSha:order.contentSha256, line:extra };

test('only exact approved, completed additions on the verified current order cover invoice differences',()=>{
 assert.equal(findingInvoiceEvidenceCovers(doc,order,[evidence]),true);
 for (const patch of [{decision:'rejected'},{completed:false},{operationState:'uncertain'},{documentSha:'c'.repeat(64)},{documentId:'2'},{line:{...extra,unitNetPrice:'21'}}])
  assert.equal(findingInvoiceEvidenceCovers(doc,order,[{...evidence,...patch}]),false);
 assert.equal(findingInvoiceEvidenceCovers(doc,{...order,lines:[original,extra,extra]},[evidence]),false);
 assert.equal(findingInvoiceEvidenceCovers(doc,{...order,lines:[{...original,quantity:'2'},extra]},[evidence]),false);
});
