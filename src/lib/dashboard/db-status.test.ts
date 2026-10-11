import assert from 'node:assert/strict';
import test from 'node:test';
import {mapDbStatusToUiStatus} from './db-status.ts';
test('converted cases remain active until actual repair and handover are complete',()=>{
 assert.equal(mapDbStatusToUiStatus('converted'),'aktivno_popravilo');
 assert.equal(mapDbStatusToUiStatus('converted','ready_for_collection'),'pripravljeno_za_prevzem');
 assert.equal(mapDbStatusToUiStatus('converted','closed'),'zakljuceno');
 assert.equal(mapDbStatusToUiStatus('closed'),'zakljuceno');
});
