import type {QuibiEstimateDetail} from './contracts.ts';
export function businessSourceLines(source:QuibiEstimateDetail,units:{id:string}[],vat:{id:string}[]){
 if(!source.lines.length)throw Error('SOURCE_LINE_METADATA_UNSUPPORTED');
 return source.lines.map(line=>{
  if(!line.unitId||!line.vatId||!units.some(unit=>unit.id===line.unitId)||!vat.some(rate=>rate.id===line.vatId)||line.discount==null||!/^\d+(\.\d+)?$/.test(line.discount)||Number(line.discount)>100)throw Error('SOURCE_LINE_METADATA_UNSUPPORTED');
  if(!/^\d+(\.\d+)?$/.test(line.quantity)||!/^\d+(\.\d+)?$/.test(line.grossPrice))throw Error('SOURCE_LINE_METADATA_UNSUPPORTED');
  const quantity=Number(line.quantity),price=Number(line.grossPrice);
  if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(price)||price<0||!line.description.trim())throw Error('SOURCE_LINE_METADATA_UNSUPPORTED');
  return {opis:line.description,enota_id:line.unitId,ddv_id:line.vatId,kolicina:quantity,cenaZDDV:price,popust:Number(line.discount)};
 });
}
