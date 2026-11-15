import test from 'node:test';import assert from 'node:assert/strict';
import {caseReferenceRange,resolveShortCaseReference} from './reference.ts';
import {isoFromSlovenianDate,slovenianDate} from './slovenian-date.ts';
test('short reference uses exact eight hex digits and refuses ambiguous results',async()=>{
 const id='a73db6be-7216-4677-bc0a-26e97693ad75';let calls=0;
 const find=async(org:string,range:{lower:string;upper:string})=>{calls++;assert.equal(org,'authorized-org');assert.equal(range.lower,'a73db6be-0000-0000-0000-000000000000');return [id]};
 assert.equal(await resolveShortCaseReference('A73DB6BE','authorized-org',find),id);
 assert.equal(await resolveShortCaseReference('a73db6be','authorized-org',async()=>[id,'a73db6be-ffff-ffff-ffff-ffffffffffff']),null);
 assert.equal(await resolveShortCaseReference('a73db6','authorized-org',find),null);assert.equal(calls,1);
 assert.equal(caseReferenceRange('a73db6be%'),null);
});
test('Slovenian dates preserve ISO and reject invalid dates without timezone changes',()=>{
 for(const iso of ['2026-10-24','2026-11-07','2028-02-29'])assert.equal(isoFromSlovenianDate(slovenianDate(iso)),iso);
 assert.equal(slovenianDate('2026-11-07'),'07. 11. 2026');
 for(const value of ['02/03/2026','31. 02. 2026','29. 02. 2026','2026-10-24',''])assert.equal(isoFromSlovenianDate(value),null);
});
