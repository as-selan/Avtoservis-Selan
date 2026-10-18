import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAiIntakeProvider,intakeAiConfiguration} from './openai-intake-provider.ts';
import {analyzeIntake} from './intake-analysis.ts';
const input={summary:'Menjava olja',serviceWanted:'Servis',missingFields:['vin']};
const payload={analysis:'Povpraševanje za servis.',draft:'Prosimo za VIN.',serviceSuggestions:['Menjava olja']};
const completed={status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(payload)}]}]};
test('AI requires explicit server key and model without defaults',()=>{
 assert.deepEqual(intakeAiConfiguration({}).missing,['OPENAI_API_KEY','SELAN_AI_MODEL']);
 assert.equal(intakeAiConfiguration({OPENAI_API_KEY:'test-only',SELAN_AI_MODEL:' '}).ready,false);
 assert.throws(()=>createOpenAiIntakeProvider({apiKey:'test-only',model:''}),/NOT_CONFIGURED/);
});
test('Responses sends only agreed inquiry fields with strict schema and no storage or tools',async()=>{
 let calls=0;
 const fetcher=(async(url:unknown,init:RequestInit)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
 const body=JSON.parse(init.body as string);assert.equal(body.store,false);assert.equal(body.model,'test-model');assert.equal(body.tools,undefined);assert.deepEqual(JSON.parse(body.input),input);assert.equal(body.text.format.strict,true);assert.equal(body.text.format.schema.additionalProperties,false);
 return Response.json(completed);}) as typeof fetch;
 const result=await analyzeIntake(input,createOpenAiIntakeProvider({apiKey:'test-only-not-a-real-key',model:'test-model',fetcher}));
 assert.equal(calls,1);assert.equal(result.status,'draft');assert.equal(result.analysis,payload.analysis);assert.equal(result.canSend,false);assert.deepEqual(result.missingFields,['vin']);
});
test('provider rejection, incomplete output, malformed JSON and timeout fail without retry',async()=>{
 for(const response of [()=>Response.json({error:'sensitive'}, {status:401}),()=>Response.json({status:'incomplete',output:[]}),()=>Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'invalid'}]}]}),()=>{throw Error('sensitive timeout');}]){
 let calls=0;const fetcher=(async()=>{calls++;return response();}) as typeof fetch;
 const result=await analyzeIntake(input,createOpenAiIntakeProvider({apiKey:'test-only',model:'test-model',fetcher}));assert.equal(result.status,'failed');assert.equal(result.draft,null);assert.equal(calls,1);assert.equal(JSON.stringify(result).includes('sensitive'),false);
 }
});
test('oversized inquiry never reaches provider',async()=>{
 let calls=0;const fetcher=(async()=>{calls++;return Response.json(completed);}) as typeof fetch;
 await assert.rejects(createOpenAiIntakeProvider({apiKey:'test-only',model:'test-model',fetcher}).analyze({...input,summary:'x'.repeat(10001)}),/INPUT_INVALID/);assert.equal(calls,0);
});

test('Responses receives inspection and catalog identity but no catalog prices or customer identifiers',async()=>{
 const estimateContext={inspectionFindings:'2 kosa za zamenjavo',mechanicNotes:['Obrabljeno'],vehicle:{make:'TEST',model:'QA'},catalog:[{key:'189:11',code:'QA',name:'Preverjena postavka',unit:'kos'}]};
 const fetcher=(async(_url:unknown,init:RequestInit)=>{const body=JSON.parse(init.body as string);assert.deepEqual(JSON.parse(body.input).estimateContext,estimateContext);assert.equal(body.store,false);assert.deepEqual(body.text.format.schema.required,['analysis','draft','serviceSuggestions','estimateLines']);
 return Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({...payload,estimateLines:[{key:'189:11',quantity:2}]})}]}]});}) as typeof fetch;
 const result=await analyzeIntake({...input,estimateContext},createOpenAiIntakeProvider({apiKey:'test-only',model:'test-model',fetcher}));assert.equal(result.status,'draft');assert.deepEqual(result.estimateLines,[{key:'189:11',quantity:2}]);
});
