export type IntakeAnalysisInput={summary:string;missingFields:string[]};
export type IntakeAnalysisProvider={analyze(input:IntakeAnalysisInput):Promise<unknown>};
export type IntakeAnalysisResult={status:'unavailable'|'draft'|'failed';missingFields:string[];draft:string|null;reviewRequired:true;canSend:false};
/** Provider output is advisory. This boundary cannot approve, write or send anything. */
export async function analyzeIntake(input:IntakeAnalysisInput,provider?:IntakeAnalysisProvider):Promise<IntakeAnalysisResult>{
 const base={missingFields:[...new Set(input.missingFields)],reviewRequired:true as const,canSend:false as const};
 if(!provider)return {...base,status:'unavailable',draft:null};
 try{
  if(input.summary.length>10000||base.missingFields.length>30)throw Error('INVALID_INPUT');
  const reply=await provider.analyze({summary:input.summary,missingFields:[...base.missingFields]});
  if(!reply||typeof reply!=='object'||!('draft' in reply)||typeof reply.draft!=='string'||!reply.draft.trim()||reply.draft.length>4000)throw Error('INVALID_REPLY');
  return {...base,status:'draft',draft:reply.draft.trim()};
 }catch{return {...base,status:'failed',draft:null}}
}
