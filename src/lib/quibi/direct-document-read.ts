import {isHostedQuibiEnvironment} from './deployment-policy.ts';
import {loadQuibiDocument,documentKindLabels,type QuibiDocumentKind} from './document-read.ts';
 type Reader=Parameters<typeof loadQuibiDocument>[0]&{customer:(id:string)=>Promise<{id:string}>;documentPdf:(id:string)=>Promise<Uint8Array>};
 export type DirectDocumentScope={customerId:string;documentId:string;kind:string};
 export function assertDirectDevRead(env:Record<string,string|undefined>,role:string,scope:DirectDocumentScope){
  if(!isHostedQuibiEnvironment(env)||!['owner','admin','reception'].includes(role))throw Error('QUIBI_DIRECT_READ_FORBIDDEN');
  if(![scope.customerId,scope.documentId].every(id=>/^[1-9][0-9]{0,14}$/.test(id)&&Number.isSafeInteger(Number(id)))||!Object.hasOwn(documentKindLabels,scope.kind))throw Error('QUIBI_INVALID_DOCUMENT');
 }
 export async function loadDirectDevDocument(read:Reader,scope:DirectDocumentScope){
  const customer=await read.customer(scope.customerId);if(customer.id!==scope.customerId)throw Error('QUIBI_DOCUMENT_CUSTOMER_MISMATCH');
  return loadQuibiDocument(read,scope.kind as QuibiDocumentKind,scope.documentId,scope.customerId);
 }
 export async function loadDirectDevPdf(read:Reader,scope:DirectDocumentScope){await loadDirectDevDocument(read,scope);return read.documentPdf(scope.documentId);}

export function assertDirectDevVehicleRead(env:Record<string,string|undefined>,role:string,customerId:string,vehicleId:string){
 if(!isHostedQuibiEnvironment(env)||!['owner','admin','reception'].includes(role))throw Error('QUIBI_DIRECT_READ_FORBIDDEN');
 if(![customerId,vehicleId].every(id=>/^[1-9][0-9]{0,14}$/.test(id)&&Number.isSafeInteger(Number(id))))throw Error('QUIBI_INVALID_VEHICLE');
}
