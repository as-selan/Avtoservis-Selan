import type {QuibiEstimateDetail} from './contracts.ts';
export const extraDocumentPaths={credit_note:'/api2/dobropisi',delivery_note:'/api2/dobavnice',goods_receipt:'/api2/prevzemnice',purchase_order:'/api2/narocilnice',advance_invoice:'/api2/predplacila',customer_order:'/api2/narocilakupcev',issue_note:'/api2/izdajnice'} as const;
export type ExtraDocumentKind=keyof typeof extraDocumentPaths;
export type QuibiDocumentKind='work_order'|'invoice'|'estimate'|ExtraDocumentKind;
export const documentKindLabels:Record<QuibiDocumentKind,string>={work_order:'Delovni nalog',invoice:'Račun',estimate:'Predračun',credit_note:'Dobropis',delivery_note:'Dobavnica',goods_receipt:'Prevzemnica',purchase_order:'Naročilnica',advance_invoice:'Avansni račun',customer_order:'Naročilo kupca',issue_note:'Izdajnica'};
type Reader={documents?:(kind:ExtraDocumentKind,id:string)=>Promise<{id:string}[]>;workOrders:(id:string)=>Promise<{id:string}[]>;invoices:(id:string)=>Promise<{id:string}[]>;estimates:(id:string)=>Promise<{id:string}[]>;documentDetail:(id:string,customerId:string)=>Promise<QuibiEstimateDetail>};
export async function loadQuibiDocument(client:Reader,kind:QuibiDocumentKind,id:string,customerId:string){
 if(!/^\d+$/.test(id)||!/^\d+$/.test(customerId)||!Object.hasOwn(documentKindLabels,kind))throw Error('QUIBI_INVALID_DOCUMENT');
 const list=await (kind==='work_order'?client.workOrders(customerId):kind==='invoice'?client.invoices(customerId):kind==='estimate'?client.estimates(customerId):client.documents?client.documents(kind,customerId):Promise.reject(Error('QUIBI_DOCUMENT_KIND_UNAVAILABLE')));
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
