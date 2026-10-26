import type {QuibiChoice} from './write-options';
/** Set once per approved environment/company; every ID is checked against current Quibi data. */
export function quibiEstimateDefaults(choices:{saleTypes:QuibiChoice[];units:QuibiChoice[];vatRates:QuibiChoice[];warehouses?:QuibiChoice[]},env:Record<string,string|undefined>=process.env){
 const pick=(items:QuibiChoice[],key:string)=>items.find(i=>i.id===env[key])?.id??(items.length===1?items[0].id:undefined);
 return {saleTypeId:pick(choices.saleTypes,'QUIBI_DEFAULT_SALE_TYPE_ID'),warehouseId:pick(choices.warehouses??[],'QUIBI_DEFAULT_WAREHOUSE_ID'),unitId:pick(choices.units,'QUIBI_DEFAULT_SERVICE_UNIT_ID'),vatId:pick(choices.vatRates,'QUIBI_DEFAULT_SERVICE_VAT_ID')};
}

/** Only already-read, equivalent documents for this exact customer AND vehicle may supply header defaults. */
export function equivalentDocumentDefaults(documents:Array<{detail:import('./contracts').QuibiEstimateDetail}>,identity:{customerId:string;vehicleId:string},rows:Array<{key:string;requestedService?:string;description?:string}>,options:import('./estimate-catalog').EstimateCatalogOption[]){
 const normalize=(v:string)=>v.trim().normalize('NFKC').toLocaleLowerCase('sl-SI').replace(/\s+/g,' ');
 const equivalent=documents.map(d=>d.detail).filter(d=>d.customerId===identity.customerId&&d.vehicleId===identity.vehicleId&&!!d.number&&!!d.status&&!/storn|cancel|razveljav|dobropis|credit|osnutek|draft/i.test(d.status)&&rows.length>0&&rows.every(row=>d.lines.some(line=>{
  const option=options.find(o=>o.key===row.key);
  if(option&&line.articleId)return line.articleId===option.articleId&&(!line.articleCode||line.articleCode===option.code);
  return normalize(line.description)===normalize(row.description??row.requestedService??'');
 })));
 const sole=(values:Array<string|undefined>)=>{const ids=[...new Set(values.filter((v):v is string=>!!v))];return ids.length===1?ids[0]:undefined};
 return {saleTypeId:sole(equivalent.map(d=>d.saleTypeId)),warehouseId:sole(equivalent.map(d=>d.warehouseId))};
}
