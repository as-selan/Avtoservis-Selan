import assert from 'node:assert/strict';
import test from 'node:test';
import {partyUpdateFailure} from './party-update-result.ts';
test('party update distinguishes rejection, preflight block and unknown without leaking errors',()=>{
 assert.equal(partyUpdateFailure(new Error('QUIBI_UPDATE_REJECTED')).state,'rejected');
 assert.equal(partyUpdateFailure(new Error('QUIBI_PARTY_CHANGED')).state,'blocked');
 assert.equal(partyUpdateFailure(new Error('QUIBI_UPDATE_REQUIRES_RECONCILIATION')).state,'unknown');
 assert.equal(partyUpdateFailure(new Error('timeout secret')).state,'unknown');
 assert.equal(partyUpdateFailure(new Error('UNRESOLVED_PARTY_UPDATE')).state,'unknown');
 assert.ok(!partyUpdateFailure(new Error('timeout secret')).message.includes('secret'));
});
