import type {QuibiEstimateDetail} from './contracts.ts';
type Reader={paymentMethods:()=>Promise<string[]>;historyDocuments?:(kind:'invoice')=>Promise<{id:string;customerId:string;numberingId:string}[]>;documentDetail:(id:string,customerId:string)=>Promise<QuibiEstimateDetail>};
/** Use only existing Quibi invoice configuration; never borrow customer or line data. */
export async function verifiedInvoiceHeader(read:Reader,numberingId:string){
 if(!read.historyDocuments)throw Error('QUIBI_INVOICE_CONFIGURATION_UNVERIFIED');
 const [methods,listed]=await Promise.all([read.paymentMethods(),read.historyDocuments('invoice')]);
 const candidates=listed.filter(d=>d.numberingId===numberingId).slice(0,12);
 if(!candidates.length)throw Error('QUIBI_INVOICE_CONFIGURATION_UNVERIFIED');
 const details=await Promise.all(candidates.map(d=>read.documentDetail(d.id,d.customerId)));
 if(details.some((d,i)=>d.id!==candidates[i].id||d.customerId!==candidates[i].customerId||d.numberingId!==numberingId||!d.spaceId||!/^[1-9]\d*$/.test(d.spaceId)))throw Error('QUIBI_INVOICE_CONFIGURATION_UNVERIFIED');
 const spaces=new Set(details.map(d=>d.spaceId));if(spaces.size!==1)throw Error('QUIBI_INVOICE_CONFIGURATION_AMBIGUOUS');
 const latest=details[0];if(!latest.paymentMethod||!methods.includes(latest.paymentMethod))throw Error('QUIBI_INVOICE_CONFIGURATION_UNVERIFIED');
 return {spaceId:latest.spaceId!,paymentMethod:latest.paymentMethod,sourceDocumentId:latest.id};
}
