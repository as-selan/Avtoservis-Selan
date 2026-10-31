import assert from 'node:assert/strict';import {test} from 'node:test';import {workOrdersReadError} from './read-error.ts';
test('work order errors distinguish schema absence, denied access and unknown read failure without leaking provider details',()=>{
 assert.equal(workOrdersReadError(null),null);
 for(const code of ['PGRST205','42P01'])assert.match(workOrdersReadError({code})!,/migracije/);
 assert.match(workOrdersReadError({code:'42501'})!,/zavrnjen/);
 for(const code of ['PGRST200','FETCH_ERROR','']){const message=workOrdersReadError({code})!;assert.match(message,/povezljivost/);assert.doesNotMatch(message,/migracije/);}
});
