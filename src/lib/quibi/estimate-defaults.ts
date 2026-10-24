import type {QuibiChoice} from './write-options';
/** Set once per approved environment/company; every ID is checked against current Quibi data. */
export function quibiEstimateDefaults(choices:{saleTypes:QuibiChoice[];units:QuibiChoice[];vatRates:QuibiChoice[];warehouses?:QuibiChoice[]},env:Record<string,string|undefined>=process.env){
 const pick=(items:QuibiChoice[],key:string)=>items.find(i=>i.id===env[key])?.id??(items.length===1?items[0].id:undefined);
 return {saleTypeId:pick(choices.saleTypes,'QUIBI_DEFAULT_SALE_TYPE_ID'),warehouseId:pick(choices.warehouses??[],'QUIBI_DEFAULT_WAREHOUSE_ID'),unitId:pick(choices.units,'QUIBI_DEFAULT_SERVICE_UNIT_ID'),vatId:pick(choices.vatRates,'QUIBI_DEFAULT_SERVICE_VAT_ID')};
}
