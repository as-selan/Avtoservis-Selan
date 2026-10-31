import {quibiWorkflowConfig} from '../quibi/workflow-config.ts';
/** This opt-in never selects a live Quibi endpoint or a hosted database. */
export function localSyntheticQaAllowed(env:Record<string,string|undefined>):boolean {
 try{return env.SELAN_LOCAL_REVIEW==='1' && env.QUIBI_E2E_WRITE_ENABLED==='1' && quibiWorkflowConfig(env,'write').origin===env.QUIBI_E2E_ORIGIN}catch{return false}
}
export const isSyntheticQaReference=(reference:unknown)=>typeof reference === "string" && /^QA-SIM-[A-Z0-9-]{4,190}$/i.test(reference.trim());
