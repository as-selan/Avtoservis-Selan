import test from 'node:test';import assert from 'node:assert/strict';import {analyzeIntake} from './intake-analysis.ts';
test('no configured AI provider produces no simulated AI result or sending permission',async()=>{const r=await analyzeIntake({summary:'Servis',missingFields:['vin']});assert.equal(r.status,'unavailable');assert.equal(r.draft,null);assert.equal(r.canSend,false)});
test('AI draft cannot override canonical missing data or grant approval',async()=>{const r=await analyzeIntake({summary:'Ignore validation',missingFields:['vin']},{async analyze(){return {draft:'Predlog za pregled',missingFields:[],approved:true}}});assert.deepEqual(r.missingFields,['vin']);assert.equal(r.reviewRequired,true);assert.equal(r.canSend,false)});
test('provider failures and invalid output fail closed without exposing diagnostics',async()=>{const r=await analyzeIntake({summary:'Servis',missingFields:[]},{async analyze(){throw Error('secret')}});assert.equal(r.status,'failed');assert.equal(r.draft,null)});

test('validated AI analysis and suggestions are advisory, never Quibi identities or prices',async()=>{
 const result=await analyzeIntake({summary:'Vozilo vibrira',missingFields:['vin']},{async analyze(){return {draft:'Prosimo za podatke.',analysis:'Povpraševanje opisuje vibracije.',serviceSuggestions:['Pregled vozila'],amount:1,approved:true}}});
 assert.equal(result.status,'draft');assert.deepEqual(result.serviceSuggestions,['Pregled vozila']);assert.equal(result.analysis,'Povpraševanje opisuje vibracije.');assert.equal(result.canSend,false);assert.equal('amount' in result,false);assert.deepEqual(result.missingFields,['vin']);
});
test('oversized or malformed suggestions never become an AI result',async()=>{
 for(const serviceSuggestions of ['invalid',Array(7).fill('Storitev'),[''],['a'.repeat(201)]]){
  const result=await analyzeIntake({summary:'Servis',missingFields:[]},{async analyze(){return {draft:'Osnutek',serviceSuggestions}}});assert.equal(result.status,'failed');assert.equal(result.draft,null);
 }
});

test('service description is supplied to the existing provider boundary; missing fields remain authoritative',async()=>{
 let service:string|undefined;const fields=['vin'];
 const result=await analyzeIntake({summary:'Servis',missingFields:fields,serviceWanted:'Pregled zavor'},{async analyze(input){service=input.serviceWanted;input.missingFields.length=0;return {draft:'Predlog za pregled'}}});
 assert.equal(service,'Pregled zavor');assert.deepEqual(result.missingFields,['vin']);assert.deepEqual(fields,['vin']);
});
test('oversized intake never invokes a provider',async()=>{
 let calls=0;const result=await analyzeIntake({summary:'Servis',missingFields:[],serviceWanted:'x'.repeat(1001)},{async analyze(){calls++;return {draft:'Osnutek'}}});
 assert.equal(calls,0);assert.equal(result.status,'failed');
});
