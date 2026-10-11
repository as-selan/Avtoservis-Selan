import {stableEstimatePayload,withDocumentId,type EstimateBody} from './write-contract.ts';
import type {QuibiEstimateDetail} from './contracts.ts';
type Choice={id:string;label:string};
export function estimateRevisionPreparation(base:EstimateBody,current:QuibiEstimateDetail,description:string,price:number,catalogs:{saleTypes:Choice[];units:Choice[];vatRates:Choice[];numberings:Choice[]}){
 const first=base.Postavkedokumenta['1'];
 if(!first||!('opis' in first)||Object.keys(base.Postavkedokumenta).length!==1||current.lines.length!==1||!description.trim()||!Number.isFinite(price)||price<=0||price>1000000)throw Error('REVISION_UNSUPPORTED');
 if(current.customerId!==String(base.Glavadokumenta.stranka_id)||current.vehicleId!==String(base.Glavadokumenta.vozila_id)||current.externalId!==base.Glavadokumenta.external_id||current.numberingId!==String(base.Glavadokumenta.stevilcenje_id))throw Error('REVISION_IDENTITY_CHANGED');
 if(Number(current.lines[0].grossPrice)===price&&current.lines[0].description.trim()===description.trim())throw Error('QUIBI_NO_BUSINESS_CHANGES');
 if(!catalogs.saleTypes.some(x=>x.id===String(base.Glavadokumenta.vrstaprodaje))||!catalogs.units.some(x=>x.id===first.enota_id)||!catalogs.vatRates.some(x=>x.id===first.ddv_id)||!catalogs.numberings.some(x=>x.id===String(base.Glavadokumenta.stevilcenje_id)))throw Error('REVISION_CATALOG_CHANGED');
 const body=withDocumentId({...base,Postavkedokumenta:{'1':{...first,opis:description,cenaZDDV:price}}},current.id);
 return {...stableEstimatePayload(body),body};
}
