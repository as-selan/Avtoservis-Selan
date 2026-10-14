import {isDefinitiveQuibiRejection} from './send-outcome.ts';
import {quibiSourceNotes} from './business-source-lines.ts';
import {createHash} from 'node:crypto';
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
export function confirmBusinessContent(doc:QuibiEstimateDetail,body:EstimateBody,expectedUnitNetPrices?:number[],expectedUnitIds?:string[]){
 if((body.Glavadokumenta.space_id&&doc.spaceId!==String(body.Glavadokumenta.space_id))||(body.Glavadokumenta.nacinPlacila&&doc.paymentMethod!==body.Glavadokumenta.nacinPlacila)||doc.customerId!==String(body.Glavadokumenta.stranka_id)||doc.vehicleId!==String(body.Glavadokumenta.vozila_id)||doc.externalId!==body.Glavadokumenta.external_id||doc.numberingId!==String(body.Glavadokumenta.stevilcenje_id)||!doc.number||!/^[a-f0-9]{64}$/.test(doc.contentSha256))throw Error('QUIBI_DOCUMENT_REREAD_MISMATCH');
 const lines=Object.values(body.Postavkedokumenta),actual=doc.lines.filter(l=>!quibiSourceNotes(doc).includes(l));
 if(lines.length!==actual.length||lines.some((line,i)=>{
 const current=actual[i];if(!current.pricingVerified||current.unitNetPrice==null||line.kolicina!==Number(current.quantity)||line.ddv_id!==current.vatId||current.discount==null||Number(current.discount)!==(line.popust??0))return true;
 if('sifra' in line)return (expectedUnitIds!=null&&current.unitId!==expectedUnitIds[i])||current.articleCode!==line.sifra||(line.opis!=null&&line.opis.trim()!==current.description.trim())||Number(current.unitNetPrice)!==(line.cena??expectedUnitNetPrices?.[i]);
 return line.opis.trim()!==current.description.trim()||line.cenaZDDV!==Number(current.unitNetPrice)||line.enota_id!==current.unitId;
 }))throw Error('QUIBI_DOCUMENT_LINES_MISMATCH');
}
type Reader={documentPdf?:(id:string)=>Promise<unknown>;workOrders:(id:string)=>Promise<{id:string}[]>;invoices:(id:string)=>Promise<{id:string}[]>;estimates:(id:string)=>Promise<{id:string}[]>;documentDetail:(id:string,customerId:string)=>Promise<QuibiEstimateDetail>};
export async function createBusinessDocument(args:{kind:BusinessKind;orderId:string;caseId:string;expectedAmount:string;retryOperationId?:string;expectedUnitNetPrices?:number[];expectedUnitIds?:string[];body:EstimateBody;journal:OperationJournal;read:Reader;write:{createEstimate:(body:EstimateBody)=>Promise<{id:string;number:string}>}}){
 const {kind,body,journal,read}=args;
 if(!['work_order','invoice'].includes(kind)||body.Glavadokumenta.external_id!==`selan-work-order:${args.retryOperationId??args.orderId}:${kind}`||'id' in body.Glavadokumenta)throw Error('QUIBI_INVALID_BUSINESS_INPUT');
 const payload=stableEstimatePayload(body);
 if(args.retryOperationId){const rejected=await journal.get(kind,args.orderId);if(kind!=='invoice'||!rejected||rejected.id!==args.retryOperationId||rejected.state!=='failed'||rejected.quibiId)throw Error('QUIBI_REJECTED_RETRY_UNVERIFIED');const old=JSON.parse(rejected.requestBody) as EstimateBody;if((old.Glavadokumenta.space_id&&old.Glavadokumenta.nacinPlacila)||!body.Glavadokumenta.space_id||!body.Glavadokumenta.nacinPlacila)throw Error('QUIBI_REJECTED_RETRY_UNVERIFIED');const unchanged=(b:EstimateBody)=>JSON.stringify({...b,Glavadokumenta:Object.fromEntries(Object.entries(b.Glavadokumenta).filter(([k])=>!['external_id','space_id','nacinPlacila'].includes(k)))});if(unchanged(old)!==unchanged(body))throw Error('QUIBI_REJECTED_RETRY_UNVERIFIED')}
 const op=await journal.insertOnce({kind,localEntityId:args.retryOperationId??args.orderId,serviceRequestId:args.caseId,externalId:body.Glavadokumenta.external_id,requestBody:payload.json,requestSha256:payload.sha256});
 if(op.requestBody!==payload.json||op.requestSha256!==payload.sha256)throw Error('QUIBI_CREATE_CHANGED_REQUIRES_UPDATE');
 const reread=async(id:string)=>{const doc=await loadQuibiDocument(read,kind as QuibiDocumentKind,id,String(body.Glavadokumenta.stranka_id));confirmBusinessContent(doc,body,args.expectedUnitNetPrices,args.expectedUnitIds);if(Number(doc.amount)!==Number(args.expectedAmount)||!Number.isFinite(Number(args.expectedAmount)))throw Error('QUIBI_DOCUMENT_AMOUNT_MISMATCH');if(op.documentNumber&&doc.number!==op.documentNumber&&!(kind==='invoice'&&op.documentNumber==='Osnutek'))throw Error('QUIBI_DOCUMENT_NUMBER_MISMATCH');return doc};
 if(op.state==='verified'){
  if(!op.quibiId)throw Error('QUIBI_DOCUMENT_UNVERIFIED');const doc=await reread(op.quibiId);
  if(doc.contentSha256!==op.quibiContentSha256)throw Error('QUIBI_DOCUMENT_CHANGED');return op;
 }
 if(op.state==='uncertain'&&op.quibiId){const doc=await reread(op.quibiId);if(kind==='invoice'&&doc.number==='Osnutek')throw Error('QUIBI_INVOICE_STILL_DRAFT');return journal.patch(op.id,'uncertain',{state:'verified',documentNumber:doc.number,quibiContentSha256:doc.contentSha256})}
 if(op.state!=='prepared'||!await journal.claim(op.id,'prepared'))throw Error('QUIBI_OPERATION_REQUIRES_RECONCILIATION');
 try{
  const result=await args.write.createEstimate(JSON.parse(op.requestBody) as EstimateBody);
  await journal.patch(op.id,'dispatching',{state:'uncertain',quibiId:result.id,documentNumber:result.number});
  await reread(result.id);
  if(read.documentPdf)await read.documentPdf(result.id);
  const doc=await reread(result.id);if(doc.number!==result.number&&!(kind==='invoice'&&result.number==='Osnutek'))throw Error('QUIBI_DOCUMENT_NUMBER_MISMATCH');if(kind==='invoice'&&doc.number==='Osnutek')throw Error('QUIBI_INVOICE_STILL_DRAFT');
  return journal.patch(op.id,'uncertain',{state:'verified',documentNumber:doc.number,quibiContentSha256:doc.contentSha256});
 }catch(cause){const uncertain=await journal.patch(op.id,'dispatching',{state:'uncertain'}).catch(()=>null);if(uncertain&&isDefinitiveQuibiRejection(cause))await journal.patch(op.id,'uncertain',{state:'failed'}).catch(()=>undefined);throw cause}
}

/** Only changed business lines justify a write; unchanged data is not WRITE evidence. */
export function assertBusinessUpdateChanges(doc:QuibiEstimateDetail,body:EstimateBody,expectedUnitNetPrices?:number[],expectedUnitIds?:string[]){
 try{confirmBusinessContent(doc,body,expectedUnitNetPrices,expectedUnitIds)}catch(error){if(error instanceof Error&&error.message==='QUIBI_DOCUMENT_LINES_MISMATCH')return;throw error}
 throw Error('QUIBI_NO_BUSINESS_CHANGES');
}
/** Includes the baseline in the immutable request; reconciliation cannot adopt another version. */
export function businessUpdatePayload(body:EstimateBody,baselineSha:string){
 if(!/^[a-f0-9]{64}$/.test(baselineSha)||!Number.isSafeInteger(body.Glavadokumenta.id)||!body.Glavadokumenta.id)throw Error('QUIBI_INVALID_BUSINESS_UPDATE');
 const json=JSON.stringify({baselineSha,body});
 const sha256=createHash('sha256').update(json).digest('hex');
 const revisionId=[sha256.slice(0,8),sha256.slice(8,12),sha256.slice(12,16),sha256.slice(16,20),sha256.slice(20,32)].join('-');
 return {json,sha256,revisionId};
}
export async function updateBusinessDocument(args:{kind:BusinessKind;orderId:string;caseId:string;documentId:string;baselineSha:string;expectedSha:string;expectedAmount:string;expectedUnitNetPrices?:number[];expectedUnitIds?:string[];body:EstimateBody;journal:OperationJournal;read:Reader;write:{updateEstimate:(id:string,body:EstimateBody)=>Promise<{id:string;number:string}>}}){
 const {kind,body,journal,read}=args;
 if(!['work_order','invoice'].includes(kind)||String(body.Glavadokumenta.id)!==args.documentId||body.Glavadokumenta.external_id!==['selan-work-order',args.orderId,kind].join(':'))throw Error('QUIBI_INVALID_BUSINESS_UPDATE');
 if(!Number.isFinite(Number(args.expectedAmount))||Number(args.expectedAmount)<0)throw Error('QUIBI_DOCUMENT_AMOUNT_MISMATCH');
 const payload=businessUpdatePayload(body,args.baselineSha);
 if(payload.sha256!==args.expectedSha)throw Error('QUIBI_PREPARED_PAYLOAD_CHANGED');
 const op=await journal.insertOnce({kind:kind==='invoice'?'invoice_update':'work_order_update',localEntityId:payload.revisionId,serviceRequestId:args.caseId,externalId:null,requestBody:payload.json,requestSha256:payload.sha256});
 if(op.requestBody!==payload.json||op.requestSha256!==payload.sha256)throw Error('QUIBI_PREPARED_PAYLOAD_CHANGED');
 const load=()=>loadQuibiDocument(read,kind,args.documentId,String(body.Glavadokumenta.stranka_id));
 const verify=async()=>{const doc=await load();confirmBusinessContent(doc,body,args.expectedUnitNetPrices,args.expectedUnitIds);if(!Number.isFinite(Number(args.expectedAmount))||Number(doc.amount)!==Number(args.expectedAmount)||doc.number!==op.documentNumber||doc.contentSha256===args.baselineSha)throw Error('QUIBI_DOCUMENT_REREAD_MISMATCH');return doc};
 if(op.state==='verified'){const doc=await verify();if(doc.contentSha256!==op.quibiContentSha256)throw Error('QUIBI_DOCUMENT_CHANGED');return op}
 if(op.state==='uncertain'){if(op.quibiId!==args.documentId)throw Error('QUIBI_OPERATION_REQUIRES_RECONCILIATION');const doc=await verify();return journal.patch(op.id,'uncertain',{state:'verified',quibiContentSha256:doc.contentSha256})}
 if(op.state!=='prepared')throw Error('QUIBI_OPERATION_REQUIRES_RECONCILIATION');
 const before=await load();
 if(before.contentSha256!==args.baselineSha||before.customerId!==String(body.Glavadokumenta.stranka_id)||before.vehicleId!==String(body.Glavadokumenta.vozila_id)||before.numberingId!==String(body.Glavadokumenta.stevilcenje_id)||before.externalId!==body.Glavadokumenta.external_id||!before.number)throw Error('QUIBI_DOCUMENT_CHANGED');
 assertBusinessUpdateChanges(before,body,args.expectedUnitNetPrices,args.expectedUnitIds);
 // Bind before dispatch: the database's active-document index serializes every revision.
 await journal.patch(op.id,'prepared',{quibiId:args.documentId,documentNumber:before.number});
 op.documentNumber=before.number;
 if(!await journal.claim(op.id,'prepared'))throw Error('QUIBI_OPERATION_REQUIRES_RECONCILIATION');
 try{
  const result=await args.write.updateEstimate(args.documentId,body);
  await journal.patch(op.id,'dispatching',{state:'uncertain'});
  if(result.id!==args.documentId||result.number!==before.number)throw Error('QUIBI_DOCUMENT_REREAD_MISMATCH');
  const doc=await verify();
  return journal.patch(op.id,'uncertain',{state:'verified',quibiContentSha256:doc.contentSha256});
 }catch(cause){await journal.patch(op.id,'dispatching',{state:'uncertain'}).catch(()=>undefined);throw cause}
}
