import {buildEstimateBody,stableEstimatePayload,type CreateEstimateInput} from './write-contract.ts';
type Choice={id:string;label:string};
export function estimatePreparationPayload(input:Omit<CreateEstimateInput,'numberingId'>,catalogs:{numberings:Choice[];saleTypes:Choice[];units:Choice[];vatRates:Choice[]}) {
 const matches=catalogs.numberings.filter(n=>n.label.trim().toLocaleLowerCase('sl-SI')==='predračun');
 if(matches.length!==1||!catalogs.saleTypes.some(n=>n.id===input.saleTypeId)||input.lines.some(line=>!('opis' in line)||!catalogs.units.some(n=>n.id===line.enota_id)||!catalogs.vatRates.some(n=>n.id===line.ddv_id)))throw Error('QUIBI_PREPARATION_CATALOG_MISMATCH');
 const body=buildEstimateBody({...input,numberingId:matches[0].id});
 return {...stableEstimatePayload(body),body};
}
