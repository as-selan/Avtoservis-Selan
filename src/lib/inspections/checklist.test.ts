import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectionFindings,inspectionChecksFromNotes,inspectionChangedChecks} from './checklist.ts';
test('inspection records explicit not-inspected without treating it as repair',()=>{assert.equal(inspectionFindings({Zavore:'not_inspected',Luči:'ok'}),'Zavore: Ni pregledano\nLuči: V redu')});
test('latest saved inspection state survives later notes and explicit reset',()=>{assert.deepEqual(inspectionChecksFromNotes(['Zavore: Potrebno popravilo\nLuči: V redu','Običajen zapis','Zavore: Ni pregledano']),{Zavore:'not_inspected',Luči:'ok'})});

test('only changed checks create a new note',()=>{assert.deepEqual(inspectionChangedChecks({Zavore:'ok',Luči:'repair'},{Zavore:'ok',Luči:'ok'}),{Luči:'repair'})});