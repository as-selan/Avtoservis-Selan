import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accessLookupFailure} from './access-lookup-failure.ts';
test('JWT rejection requires authentication rather than claiming missing membership',()=>{
 for(const code of ['PGRST301','PGRST302','PGRST303']) assert.equal(accessLookupFailure({code},false),'reauthenticate');
});
test('query errors fail closed and only authoritative absent membership is denied',()=>{
 assert.equal(accessLookupFailure({code:'08006'},false),'unavailable');
 assert.equal(accessLookupFailure(null,false),'denied');
 assert.equal(accessLookupFailure(null,true),null);
});
