export type IntakeServiceMatch={requestedService:string;key:string|null;alternatives:string[];confidence:"high"|"uncertain"};
export type IntakeEstimateContext={inspectionFindings?:string;mechanicNotes?:string[];vehicle?:{make:string;model:string};requestedServices?:string[];catalog:Array<{key:string;code:string;name:string;unit:string}>};
export type IntakeEstimateLine={key:string;quantity:number|null};
export type IntakeAnalysisInput={summary:string;missingFields:string[];serviceWanted?:string;estimateContext?:IntakeEstimateContext};
export type IntakeAnalysisProvider={analyze(input:IntakeAnalysisInput):Promise<unknown>};
export type IntakeAnalysisResult={status:'unavailable'|'draft'|'failed';missingFields:string[];draft:string|null;analysis:string|null;serviceSuggestions:string[];estimateLines:IntakeEstimateLine[];serviceMatches:IntakeServiceMatch[];reviewRequired:true;canSend:false};
export function validIntakeAnalysisInput(input:IntakeAnalysisInput){
 const c=input.estimateContext;
 return input.summary.length<=10000&&input.missingFields.length<=30&&(input.serviceWanted?.length??0)<=1000&&(!c||((c.inspectionFindings?.length??0)<=6000&&(c.mechanicNotes?.length??0)<=20&&(c.mechanicNotes??[]).every(n=>typeof n==='string'&&n.length<=3000)&&(!c.requestedServices||(c.requestedServices.length<=100&&c.requestedServices.every(s=>typeof s==='string'&&s.length<=10000)))&&c.catalog.length<=500&&c.catalog.every(o=>typeof o.key==='string'&&o.key.length<=100&&typeof o.code==='string'&&o.code.length<=200&&typeof o.name==='string'&&o.name.length<=1000&&typeof o.unit==='string'&&o.unit.length<=100)&&(!c.vehicle||c.vehicle.make.length<=200&&c.vehicle.model.length<=200)));
}
/** Model selects only supplied Quibi references; prices, VAT and approval remain outside AI. */
export async function analyzeIntake(input:IntakeAnalysisInput,provider?:IntakeAnalysisProvider):Promise<IntakeAnalysisResult>{
 const base={missingFields:[...new Set(input.missingFields)],reviewRequired:true as const,canSend:false as const,analysis:null,serviceSuggestions:[] as string[],estimateLines:[] as IntakeEstimateLine[],serviceMatches:[] as IntakeServiceMatch[]};
 if(!provider)return {...base,status:'unavailable',draft:null};
 try{
  if(!validIntakeAnalysisInput(input))throw Error('INVALID_INPUT');
  const reply=await provider.analyze(structuredClone({...input,missingFields:base.missingFields}));
  if(!reply||typeof reply!=='object'||!('draft' in reply)||typeof reply.draft!=='string'||!reply.draft.trim()||reply.draft.length>4000)throw Error('INVALID_REPLY');
  const analysis='analysis' in reply?reply.analysis:null;
  const suggestions='serviceSuggestions' in reply?reply.serviceSuggestions:[];
  if(analysis!==null&&(typeof analysis!=='string'||analysis.length>4000)||!Array.isArray(suggestions)||suggestions.length>6||suggestions.some(s=>typeof s!=='string'||!s.trim()||s.length>200))throw Error('INVALID_REPLY');
  const lines='estimateLines' in reply?reply.estimateLines:[];
  const keys=new Set<string>();
  if(!Array.isArray(lines)||lines.length>20)throw Error('INVALID_LINES');
  const estimateLines:IntakeEstimateLine[]=lines.map(line=>{
   if(!line||typeof line!=='object'||typeof line.key!=='string'||keys.has(line.key)||!input.estimateContext?.catalog.some(o=>o.key===line.key)||line.quantity!==null&&(typeof line.quantity!=='number'||!Number.isFinite(line.quantity)||line.quantity<=0||line.quantity>100000))throw Error('INVALID_LINE');
   keys.add(line.key);return {key:line.key,quantity:line.quantity};
  });
  const rawMatches='serviceMatches' in reply?reply.serviceMatches:[];
  if(!Array.isArray(rawMatches)||rawMatches.length>100)throw Error('INVALID_MATCHES');
  const seen=new Set<string>();
  const serviceMatches:IntakeServiceMatch[]=rawMatches.map(match=>{
   const catalog=input.estimateContext?.catalog??[];
   if(!match||typeof match!=='object'||!input.estimateContext?.requestedServices?.includes(match.requestedService)||seen.has(match.requestedService)||!['high','uncertain'].includes(match.confidence)||match.key!==null&&!catalog.some(o=>o.key===match.key)||!Array.isArray(match.alternatives)||match.alternatives.length>3||match.alternatives.some((key:unknown)=>typeof key!=='string'||!catalog.some(o=>o.key===key)))throw Error('INVALID_MATCH');
   seen.add(match.requestedService);
   return {requestedService:match.requestedService,key:match.key,confidence:match.confidence,alternatives:[...new Set<string>(match.alternatives)]};
  });
  return {...base,status:'draft',draft:reply.draft.trim(),analysis:typeof analysis==='string'?analysis.trim():null,serviceSuggestions:suggestions.map(s=>s.trim()),estimateLines,serviceMatches};
 }catch{return {...base,status:'failed',draft:null}}
}
