import type {QuibiEstimateDetail} from './contracts.ts';
import {quibiSourceNotes} from './business-source-lines.ts';

type Line = QuibiEstimateDetail['lines'][number];
type Evidence = {decision:string; completed:boolean; operationState:string; documentId:string; documentSha:string; line:Line};

// Match the full commercial identity, not just the article code or the total.
function lineKey(line:Line):string|null {
 if(!line.pricingVerified || !line.unitId || !line.vatId || line.unitNetPrice==null || line.discount==null || !line.quantity) return null;
 const numbers=[line.quantity,line.unitNetPrice,line.discount].map(Number);
 if(numbers.some(n=>!Number.isFinite(n)) || numbers[0]<=0 || numbers[1]<0 || numbers[2]<0 || numbers[2]>100) return null;
 return JSON.stringify([line.articleId??'',line.articleCode??'',line.articleId||line.articleCode?'':line.description.trim(),...numbers.slice(0,1),line.unitId,line.vatId,...numbers.slice(1)]);
}

/** Fail closed unless every changed line is accounted for exactly once. */
export function findingInvoiceEvidenceCovers(approved:QuibiEstimateDetail,order:QuibiEstimateDetail,evidence:Evidence[]):boolean {
 if(approved.customerId!==order.customerId || !approved.vehicleId || approved.vehicleId!==order.vehicleId || !evidence.length) return false;
 const keys=(doc:QuibiEstimateDetail)=>doc.lines.filter(line=>!quibiSourceNotes(doc).includes(line)).map(lineKey);
 const before=keys(approved), after=keys(order);
 if(before.includes(null)||after.includes(null)) return false;
 const remaining=after.slice();
 for(const key of before){const index=remaining.indexOf(key);if(index<0)return false;remaining.splice(index,1);}
 for(const item of evidence){
  if(item.decision!=='approved'||!item.completed||item.operationState!=='verified'||item.documentId!==order.id||item.documentSha!==order.contentSha256)return false;
  const key=lineKey(item.line);if(!key)return false;
  const index=remaining.indexOf(key);if(index<0)return false;remaining.splice(index,1);
 }
 return remaining.length===0;
}
