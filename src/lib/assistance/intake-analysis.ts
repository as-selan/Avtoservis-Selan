export type IntakeAnalysisInput={summary:string;missingFields:string[];serviceWanted?:string};
export type IntakeAnalysisProvider={analyze(input:IntakeAnalysisInput):Promise<unknown>};
export type IntakeAnalysisResult={status:'unavailable'|'draft'|'failed';missingFields:string[];draft:string|null;analysis:string|null;serviceSuggestions:string[];reviewRequired:true;canSend:false};
/** Provider output is advisory. This boundary cannot approve, write or send anything. */
export async function analyzeIntake(input:IntakeAnalysisInput,provider?:IntakeAnalysisProvider):Promise<IntakeAnalysisResult>{
 const base={missingFields:[...new Set(input.missingFields)],reviewRequired:true as const,canSend:false as const,analysis:null,serviceSuggestions:[] as string[]};
 if(!provider)return {...base,status:'unavailable',draft:null};
 try{
  if(input.summary.length>10000||base.missingFields.length>30||(input.serviceWanted?.length??0)>1000)throw Error('INVALID_INPUT');
  const reply=await provider.analyze({summary:input.summary,missingFields:[...base.missingFields],serviceWanted:input.serviceWanted});
  if(!reply||typeof reply!=='object'||!('draft' in reply)||typeof reply.draft!=='string'||!reply.draft.trim()||reply.draft.length>4000)throw Error('INVALID_REPLY');
  const analysis='analysis' in reply?reply.analysis:null;
  const suggestions='serviceSuggestions' in reply?reply.serviceSuggestions:[];
  if(analysis!==null&&(typeof analysis!=='string'||analysis.length>4000)||!Array.isArray(suggestions)||suggestions.length>6||suggestions.some(s=>typeof s!=='string'||!s.trim()||s.length>200))throw Error('INVALID_REPLY');
  return {...base,status:'draft',draft:reply.draft.trim(),analysis:typeof analysis==='string'?analysis.trim():null,serviceSuggestions:suggestions.map(s=>s.trim())};
 }catch{return {...base,status:'failed',draft:null}}
}
