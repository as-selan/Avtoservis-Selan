import test from 'node:test';import assert from 'node:assert/strict';
import {estimateLineDescription} from './estimate-line-description.ts';
test('customer problem remains context and never becomes a chargeable line',()=>{
 assert.equal(estimateLineDescription({service_wanted:null,problem_description:' Menjava olja '}),null);
 assert.equal(estimateLineDescription({service_wanted:'Servis',problem_description:'Težava'}),'Servis');
 assert.equal(estimateLineDescription({}),null);assert.equal(estimateLineDescription({problem_description:'a'.repeat(501)}),null);
});
