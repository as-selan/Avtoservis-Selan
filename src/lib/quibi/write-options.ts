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
  saleTypes: QuibiChoice[]; units: QuibiChoice[]; vatRates: QuibiChoice[];
}> {
  const [saleTypesRaw, unitsRaw, vatRaw] = await Promise.all([
    write.getSaleTypes(), write.getUnits(), write.getVatRates(),
  ]);
  const saleTypes = Object.entries(saleTypesRaw).map(([id, label]) => {
    if (!/^\d+$/.test(id) || typeof label !== "string" || !label.trim())
      throw new Error("QUIBI_INVALID_CATALOG_RESPONSE");
    return { id, label: label.trim() };
  });
  const units = nestedChoices(unitsRaw, "Enote", "Enota");
  const vatRates = nestedChoices(vatRaw, "DDV", "Ddv");
  if (!saleTypes.length || !units.length || !vatRates.length) throw new Error("QUIBI_EMPTY_CATALOG");
  return { saleTypes, units, vatRates };
}
