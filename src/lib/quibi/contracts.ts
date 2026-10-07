import { createHash } from "node:crypto";

export type QuibiCustomer = { id: string; name: string; phone: string; email: string; remoteId?: string };
export type QuibiVehicle = {
  id: string; customerId: string; vin: string; registration: string;
  make: string; model: string; disabled: boolean;
};
export type QuibiDocument = { id: string; customerId: string; numberingId: string; status: string; amount?: string };
export type QuibiEstimateDetail = {
  id: string; customerId: string; amount: string; status: string;
  vehicleId?: string; externalId?: string; number?: string; numberingId?: string;
  lines: { description: string; quantity: string; grossPrice: string }[];
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
      ...(field(customer.remote_id) ? { remoteId: field(customer.remote_id) } : {}) };
  });
}

export function parseCustomerDetail(value: unknown): QuibiCustomer {
  const envelope = object(value);
  if (envelope.error !== false) throw new Error("QUIBI_API_ERROR");
  const customer = object(object(object(envelope.data).Stranke).Stranka);
  const id = field(customer.id);
  if (!/^\d+$/.test(id)) throw new Error("QUIBI_INVALID_CUSTOMER_ID");
  return { id, name: field(customer.naziv), phone: field(customer.telst), email: field(customer.emajl),
    ...(field(customer.remote_id) ? { remoteId: field(customer.remote_id) } : {}) };
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
    id, customerId, vin: field(vehicle.internastevilka),
    registration: field(vehicle.registrskastevilka),
    make: field(vehicle.proizvajalec), model: field(vehicle.model),
    disabled: disabled === 1 || disabled === true || disabled === "1",
  };
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
  const status = entry.Statusi == null ? null : object(entry.Statusi);
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

export function parseDocuments(value: unknown, customerId: string): QuibiDocument[] {
  return rows(value, "Dokumenti").map((entry) => {
    const doc = object(object(entry).Glavadokumenta);
    const id = field(doc.id);
    const owner = field(doc.stranka_id);
    if (!/^\d+$/.test(id) || !/^\d+$/.test(owner)) throw new Error("QUIBI_INVALID_DOCUMENT_ID");
    const status = statusFromDocument(object(entry));
    return { id, customerId: owner, numberingId: field(doc.stevilcenje_id),
      status,
      ...(doc.znesek !== undefined && doc.znesek !== null ? { amount: field(doc.znesek) } : {}) };
  }).filter((doc) => doc.customerId === customerId);
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
    ...(field(header.vozila_id) ? { vehicleId: field(header.vozila_id) } : {}),
    ...(field(header.external_id) ? { externalId: field(header.external_id) } : {}),
    ...(field(header.ZapSt) ? { number: field(header.ZapSt) } : {}),
    ...(field(header.stevilcenje_id) ? { numberingId: field(header.stevilcenje_id) } : {}),
    status: statusFromDocument(entry),
    contentSha256: createHash("sha256").update(JSON.stringify(canonical(entry))).digest("hex"),
    lines: lines.map((row) => {
      const item = object(row);
      return { description: field(item.opis), quantity: field(item.kolicina), grossPrice: field(item.cenaZDDV) };
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
