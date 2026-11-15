import type {QuibiCatalogKind} from './catalog-read.ts';
type Reader={paymentMethods:()=>Promise<string[]>;catalog:(kind:QuibiCatalogKind)=>Promise<{id:string;label:string}[]>};
/** Fresh company catalogs, never a payment method or space borrowed from another invoice. */
export async function verifiedInvoiceHeader(read:Reader,numberingId:string,selected:{spaceId?:string;paymentMethod?:string;sourceSpaceId?:string;sourcePaymentMethod?:string;paymentOptional?:boolean}={}){
 if(!/^[1-9]\d*$/.test(numberingId))throw Error('QUIBI_INVOICE_CONFIGURATION_UNVERIFIED');
 const methods=await read.paymentMethods(),spaces=await read.catalog('spaces');
 if(!methods.length||!spaces.length)throw Error('QUIBI_INVOICE_CONFIGURATION_UNVERIFIED');
 const spaceId=selected.spaceId||(spaces.some(s=>s.id===selected.sourceSpaceId)?selected.sourceSpaceId:'')||(spaces.length===1?spaces[0].id:''),paymentMethod=selected.paymentMethod||(selected.sourcePaymentMethod&&methods.includes(selected.sourcePaymentMethod)?selected.sourcePaymentMethod:'')||(!selected.paymentOptional&&methods.length===1?methods[0]:'');
 if(spaceId&&!spaces.some(s=>s.id===spaceId)||paymentMethod&&!methods.includes(paymentMethod))throw Error('QUIBI_INVOICE_CONFIGURATION_UNVERIFIED');
 return {spaceId,paymentMethod,spaces,paymentMethods:methods,ready:!!spaceId&&(!!paymentMethod||selected.paymentOptional===true)};
}
