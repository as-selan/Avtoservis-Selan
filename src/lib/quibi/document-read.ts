import type {QuibiEstimateDetail} from './contracts.ts';
export type QuibiDocumentKind='work_order'|'invoice'|'estimate';
export const documentKindLabels:Record<QuibiDocumentKind,string>={work_order:'Delovni nalog',invoice:'Račun',estimate:'Predračun'};
type Reader={workOrders:(id:string)=>Promise<{id:string}[]>;invoices:(id:string)=>Promise<{id:string}[]>;estimates:(id:string)=>Promise<{id:string}[]>;documentDetail:(id:string,customerId:string)=>Promise<QuibiEstimateDetail>};
export async function loadQuibiDocument(client:Reader,kind:QuibiDocumentKind,id:string,customerId:string){
 if(!/^\d+$/.test(id)||!/^\d+$/.test(customerId)||!Object.hasOwn(documentKindLabels,kind))throw Error('QUIBI_INVALID_DOCUMENT');
 const list=await (kind==='work_order'?client.workOrders(customerId):kind==='invoice'?client.invoices(customerId):client.estimates(customerId));
 if(!list.some(doc=>doc.id===id))throw Error('QUIBI_DOCUMENT_NOT_LISTED');
 const doc=await client.documentDetail(id,customerId);
 if(doc.customerId!==customerId||doc.id!==id)throw Error('QUIBI_DOCUMENT_CUSTOMER_MISMATCH');
 return doc;
}
export function verifyWorkOrderDocument(doc:QuibiEstimateDetail,customerId:string,vehicleId:string,displayedSha:string){
 if(doc.customerId!==customerId)throw Error('QUIBI_DOCUMENT_CUSTOMER_MISMATCH');
 if(!doc.vehicleId||doc.vehicleId!==vehicleId)throw Error('QUIBI_DOCUMENT_VEHICLE_UNVERIFIED');
 if(!/^[a-f0-9]{64}$/.test(displayedSha)||doc.contentSha256!==displayedSha)throw Error('QUIBI_DOCUMENT_CONTENT_CHANGED');
}
