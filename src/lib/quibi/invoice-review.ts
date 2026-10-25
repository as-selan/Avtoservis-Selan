import type {QuibiEstimateDetail} from './contracts.ts';
import {quibiDocumentAmountMatches} from './line-pricing.ts';
import {quibiSourceNotes} from './business-source-lines.ts';
export function invoiceSourceChanges(approved:QuibiEstimateDetail,order:QuibiEstimateDetail){
 if(approved.customerId!==order.customerId||!approved.vehicleId||approved.vehicleId!==order.vehicleId)throw Error('IDENTITY_CHANGED');
 const lines=(doc:QuibiEstimateDetail)=>doc.lines.filter(line=>!quibiSourceNotes(doc).includes(line));
 const key=(line:QuibiEstimateDetail['lines'][number])=>JSON.stringify([line.articleId??'',line.articleCode??'',line.articleId||line.articleCode?'':line.description.trim(),Number(line.quantity),line.unitId,line.vatId,Number(line.unitNetPrice),Number(line.discount)]);
 const changes:string[]=[];const before=lines(approved),after=lines(order);
 if(before.length!==after.length)changes.push(`Število postavk: ${before.length} → ${after.length}`);
 if(before.map(key).sort().join('|')!==after.map(key).sort().join('|'))changes.push('Postavke, količine, cene, DDV ali popusti naloga se razlikujejo od odobrenega predračuna.');
 if(Number(approved.amount)!==Number(order.amount))changes.push(`Odobreno ${approved.amount} EUR → nalog ${order.amount} EUR.`);
 return changes;
}
export function verifyInvoiceSourceTotal(doc:QuibiEstimateDetail){
 const lines=doc.lines.filter(line=>!quibiSourceNotes(doc).includes(line));
 if(!lines.length||lines.some(line=>!line.pricingVerified||line.unitGrossPrice==null||line.discount==null))throw Error('SOURCE_LINE_METADATA_UNSUPPORTED');
 if(!quibiDocumentAmountMatches({...doc,lines}))throw Error('QUIBI_INVOICE_TOTAL_MISMATCH');
 return Number(doc.amount);
}
export function invoiceDates(serviceDate:string,issueDate:string,dueDate:string){
 const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 if(!valid(serviceDate)||!valid(issueDate)||!valid(dueDate)||dueDate<issueDate||serviceDate>issueDate)throw Error('QUIBI_INVOICE_DATES_REQUIRED');
 return {serviceDate,issueDate,dueDate};
}
export function quibiToday(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Ljubljana',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}`;}
export function assertInvoiceEditable(doc:Pick<QuibiEstimateDetail,'number'|'fiscalized'>){if(doc.fiscalized||doc.number!=='Osnutek')throw Error('QUIBI_ISSUED_INVOICE_READ_ONLY');}
export function verifyReturnedInvoiceDates(doc:QuibiEstimateDetail,header:{datstod?:string;datIzdRac?:string;datValute?:string}){
 const normalize=(s:string)=>{const m=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:s};
 for(const [expected,actual] of [[header.datstod,doc.serviceDate],[header.datIzdRac,doc.date],[header.datValute,doc.dueDate]])if(expected&&actual&&normalize(actual)!==expected)throw Error('QUIBI_DOCUMENT_DATES_MISMATCH');
}
