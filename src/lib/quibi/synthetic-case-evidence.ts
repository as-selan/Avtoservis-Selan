import {hostedQuibiEnvironment} from './deployment-policy';
type CaseData={caseId?:string;description?:string|null;name?:string|null;email?:string|null;vin?:string|null};
/** Explicit fixture identity, never a generic TEST name or an ordinary customer. */
export function syntheticCaseEvidenceAllowed(env:Record<string,string|undefined>,data:CaseData){
 try{if(hostedQuibiEnvironment(env)!=='dev')return false;}catch{return false;}
 const marked=!!data.description?.startsWith('QA-SIM-')&&!!data.name?.startsWith('TEST-')&&!!data.email?.endsWith('@example.test')&&!!data.vin?.startsWith('TEST');
 const a73=data.caseId==='a73db6be-7216-4677-bc0a-26e97693ad75'&&data.name==='TEST SELAN SPLET 24-10'&&data.vin==='TESTSELANBX202602'&&data.email==='selan.test.2410@example.com'&&!!data.description?.startsWith('TESTNO POVPRAŠEVANJE – AVTOSERVIS SELAN');
 return marked||a73;
}
