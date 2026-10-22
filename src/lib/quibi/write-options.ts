import "server-only";
import { configuredQuibiWorkflowWriteClient } from "./write-client";

export type QuibiChoice = { id: string; label: string };

function nestedChoices(data: Record<string, unknown>, key: string, inner: string): QuibiChoice[] {
  const rows = data[key];
  if (!Array.isArray(rows)) throw new Error("QUIBI_INVALID_CATALOG_RESPONSE");
  return rows.map((row) => {
    if (!row || typeof row !== "object") throw new Error("QUIBI_INVALID_CATALOG_RESPONSE");
    const value = (row as Record<string, unknown>)[inner];
    if (!value || typeof value !== "object") throw new Error("QUIBI_INVALID_CATALOG_RESPONSE");
    const item = value as Record<string, unknown>;
    const id = String(item.id ?? "");
    if (!/^\d+$/.test(id) || !String(item.naziv ?? "").trim()) throw new Error("QUIBI_INVALID_CATALOG_RESPONSE");
    return { id, label: String(item.naziv).trim() };
  });
}

export async function quibiDevEstimateChoices(write = configuredQuibiWorkflowWriteClient()): Promise<{
  saleTypes: QuibiChoice[]; units: QuibiChoice[]; vatRates: QuibiChoice[]; warehouses: QuibiChoice[];defaults?:ReturnType<typeof quibiEstimateDefaults>;
}> {
  const [saleTypesRaw, unitsRaw, vatRaw, warehouseRaw] = await Promise.all([
    write.getSaleTypes(), write.getUnits(), write.getVatRates(), write.getWarehouses(),
  ]);
  const saleTypes = Object.entries(saleTypesRaw).map(([id, label]) => {
    if (!/^\d+$/.test(id) || typeof label !== "string" || !label.trim())
      throw new Error("QUIBI_INVALID_CATALOG_RESPONSE");
    return { id, label: label.trim() };
  });
  const units = nestedChoices(unitsRaw, "Enote", "Enota");
  const vatRates = nestedChoices(vatRaw, "DDV", "Ddv");
  if (!saleTypes.length || !units.length || !vatRates.length) throw new Error("QUIBI_EMPTY_CATALOG");
  const choices={ saleTypes, units, vatRates, warehouses:nestedChoices(warehouseRaw,"Skladisca","Skladisca") };return {...choices,defaults:quibiEstimateDefaults(choices)};
}

/** Set once per approved environment/company; every ID is checked against current Quibi data. */
export function quibiEstimateDefaults(choices:{saleTypes:QuibiChoice[];units:QuibiChoice[];vatRates:QuibiChoice[];warehouses?:QuibiChoice[]},env:Record<string,string|undefined>=process.env){
 const pick=(items:QuibiChoice[],key:string)=>items.find(i=>i.id===env[key])?.id??(items.length===1?items[0].id:undefined);
 return {saleTypeId:pick(choices.saleTypes,'QUIBI_DEFAULT_SALE_TYPE_ID'),warehouseId:pick(choices.warehouses??[],'QUIBI_DEFAULT_WAREHOUSE_ID'),unitId:pick(choices.units,'QUIBI_DEFAULT_SERVICE_UNIT_ID'),vatId:pick(choices.vatRates,'QUIBI_DEFAULT_SERVICE_VAT_ID')};
}
