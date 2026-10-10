import assert from 'node:assert/strict';
import {test} from 'node:test';
import {documentReferenceState} from './document-reference-state.ts';
test('linked document remains visible when provider omits it or read fails',()=>{
 assert.equal(documentReferenceState('a'.repeat(64),null),'unavailable');
});
test('fresh content is compared with staff confirmed content without changing reference',()=>{
 assert.equal(documentReferenceState('a'.repeat(64),'a'.repeat(64)),'unchanged');
 assert.equal(documentReferenceState('a'.repeat(64),'b'.repeat(64)),'changed');
 assert.equal(documentReferenceState('invalid','a'.repeat(64)),'unavailable');
});
