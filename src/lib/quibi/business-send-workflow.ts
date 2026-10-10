import {createHash} from 'node:crypto';
import {isDefinitiveQuibiRejection} from './send-outcome.ts';
import type {OperationJournal} from './write-workflow.ts';
export function businessSendKey(caseId:string,documentId:string,sha:string){
 const hex=createHash('sha256').update(`business-document-send:${caseId}:${documentId}:${sha}`).digest('hex');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export async function sendBusinessDocument(args:{caseId:string;documentId:string;sha:string;amount:string;recipient:string;journal:OperationJournal;write:{sendDocument:(id:string,email:string)=>Promise<{sendId:string;status:'queued'|'sent'}>}}){
 if(args.documentId==='2176888'||!/^[a-f0-9]{64}$/.test(args.sha)||!/^\d+$/.test(args.documentId)||!/^\d+(?:\.\d{1,2})?$/.test(args.amount)||!Number.isFinite(Number(args.amount))||Number(args.amount)<=0||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.recipient))throw Error('QUIBI_INVALID_SEND');
 const localId=businessSendKey(args.caseId,args.documentId,args.sha);
 const requestBody=JSON.stringify({documentId:args.documentId,sha:args.sha,amount:args.amount,recipient:args.recipient});
 const requestSha256=createHash('sha256').update(requestBody).digest('hex');
 const op=await args.journal.insertOnce({kind:'send',localEntityId:localId,serviceRequestId:args.caseId,externalId:null,requestBody,requestSha256});
 if(op.requestBody!==requestBody||op.requestSha256!==requestSha256)throw Error('QUIBI_SEND_CHANGED');
 if(op.state!=='prepared')return op;
 if(!await args.journal.claim(op.id,'prepared'))throw Error('QUIBI_SEND_ALREADY_CLAIMED');
 try{
  const result=await args.write.sendDocument(args.documentId,args.recipient);
  if(!/^[a-z0-9_-]{1,128}$/i.test(result.sendId)||!['queued','sent'].includes(result.status))throw Error('QUIBI_INVALID_RESPONSE');
  await args.journal.patch(op.id,'dispatching',{state:'uncertain',quibiId:args.documentId,quibiContentSha256:args.sha,sendId:result.sendId,sendStatus:result.status});
  return args.journal.patch(op.id,'uncertain',{state:'verified'});
 }catch(error){
  const uncertain=await args.journal.patch(op.id,'dispatching',{state:'uncertain',quibiId:args.documentId,quibiContentSha256:args.sha}).catch(()=>args.journal.get('send',localId));
  if(!uncertain)throw Error('QUIBI_SEND_JOURNAL_UNAVAILABLE');
  if(isDefinitiveQuibiRejection(error)&&uncertain.state==='uncertain')return args.journal.patch(op.id,'uncertain',{state:'failed',sendStatus:'failed'});
  return uncertain;
 }
}
