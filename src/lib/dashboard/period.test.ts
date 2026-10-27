import test from 'node:test';
import assert from 'node:assert/strict';
import {isDateInPeriod} from './period.ts';
const now=new Date('2026-10-27T12:00:00Z');
test('last 30 Ljubljana calendar days include today and the previous 29 days',()=>{assert.equal(isDateInPeriod('2026-09-28T00:00:00Z','ta_mesec',now),true);assert.equal(isDateInPeriod('2026-09-27T00:00:00Z','ta_mesec',now),false);assert.equal(isDateInPeriod('2026-10-28T12:00:00Z','ta_mesec',now),false)});
test('custom bounds include both local days including daylight saving transitions',()=>{const range={from:'2026-10-25',to:'2026-10-26'};assert.equal(isDateInPeriod('2026-10-24T22:00:00Z','po_zelji',now,range),true);assert.equal(isDateInPeriod('2026-10-26T22:59:59Z','po_zelji',now,range),true);assert.equal(isDateInPeriod('2026-10-26T23:00:00Z','po_zelji',now,range),false)});
test('week handles clock change and today uses Ljubljana day',()=>{assert.equal(isDateInPeriod('2026-10-25T22:30:00Z','ta_teden',now),false);assert.equal(isDateInPeriod('2026-10-26T00:30:00Z','ta_teden',now),true);assert.equal(isDateInPeriod('2026-10-26T23:15:00Z','danes',now),true)});
