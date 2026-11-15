import 'server-only';
import {createHash} from 'node:crypto';
import {createOpenAiIntakeProvider,intakeAiConfiguration} from './openai-intake-provider';
import type {IntakeAnalysisProvider} from './intake-analysis';
// Bounded, short-lived server memory; no new database or persistent customer-data store.
const pending=new Map<string,{expires:number;reply:Promise<unknown>}>();
export function configuredIntakeProvider(organizationId:string):IntakeAnalysisProvider|undefined{
 if(!intakeAiConfiguration(process.env).ready)return undefined;
 const apiKey=process.env.OPENAI_API_KEY!,model=process.env.SELAN_AI_MODEL!;
 const provider=createOpenAiIntakeProvider({apiKey,model});
 return {analyze(input){
  const key=createHash('sha256').update(JSON.stringify({organizationId,model,apiKey,input})).digest('hex');
  const cached=pending.get(key);if(cached&&cached.expires>Date.now())return cached.reply;
  if(pending.size>=50)pending.delete(pending.keys().next().value!);
  const reply:Promise<unknown>=provider.analyze(input).catch(()=>{if(pending.get(key)?.reply===reply)pending.delete(key);throw Error('INTAKE_AI_UNAVAILABLE')});
  pending.set(key,{expires:Date.now()+300000,reply});return reply;
 }};
}
