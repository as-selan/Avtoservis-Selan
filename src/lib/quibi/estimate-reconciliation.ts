import {createHash} from 'node:crypto';
import type {QuibiEstimateDetail} from './contracts.ts';
import type {EstimateBody} from './write-contract.ts';
import type {OperationJournal} from './write-workflow.ts';
import {quibiSourceNotes} from './business-source-lines.ts';
export type ReconciliationRead={estimates:(customerId:string)=>Promise<{id:string}[]>;estimateDetail:(id:string,customerId:string)=>Promise<QuibiEstimateDetail>};
/** Never has a write client. Absence and incomplete evidence never unlock CREATE. */
export async function reconcileEstimate(read:ReconciliationRead,journal:OperationJournal,caseId:string){
 const op=await journal.get('estimate',caseId);
 if(!op)return {outcome:'none' as const};
 if(op.state!=='uncertain')return {outcome:'blocked' as const};
 const body=JSON.parse(op.requestBody) as EstimateBody;
 if(op.serviceRequestId!==caseId||op.localEntityId!==caseId||createHash('sha256').update(op.requestBody).digest('hex')!==op.requestSha256||body.Glavadokumenta.external_id!==op.externalId||op.externalId!=='selan-service-request:'+caseId)throw Error('QUIBI_JOURNAL_INTEGRITY');
 const customer=String(body.Glavadokumenta.stranka_id),listed=await read.estimates(customer),found:QuibiEstimateDetail[]=[];let incomplete=false;
 for(let i=0;i<listed.length;i+=4){const results=await Promise.allSettled(listed.slice(i,i+4).map(r=>read.estimateDetail(r.id,customer)));for(let j=0;j<results.length;j++){const result=results[j];if(result.status==='rejected'){incomplete=true;continue;}const doc=result.value;if(doc.id!==listed[i+j].id||doc.customerId!==customer){incomplete=true;continue;}if(doc.externalId===op.externalId)found.push(doc);}}
 if(incomplete)return {outcome:'incomplete' as const};
 if(found.length!==1)return {outcome:found.length?'ambiguous' as const:'not_found' as const};
 const doc=found[0],actual=doc.lines.filter(l=>!quibiSourceNotes(doc).includes(l)),posted=Object.values(body.Postavkedokumenta);
 if(doc.id==='2176888'||op.quibiId&&op.quibiId!==doc.id||doc.vehicleId!==String(body.Glavadokumenta.vozila_id)||doc.numberingId!==String(body.Glavadokumenta.stevilcenje_id)||!doc.number||!Number.isFinite(Number(doc.amount))||!doc.contentSha256.match(/^[a-f0-9]{64}$/)||actual.length!==posted.length)return {outcome:'review' as const,documentId:doc.id};
 for(let i=0;i<posted.length;i++){const line=posted[i],remote=actual[i],net='sifra' in line?line.cena:line.cenaZDDV;if(net==null||!remote.pricingVerified||Number(remote.unitNetPrice)!==net||Number(remote.quantity)!==line.kolicina||remote.vatId!==line.ddv_id||remote.discount==null||Number(remote.discount)!==(line.popust??0)||('sifra' in line?remote.articleCode!==line.sifra:remote.unitId!==line.enota_id||remote.description.trim()!==line.opis.trim()))return {outcome:'review' as const,documentId:doc.id};}
 if(actual.some(line=>line.unitGrossPrice==null||!Number.isFinite(Number(line.unitGrossPrice))))return {outcome:'review' as const,documentId:doc.id};
 const total=Math.round(actual.reduce((sum,line)=>sum+Number(line.unitGrossPrice)*Number(line.quantity)*(1-Number(line.discount)/100),0)*100);
 if(total!==Math.round(Number(doc.amount)*100))return {outcome:'review' as const,documentId:doc.id};
 const latest=await read.estimateDetail(doc.id,customer);if(latest.contentSha256!==doc.contentSha256)throw Error('QUIBI_DOCUMENT_CHANGED');
 await journal.patch(op.id,'uncertain',{state:'verified',quibiId:doc.id,documentNumber:doc.number,quibiContentSha256:doc.contentSha256});
 return {outcome:'verified' as const,documentId:doc.id};
}
