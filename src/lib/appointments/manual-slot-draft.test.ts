import test from 'node:test';import assert from 'node:assert/strict';
import {manualSlotDraft} from './manual-slot-draft.ts';
const now=Date.parse('2026-10-17T00:00:00Z');
test('manual options reject missing, duplicate, past and ambiguous times',()=>{
  for(const slots of [[],['2026-11-01T10:00','',''],Array(3).fill('2026-11-01T10:00'),['2025-11-01T10:00','2026-11-01T11:00','2026-11-01T12:00'],['2026-10-25T02:30','2026-11-01T11:00','2026-11-01T12:00']])assert.equal(manualSlotDraft(slots,now).ok,false);
});
test('three real inputs form Ljubljana message without claiming reservation or sending',()=>{
 const result=manualSlotDraft(['2026-11-01T10:00','2026-11-02T11:00','2026-11-03T12:00'],now);assert.ok(result.ok);assert.equal(result.slots[0],'2026-11-01T09:00:00.000Z');assert.match(result.message,/ni rezerviran/);assert.match(result.message,/1\. /);assert.equal(result.slots.length,3);
});
