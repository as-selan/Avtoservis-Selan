import Link from 'next/link';
import {CasePrimaryAction} from './CasePrimaryAction';
export function QuibiIssuedInvoice({caseId,customerId,invoice}:{caseId:string;customerId:string;invoice:{id:string;number?:string;amount:string}}){
 const issued=!!invoice.number&&invoice.number!=='Osnutek';
 return <section className="space-y-3" aria-label="Izdani račun">
  <h3 className="text-xl font-semibold">{issued?'Račun izdan':'Račun še ni izdan'}</h3>
  <p>{invoice.number} · {Number(invoice.amount).toLocaleString('sl-SI',{style:'currency',currency:'EUR'})}</p>
  <a className="block text-blue-700 underline" target="_blank" rel="noopener noreferrer" href={'/api/quibi/stranke/'+customerId+'/dokumenti/invoice/'+invoice.id+'/pdf'}>Odpri PDF</a>
  {issued&&<CasePrimaryAction inline><Link className="flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-700 px-4 py-3 font-medium text-white" href={'/dashboard/primeri/'+caseId+'#prevzem'}>Prevzem vozila</Link></CasePrimaryAction>}
 </section>;
}
