import {buildEstimateBody,stableEstimatePayload,type CreateEstimateInput} from './write-contract.ts';
type Choice={id:string;label:string};
export type EstimateReview = {
 customerId:string; vehicleId:string; numbering:string; saleType:string;
 lines:Array<{description:string;quantity:number;unit:string;vat:string;unitPrice:number;discount:number}>;
 total:number;
};
export function estimatePreparationPayload(input:Omit<CreateEstimateInput,'numberingId'>,catalogs:{numberings:Choice[];saleTypes:Choice[];units:Choice[];vatRates:Choice[]},catalogLines?:EstimateReview['lines']) {
 const matches=catalogs.numberings.filter(n=>n.label.trim().toLocaleLowerCase('sl-SI')==='predračun');
 if(matches.length!==1||!catalogs.saleTypes.some(n=>n.id===input.saleTypeId)||input.lines.some(line=>'opis' in line ? !catalogs.units.some(n=>n.id===line.enota_id)||!catalogs.vatRates.some(n=>n.id===line.ddv_id) : !catalogs.vatRates.some(n=>n.id===line.ddv_id)))throw Error('QUIBI_PREPARATION_CATALOG_MISMATCH');
 const body=buildEstimateBody({...input,numberingId:matches[0].id});
 const lines=Object.values(body.Postavkedokumenta).map((line,index)=>{
 if (!('opis' in line)) {const reviewed=catalogLines?.[index];if(!reviewed||reviewed.quantity!==line.kolicina||reviewed.discount!==(line.popust??0))throw Error('QUIBI_PREPARATION_CATALOG_MISMATCH');return reviewed;}
 return ({
 description:line.opis,quantity:line.kolicina,
 unit:catalogs.units.find(n=>n.id===line.enota_id)!.label,
 vat:catalogs.vatRates.find(n=>n.id===line.ddv_id)!.label,
 unitPrice:line.cenaZDDV,discount:line.popust ?? 0,
 });});
 const review:EstimateReview={customerId:input.customerId,vehicleId:input.vehicleId,
 numbering:matches[0].label,saleType:catalogs.saleTypes.find(n=>n.id===input.saleTypeId)!.label,
 lines,total:Math.round(lines.reduce((sum,line)=>sum+line.quantity*line.unitPrice*(1-line.discount/100),0)*100)/100};
 return {...stableEstimatePayload(body),body,review};
}
