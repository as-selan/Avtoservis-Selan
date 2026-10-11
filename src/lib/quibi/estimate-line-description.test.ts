import test from 'node:test';import assert from 'node:assert/strict';
import {estimateLineDescription} from './estimate-line-description.ts';
test('intake with only a problem can prepare an explicitly reviewed line without invented service',()=>{
 assert.equal(estimateLineDescription({service_wanted:null,problem_description:' Menjava olja '}),'Menjava olja');
 assert.equal(estimateLineDescription({service_wanted:'Servis',problem_description:'Težava'}),'Servis');
 assert.equal(estimateLineDescription({}),null);assert.equal(estimateLineDescription({problem_description:'a'.repeat(501)}),null);
});
