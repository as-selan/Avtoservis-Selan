import {quibiLinePricing} from './line-pricing.ts';
import { createHash } from "node:crypto";

export type QuibiCustomer = { id: string; name: string; phone: string; email: string; remoteId?: string; priceListId?:string|null;paymentTermDays?:number };
export type QuibiVehicle = {
  year?:number;
  id: string; customerId: string; vin: string; registration: string;
  make: string; model: string; disabled: boolean;
};
export type QuibiDocument = { number?:string;vehicleId?:string; id: string; customerId: string; numberingId: string; status: string; amount?: string };
export type QuibiEstimateDetail = {
  id: string; customerId: string; amount: string; status: string;
  vehicleId?: string; warehouseId?: string; spaceId?: string; paymentMethod?: string; externalId?: string; number?: string; numberingId?: string; date?: string; saleTypeId?: string;
  taxTotals?: {base:string;vat:string;total:string;vatId:string}[];
  serviceDate?: string; serviceEndDate?: string; dueDate?: string; paymentReference?: string; issuerName?: string; buyerName?: string; fiscalized?: boolean;
  lines: { description: string; quantity: string; grossPrice: string; unitId?: string; vatId?: string; discount?: string; articleId?: string; articleCode?: string; unitNetPrice?: string; unitGrossPrice?: string; lineNetAmount?: string; historicalVatLabel?: string; pricingVerified?: boolean; lineType?: string; stockManaged?: boolean }[];
  contentSha256: string;
};

export function quibiDocumentStatusLabel(status: string): string {
  return status.trim() || "Status v Quibi DEV ni na voljo";
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]),
  );
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("QUIBI_INVALID_RESPONSE");
  return value as Record<string, unknown>;
}

function field(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function rows(value: unknown, key: string): unknown[] {
  const envelope = object(value);
  if (envelope.error !== false) throw new Error("QUIBI_API_ERROR");
  const result = object(envelope.data)[key];
  if (!Array.isArray(result)) throw new Error("QUIBI_INVALID_RESPONSE");
  return result;
}

export function parseCustomers(value: unknown): QuibiCustomer[] {
  return rows(value, "Stranke").map((entry) => {
    const customer = object(object(entry).Stranka);
    const id = field(customer.id);
    if (!/^\d+$/.test(id)) throw new Error("QUIBI_INVALID_CUSTOMER_ID");
    return { id, name: field(customer.naziv), phone: field(customer.telst), email: field(customer.emajl),
    ...(/^\d+$/.test(field(customer.dniZapadlosti))&&Number.isSafeInteger(Number(customer.dniZapadlosti))?{paymentTermDays:Number(customer.dniZapadlosti)}:{}),
      ...(field(customer.remote_id) ? { remoteId: field(customer.remote_id) } : {}), ...(customer.cenik_id===null?{priceListId:null}:/^[1-9]\d*$/.test(field(customer.cenik_id))?{priceListId:field(customer.cenik_id)}:{}) };
  });
}

export function parseCustomerDetail(value: unknown): QuibiCustomer {
  const envelope = object(value);
  if (envelope.error !== false) throw new Error("QUIBI_API_ERROR");
  const customer = object(object(object(envelope.data).Stranke).Stranka);
  const id = field(customer.id);
  if (!/^\d+$/.test(id)) throw new Error("QUIBI_INVALID_CUSTOMER_ID");
  return { id, name: field(customer.naziv), phone: field(customer.telst), email: field(customer.emajl),
    ...(/^\d+$/.test(field(customer.dniZapadlosti))&&Number.isSafeInteger(Number(customer.dniZapadlosti))?{paymentTermDays:Number(customer.dniZapadlosti)}:{}),
    ...(field(customer.remote_id) ? { remoteId: field(customer.remote_id) } : {}), ...(customer.cenik_id===null?{priceListId:null}:/^[1-9]\d*$/.test(field(customer.cenik_id))?{priceListId:field(customer.cenik_id)}:{}) };
}

function projectVehicle(value: unknown): QuibiVehicle {
  const vehicle = object(object(value).Vozila);
  const id = field(vehicle.id);
  const customerId = field(vehicle.stranka_id);
  if (!/^\d+$/.test(id) || !/^\d+$/.test(customerId)) throw new Error("QUIBI_INVALID_VEHICLE_ID");
  const disabled = vehicle.disabled;
  if (![0, 1, false, true, "0", "1"].includes(disabled as string | number | boolean)) {
    throw new Error("QUIBI_INVALID_RESPONSE");
  }
  return {
    id, customerId, ...( /^\d{4}$/.test(field(vehicle.letnik)) && Number(vehicle.letnik)>=1886 && Number(vehicle.letnik)<=2100 ? {year:Number(vehicle.letnik)} : {}), vin: field(vehicle.internastevilka),
    registration: field(vehicle.registrskastevilka),
    make: field(vehicle.proizvajalec), model: field(vehicle.model),
    disabled: disabled === 1 || disabled === true || disabled === "1",
  };
}

export function parseVehicleCandidates(value: unknown): (Pick<QuibiVehicle,"id"|"vin"|"registration"> & Partial<Pick<QuibiVehicle,"make"|"model">>)[] {
 return rows(value,"Vozila").map(entry=>{const vehicle=object(object(entry).Vozila),id=field(vehicle.id);if(!/^\d+$/.test(id))throw Error("QUIBI_INVALID_VEHICLE_ID");return {id,vin:field(vehicle.internastevilka),registration:field(vehicle.registrskastevilka),...(field(vehicle.proizvajalec)?{make:field(vehicle.proizvajalec)}:{}),...(field(vehicle.model)?{model:field(vehicle.model)}:{})}});
}

export function parseVehicles(value: unknown): QuibiVehicle[] {
  return rows(value, "Vozila").map(projectVehicle);
}

export function parseVehicleDetail(value: unknown, expectedId: string, customerId: string): QuibiVehicle {
  const envelope = object(value);
  if (envelope.error !== false) throw new Error("QUIBI_API_ERROR");
  const projected = projectVehicle(object(envelope.data).Vozilo);
  if (projected.id !== expectedId) throw new Error("QUIBI_VEHICLE_ID_MISMATCH");
  if (projected.customerId !== customerId) throw new Error("QUIBI_CUSTOMER_ID_MISMATCH");
  return projected;
}

function statusFromDocument(entry: Record<string, unknown>): string {
  const header = object(entry.Glavadokumenta);
  const headerStatusId = field(header.statusi_id);
  const status = entry.Statusi == null || Array.isArray(entry.Statusi) ? null : object(entry.Statusi);
  const statusId = status ? field(status.id) : "";
  const label = status ? field(status.naziv) : "";
  if (!headerStatusId && !statusId && !label) return "";
  if (!headerStatusId || !statusId || !label || headerStatusId !== statusId) {
    return "";
  }
  return label;
}

/** Current status comes from the exact api2_view document, never /api2/statusi. */
export function parseDocumentStatus(value: unknown, expectedId: string, customerId: string): string {
  const documents = rows(value, "Dokumenti");
  if (documents.length !== 1) throw new Error("QUIBI_INVALID_RESPONSE");
  const entry = object(documents[0]);
  const header = object(entry.Glavadokumenta);
  if (field(header.id) !== expectedId) throw new Error("QUIBI_DOCUMENT_ID_MISMATCH");
  if (field(header.stranka_id) !== customerId) throw new Error("QUIBI_CUSTOMER_ID_MISMATCH");
  return statusFromDocument(entry);
}

export function parseDocuments(value: unknown, customerId?: string): QuibiDocument[] {
  return rows(value, "Dokumenti").map((entry) => {
    const doc = object(object(entry).Glavadokumenta);
    const id = field(doc.id);
    const owner = field(doc.stranka_id);
    if (!/^\d+$/.test(id) || !/^\d+$/.test(owner)) throw new Error("QUIBI_INVALID_DOCUMENT_ID");
    const status = statusFromDocument(object(entry));
    return { id, customerId: owner, numberingId: field(doc.stevilcenje_id),
      ...(field(doc.stevilka)?{number:field(doc.stevilka)}:{}),...(/^\d+$/.test(field(doc.vozila_id))?{vehicleId:field(doc.vozila_id)}:{}),
      status,
      ...(doc.znesek !== undefined && doc.znesek !== null ? { amount: field(doc.znesek) } : {}) };
  }).filter((doc) => !customerId || doc.customerId === customerId);
}

/** Read-only projection of a real Quibi estimate; never persisted as a second document. */
export function parseEstimateDetail(value: unknown, expectedId: string, customerId: string): QuibiEstimateDetail {
  const documents = rows(value, "Dokumenti");
  if (documents.length !== 1) throw new Error("QUIBI_INVALID_RESPONSE");
  const entry = object(documents[0]);
  const header = object(entry.Glavadokumenta);
  const id = field(header.id);
  const owner = field(header.stranka_id);
  if (id !== expectedId) throw new Error("QUIBI_DOCUMENT_ID_MISMATCH");
  if (owner !== customerId) throw new Error("QUIBI_CUSTOMER_ID_MISMATCH");
  const amount = field(header.znesek);
  const lines = entry.Postavkedokumenta;
  if (!amount || !Array.isArray(lines) || lines.length > 200) throw new Error("QUIBI_INVALID_RESPONSE");
  return {
    id, customerId: owner, amount,
    ...(Array.isArray(entry.Ddvglavadokumenta) ? {taxTotals:entry.Ddvglavadokumenta.map(value=>{const row=object(value);if(field(row.glavadokumenta_id)!==id||![row.osnova,row.ddv,row.vrednost].every(v=>/^-?\d+(?:\.\d+)?$/.test(field(v))&&Number.isFinite(Number(v))))throw Error("QUIBI_TAX_TOTALS_UNVERIFIED");return {base:field(row.osnova),vat:field(row.ddv),total:field(row.vrednost),vatId:field(row.ddv_id)}})} : {}),
    ...(field(header.space_id) ? {spaceId:field(header.space_id)} : {}),
    ...(field(header.nacinPlacila) ? {paymentMethod:field(header.nacinPlacila)} : {}),
    ...(field(header.skladisca_id) ? { warehouseId: field(header.skladisca_id) } : {}),
    ...(field(header.vozila_id) ? { vehicleId: field(header.vozila_id) } : {}),
    ...(field(header.external_id) ? { externalId: field(header.external_id) } : {}),
    ...(field(header.ZapSt) ? { number: field(header.ZapSt) } : {}),
    ...(field(header.stevilcenje_id) ? { numberingId: field(header.stevilcenje_id) } : {}),
    ...(field(header.datstod) ? {serviceDate:field(header.datstod)} : {}),
    ...(field(header.datstdo) ? {serviceEndDate:field(header.datstdo)} : {}),
    ...(field(header.datValute) ? {dueDate:field(header.datValute)} : {}),
    ...(field(header.sklic) ? {paymentReference:field(header.sklic)} : {}),
    ...(field(header.uNaziv) ? {issuerName:field(header.uNaziv)} : {}),
    ...(field(header.sNaziv) ? {buyerName:field(header.sNaziv)} : {}),
    ...(field(header.eor) ? {fiscalized:true} : {}),
    ...(field(header.datIzdRac) ? {date:field(header.datIzdRac)} : {}),
    ...(field(header.vrstaprodaje) ? {saleTypeId:field(header.vrstaprodaje)} : {}),
    status: statusFromDocument(entry),
    contentSha256: createHash("sha256").update(JSON.stringify(canonical(entry))).digest("hex"),
    lines: lines.map((row) => {
      const item = object(row);
      const article = item.Sifranti && typeof item.Sifranti === 'object' && !Array.isArray(item.Sifranti) ? item.Sifranti as Record<string,unknown> : {};
      if(field(article.id)&&field(article.id)!==field(item.sifranti_id))throw new Error('QUIBI_ARTICLE_REFERENCE_MISMATCH');
      return { ...quibiLinePricing(item), ...(field(item.linetype)?{lineType:field(item.linetype)}:{}), ...([0,1,'0','1',false,true].includes(article.vodiZalogo as string|number|boolean)?{stockManaged:article.vodiZalogo===1||article.vodiZalogo==='1'||article.vodiZalogo===true}:{}), ...(field(item.sifranti_id) && field(item.sifranti_id)!=='0' ? {articleId:field(item.sifranti_id)} : {}), ...(field(article.sifra) ? {articleCode:field(article.sifra)} : {}), description: field(item.opis), quantity: field(item.kolicina), grossPrice: field(item.cenaZDDV), ...(field(item.enota_id) ? {unitId:field(item.enota_id)} : {}), ...(field(item.ddv_id) ? {vatId:field(item.ddv_id)} : {}), ...(field(item.popust) ? {discount:field(item.popust)} : {}) };
    }),
  };
}

export function customerFingerprint(customer: Pick<QuibiCustomer, "name" | "phone" | "email">): string {
  const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("sl-SI");
  return createHash("sha256").update(JSON.stringify([
    normalize(customer.name), normalize(customer.phone), normalize(customer.email),
  ])).digest("hex");
}

export function vehicleFingerprint(vehicle: Pick<QuibiVehicle, "vin" | "registration" | "make" | "model">): string {
  const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleUpperCase("sl-SI");
  return createHash("sha256").update(JSON.stringify([
    normalize(vehicle.vin), normalize(vehicle.registration), normalize(vehicle.make), normalize(vehicle.model),
  ])).digest("hex");
}
