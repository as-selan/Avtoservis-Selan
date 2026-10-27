import {caseWorkQuibiEnvironment} from './deployment-policy';
type CaseData={caseId?:string;description?:string|null;name?:string|null;email?:string|null;vin?:string|null};
/** Explicit fixture identity, never a generic TEST name or an ordinary customer. */
export function syntheticCaseEvidenceAllowed(env:Record<string,string|undefined>,data:CaseData){
 try{if(caseWorkQuibiEnvironment(env)!=='dev')return false;}catch{return false;}
 const marked=!!data.description?.startsWith('QA-SIM-')&&!!data.name?.startsWith('TEST-')&&!!data.email?.endsWith('@example.test')&&!!data.vin?.startsWith('TEST');
 const a73=data.caseId==='a73db6be-7216-4677-bc0a-26e97693ad75'&&data.name==='TEST SELAN SPLET 24-10'&&data.vin==='TESTSELANBX202602'&&data.email==='selan.test.2410@example.com'&&!!data.description?.startsWith('TESTNO POVPRAŠEVANJE – AVTOSERVIS SELAN');
 const c066=data.caseId==='c066482d-0002-43c4-9090-b23833928f71'&&data.name==='TEST REA E2E 20261025'&&data.email==='test.rea.e2e.20261025@example.test'&&data.vin==='TESTREA20261025XX'&&data.description==='Sintetični TEST REA E2E – brez dejanske storitve.';
 return marked||a73||c066;
}
