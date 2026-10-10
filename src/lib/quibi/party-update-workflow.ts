import {isDefinitiveQuibiRejection} from './send-outcome.ts';
import {createHash} from 'node:crypto';
import type {OperationJournal} from './write-workflow.ts';
export async function updatePartyAndVerify(args:{kind:'customer_update'|'vehicle_update';revisionId:string;caseId:string;quibiId:string;baseline:string;target:string;body:object;journal:OperationJournal;readFingerprint:()=>Promise<string>;write:()=>Promise<unknown>}){
 const {journal}=args;
 if(!/^[a-f0-9-]{36}$/i.test(args.revisionId)||!/^\d+$/.test(args.quibiId)||!['customer_update','vehicle_update'].includes(args.kind)||![args.baseline,args.target].every(s=>/^[a-f0-9]{64}$/.test(s)))throw Error('QUIBI_INVALID_PARTY_UPDATE');
 const requestBody=JSON.stringify({quibiId:args.quibiId,baseline:args.baseline,target:args.target,body:args.body});
 const requestSha256=createHash('sha256').update(requestBody).digest('hex');
 let op=await journal.get(args.kind,args.revisionId);
 if(op&&(op.requestBody!==requestBody||op.requestSha256!==requestSha256))throw Error('QUIBI_UPDATE_CHANGED');
 const current=await args.readFingerprint();
 if(op?.state==='verified'){if(current!==args.target)throw Error('QUIBI_PARTY_CHANGED');return op}
 if(op?.state==='uncertain'){
  if(current!==args.target||args.target===args.baseline)throw Error('QUIBI_UPDATE_REQUIRES_RECONCILIATION');
  return journal.patch(op.id,'uncertain',{state:'verified',quibiId:args.quibiId});
 }
 if(current!==args.baseline)throw Error('QUIBI_PARTY_CHANGED');
 op??=await journal.insertOnce({kind:args.kind,localEntityId:args.revisionId,serviceRequestId:args.caseId,externalId:null,requestBody,requestSha256});
 if(op.requestBody!==requestBody||op.state!=='prepared'||!await journal.claim(op.id,'prepared'))throw Error('QUIBI_UPDATE_REQUIRES_RECONCILIATION');
 let rejected:unknown=null;
 try{await args.write()}catch(error){rejected=error}
 await journal.patch(op.id,'dispatching',{state:'uncertain',quibiId:args.quibiId});
 if(isDefinitiveQuibiRejection(rejected)){await journal.patch(op.id,'uncertain',{state:'failed'});throw Error('QUIBI_UPDATE_REJECTED')}
 if(rejected&&args.target===args.baseline)throw Error('QUIBI_UPDATE_REQUIRES_RECONCILIATION');
 if(await args.readFingerprint()!==args.target)throw Error('QUIBI_UPDATE_REQUIRES_RECONCILIATION');
 return journal.patch(op.id,'uncertain',{state:'verified'});
}
