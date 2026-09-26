import { createHash } from "node:crypto";

export type QuibiCustomer = { id: string; name: string; phone: string; email: string };
export type QuibiDocument = { id: string; customerId: string; numberingId: string };

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
    return { id, name: field(customer.naziv), phone: field(customer.telst), email: field(customer.emajl) };
  });
}

export function parseCustomerDetail(value: unknown): QuibiCustomer {
  const envelope = object(value);
  if (envelope.error !== false) throw new Error("QUIBI_API_ERROR");
  const customer = object(object(object(envelope.data).Stranke).Stranka);
  const id = field(customer.id);
  if (!/^\d+$/.test(id)) throw new Error("QUIBI_INVALID_CUSTOMER_ID");
  return { id, name: field(customer.naziv), phone: field(customer.telst), email: field(customer.emajl) };
}

export function parseDocuments(value: unknown, customerId: string): QuibiDocument[] {
  return rows(value, "Dokumenti").map((entry) => {
    const doc = object(object(entry).Glavadokumenta);
    const id = field(doc.id);
    const owner = field(doc.stranka_id);
    if (!/^\d+$/.test(id) || !/^\d+$/.test(owner)) throw new Error("QUIBI_INVALID_DOCUMENT_ID");
    return { id, customerId: owner, numberingId: field(doc.stevilcenje_id) };
  }).filter((doc) => doc.customerId === customerId);
}

export function customerFingerprint(customer: Pick<QuibiCustomer, "name" | "phone" | "email">): string {
  const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("sl-SI");
  return createHash("sha256").update(JSON.stringify([
    normalize(customer.name), normalize(customer.phone), normalize(customer.email),
  ])).digest("hex");
}
