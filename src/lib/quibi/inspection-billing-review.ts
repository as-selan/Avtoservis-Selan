import {createHash} from 'node:crypto';
/** Review token only; never an issuance permission or a local invoice. */
export function inspectionBillingReview(input:{caseId:string;customerId:string;vehicleId:string;findings:string;sourceSha:string;quantity:number;total:number}){
 if(!/^[a-f0-9]{64}$/.test(input.sourceSha)||!Number.isFinite(input.quantity)||input.quantity<=0||!Number.isFinite(input.total)||input.total<0)throw Error('INSPECTION_SOURCE_UNVERIFIED');
 return {sha:createHash('sha256').update(JSON.stringify(input)).digest('hex'),reference:'selan-inspection:'+input.caseId};
}
