import {buildEstimateBody,stableEstimatePayload,type CreateEstimateInput,type EstimateBody} from './write-contract.ts';
import {loadQuibiDocument,type QuibiDocumentKind} from './document-read.ts';
import type {OperationJournal} from './write-workflow.ts';
import type {QuibiEstimateDetail} from './contracts.ts';
export type BusinessKind='work_order'|'invoice';
export function businessDocumentBody(kind:BusinessKind,orderId:string,input:CreateEstimateInput,serviceDate?:string):EstimateBody{
 if(!['work_order','invoice'].includes(kind)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(orderId))throw Error('QUIBI_INVALID_BUSINESS_INPUT');
 const body=buildEstimateBody(input);
 body.Glavadokumenta.external_id=`selan-work-order:${orderId}:${kind}`;
 if(kind==='invoice'){
  if(!serviceDate||!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)||new Date(`${serviceDate}T00:00:00Z`).toISOString().slice(0,10)!==serviceDate)throw Error('QUIBI_SERVICE_DATE_REQUIRED');
  body.Glavadokumenta.datstod=serviceDate;
 }
 return body;
}
export function assertBusinessStage(kind:BusinessKind,status:string){
 if(status==='closed'||!['open','in_progress','awaiting_parts','ready_for_collection'].includes(status)||(kind==='invoice'&&status!=='ready_for_collection'))throw Error('QUIBI_BUSINESS_STAGE_NOT_READY');
}
export function confirmBusinessContent(doc:QuibiEstimateDetail,body:EstimateBody){
 if(doc.customerId!==String(body.Glavadokumenta.stranka_id)||doc.vehicleId!==String(body.Glavadokumenta.vozila_id)||doc.externalId!==body.Glavadokumenta.external_id||doc.numberingId!==String(body.Glavadokumenta.stevilcenje_id)||!doc.number||!/^[a-f0-9]{64}$/.test(doc.contentSha256))throw Error('QUIBI_DOCUMENT_REREAD_MISMATCH');
 const lines=Object.values(body.Postavkedokumenta);
 if(lines.length!==doc.lines.length||lines.some((line,i)=>!('opis' in line)||line.opis.trim()!==doc.lines[i].description.trim()||line.kolicina!==Number(doc.lines[i].quantity)||line.cenaZDDV!==Number(doc.lines[i].grossPrice)||line.enota_id!==doc.lines[i].unitId||line.ddv_id!==doc.lines[i].vatId||doc.lines[i].discount==null||Number(doc.lines[i].discount)!==line.popust))throw Error('QUIBI_DOCUMENT_LINES_MISMATCH');
}
type Reader={workOrders:(id:string)=>Promise<{id:string}[]>;invoices:(id:string)=>Promise<{id:string}[]>;estimates:(id:string)=>Promise<{id:string}[]>;documentDetail:(id:string,customerId:string)=>Promise<QuibiEstimateDetail>};
export async function createBusinessDocument(args:{kind:BusinessKind;orderId:string;caseId:string;expectedAmount:string;body:EstimateBody;journal:OperationJournal;read:Reader;write:{createEstimate:(body:EstimateBody)=>Promise<{id:string;number:string}>}}){
 const {kind,body,journal,read}=args;
 if(!['work_order','invoice'].includes(kind)||body.Glavadokumenta.external_id!==`selan-work-order:${args.orderId}:${kind}`||'id' in body.Glavadokumenta)throw Error('QUIBI_INVALID_BUSINESS_INPUT');
 const payload=stableEstimatePayload(body);
 const op=await journal.insertOnce({kind,localEntityId:args.orderId,serviceRequestId:args.caseId,externalId:body.Glavadokumenta.external_id,requestBody:payload.json,requestSha256:payload.sha256});
 if(op.requestBody!==payload.json||op.requestSha256!==payload.sha256)throw Error('QUIBI_CREATE_CHANGED_REQUIRES_UPDATE');
 const reread=async(id:string)=>{const doc=await loadQuibiDocument(read,kind as QuibiDocumentKind,id,String(body.Glavadokumenta.stranka_id));confirmBusinessContent(doc,body);if(Number(doc.amount)!==Number(args.expectedAmount)||!Number.isFinite(Number(args.expectedAmount)))throw Error('QUIBI_DOCUMENT_AMOUNT_MISMATCH');if(op.documentNumber&&doc.number!==op.documentNumber)throw Error('QUIBI_DOCUMENT_NUMBER_MISMATCH');return doc};
 if(op.state==='verified'){
  if(!op.quibiId)throw Error('QUIBI_DOCUMENT_UNVERIFIED');const doc=await reread(op.quibiId);
  if(doc.contentSha256!==op.quibiContentSha256)throw Error('QUIBI_DOCUMENT_CHANGED');return op;
 }
 if(op.state==='uncertain'&&op.quibiId){const doc=await reread(op.quibiId);return journal.patch(op.id,'uncertain',{state:'verified',quibiContentSha256:doc.contentSha256})}
 if(op.state!=='prepared'||!await journal.claim(op.id,'prepared'))throw Error('QUIBI_OPERATION_REQUIRES_RECONCILIATION');
 try{
  const result=await args.write.createEstimate(JSON.parse(op.requestBody) as EstimateBody);
  await journal.patch(op.id,'dispatching',{state:'uncertain',quibiId:result.id,documentNumber:result.number});
  const doc=await reread(result.id);if(doc.number!==result.number)throw Error('QUIBI_DOCUMENT_NUMBER_MISMATCH');
  return journal.patch(op.id,'uncertain',{state:'verified',quibiContentSha256:doc.contentSha256});
 }catch(cause){await journal.patch(op.id,'dispatching',{state:'uncertain'}).catch(()=>undefined);throw cause}
}
