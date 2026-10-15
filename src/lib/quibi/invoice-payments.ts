import type {QuibiEstimateDetail} from './contracts.ts';
export function moneyCents(value:string){if(!/^-?\d+(?:\.\d+)?$/.test(value)||!Number.isFinite(Number(value)))throw Error('QUIBI_PAYMENT_FORMAT_UNCONFIRMED');const cents=Math.round(Number(value)*100);if(!Number.isSafeInteger(cents)||Math.abs(Number(value)*100-cents)>0.00001)throw Error('QUIBI_PAYMENT_FORMAT_UNCONFIRMED');return cents;}
export function documentPaymentSummary(amount:string,rows:{id:string;amount:string}[]){
 const total=moneyCents(amount),ids=rows.map(r=>r.id).filter(Boolean);if(total<0||new Set(ids).size!==ids.length)throw Error('QUIBI_PAYMENT_FORMAT_UNCONFIRMED');
 const paid=rows.reduce((sum,row)=>sum+moneyCents(row.amount),0);if(!Number.isSafeInteger(paid))throw Error('QUIBI_PAYMENT_FORMAT_UNCONFIRMED');const remaining=total-paid;
 return {total:total/100,paid:paid/100,remaining:remaining/100,status:remaining===0&&rows.length?'Plačan po evidenci Quibija':remaining<0?'Preplačilo po evidenci Quibija':paid>0?'Delno plačan po evidenci Quibija':'Brez evidentiranih plačil v Quibiju'};
}
export function invoiceReadMissing(doc:QuibiEstimateDetail){return [[doc.date,'Datum izdaje'],[doc.serviceDate,'Datum storitve'],[doc.dueDate,'Datum zapadlosti'],[doc.paymentMethod,'Način plačila'],[doc.issuerName,'Izdajatelj'],[doc.buyerName,'Kupec'],[doc.paymentReference,'Plačilni sklic']].filter(([v])=>!v).map(([,label])=>label as string);}
export function invoiceDueStatus(value:string|undefined,remaining:number,today:string){
 if(!value||remaining<=0)return null;const m=value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);const iso=m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:value;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!Number.isFinite(Date.parse(iso+'T00:00:00Z'))||new Date(iso+'T00:00:00Z').toISOString().slice(0,10)!==iso)return null;
 return iso<today?'Preostanek po Quibijevi evidenci je zapadel.':iso===today?'Preostanek po Quibijevi evidenci zapade danes.':'Preostanek po Quibijevi evidenci še ni zapadel.';
}
