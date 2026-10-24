import {moneyLineCents,vatFactor} from './line-pricing.ts';
import {buildEstimateBody,stableEstimatePayload,type CreateEstimateInput} from './write-contract.ts';
type Choice={id:string;label:string};
export type EstimateReview = {
 customerId:string; vehicleId:string; numbering:string; saleType:string;
 lines:Array<{description:string;quantity:number;unit:string;vat:string;unitPrice:number;discount:number}>;
 total:number;pricingSource?:string;
};
export function estimateReviewTotal(lines:EstimateReview['lines']){
 const cents=lines.reduce((sum,line)=>sum+moneyLineCents(line.quantity,line.unitPrice,line.discount),0);
 if(!Number.isSafeInteger(cents)||cents<0)throw Error('QUIBI_INVALID_ESTIMATE_TOTAL');
 return cents/100;
}
export function estimatePreparationPayload(input:Omit<CreateEstimateInput,'numberingId'>,catalogs:{numberings:Choice[];saleTypes:Choice[];units:Choice[];vatRates:Choice[]},catalogLines?:EstimateReview['lines']) {
 const matches=catalogs.numberings.filter(n=>n.label.trim().toLocaleLowerCase('sl-SI')==='predračun');
 if(matches.length!==1||!catalogs.saleTypes.some(n=>n.id===input.saleTypeId)||input.lines.some(line=>!('sifra' in line) ? !catalogs.units.some(n=>n.id===line.enota_id)||!catalogs.vatRates.some(n=>n.id===line.ddv_id) : !catalogs.vatRates.some(n=>n.id===line.ddv_id)))throw Error('QUIBI_PREPARATION_CATALOG_MISMATCH');
 const body=buildEstimateBody({...input,numberingId:matches[0].id});
 const lines=Object.values(body.Postavkedokumenta).map((line,index)=>{
 if ('sifra' in line) {const reviewed=catalogLines?.[index];if(!reviewed||reviewed.quantity!==line.kolicina||reviewed.discount!==(line.popust??0))throw Error('QUIBI_PREPARATION_CATALOG_MISMATCH');return reviewed;}
 const reviewed=catalogLines?.[index];
 if(reviewed){
  const unit=catalogs.units.find(n=>n.id===line.enota_id)!,vat=catalogs.vatRates.find(n=>n.id===line.ddv_id)!;
  if(reviewed.description!==line.opis||reviewed.quantity!==line.kolicina||reviewed.discount!==(line.popust??0)||reviewed.unit!==unit.label||reviewed.vat!==vat.label||!Number.isFinite(reviewed.unitPrice)||reviewed.unitPrice<0||Math.abs(reviewed.unitPrice-line.cenaZDDV*vatFactor(vat.label))>0.00000002)throw Error('QUIBI_PREPARATION_CATALOG_MISMATCH');
  return reviewed;
 }
 return ({
 description:line.opis,quantity:line.kolicina,
 unit:catalogs.units.find(n=>n.id===line.enota_id)!.label,
 vat:catalogs.vatRates.find(n=>n.id===line.ddv_id)!.label,
 unitPrice:line.cenaZDDV*vatFactor(catalogs.vatRates.find(n=>n.id===line.ddv_id)!.label),discount:line.popust ?? 0,
 });});
 // Detect a cent difference caused by encoding gross edits as Quibi unit-net values before CREATE.
 const encodedLines=Object.values(body.Postavkedokumenta).map((line,index)=>'sifra' in line?lines[index]:({...lines[index],unitPrice:line.cenaZDDV*vatFactor(lines[index].vat)}));
 const enteredTotal=estimateReviewTotal(lines),encodedTotal=estimateReviewTotal(encodedLines);
 if(enteredTotal!==encodedTotal)throw Error('QUIBI_PREPARATION_AMOUNT_DIFFERENCE');
 const review:EstimateReview={customerId:input.customerId,vehicleId:input.vehicleId,
 numbering:matches[0].label,saleType:catalogs.saleTypes.find(n=>n.id===input.saleTypeId)!.label,
 lines,total:estimateReviewTotal(lines)};
 return {...stableEstimatePayload(body),body,review};
}
