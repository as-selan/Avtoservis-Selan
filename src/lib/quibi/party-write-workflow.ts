import { createHash } from "node:crypto";
import { customerFingerprint, vehicleFingerprint, type QuibiCustomer, type QuibiVehicle } from "./contracts.ts";
import type { Operation, OperationJournal } from "./write-workflow.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const numeric = /^\d+$/;
const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("sl-SI");

function exactRequest(body: object) {
  const json = JSON.stringify(body);
  return { json, sha256: createHash("sha256").update(json).digest("hex") };
}
function unchanged(op: Operation, json: string, sha256: string) {
  if (op.requestBody !== json || op.requestSha256 !== sha256)
    throw new Error("QUIBI_CREATE_CHANGED_REQUIRES_UPDATE");
}

export type CustomerCreateInput = { serviceRequestId: string; customerId: string;
  name: string; phone: string; email: string };
export type CustomerCreateRead = { customers(): Promise<QuibiCustomer[]>; customer(id: string): Promise<QuibiCustomer> };
export type CustomerCreateWrite = { createCustomer(body: { remote_id: string; naziv: string;
  emajl?: string; telst?: string }): Promise<unknown> };

/** A timeout never causes a second POST. Reconciliation requires exact remote_id and re-read. */
export async function createOrReconcileCustomer(args: { journal: OperationJournal;
  read: CustomerCreateRead; write: CustomerCreateWrite; input: CustomerCreateInput }): Promise<Operation> {
  const { journal, read, write, input } = args;
  if (!uuid.test(input.customerId) || !uuid.test(input.serviceRequestId) || !input.name.trim())
    throw new Error("QUIBI_INVALID_CUSTOMER_INPUT");
  const body = { remote_id: input.customerId, naziv: input.name.trim(),
    ...(input.email.trim() ? { emajl: input.email.trim() } : {}),
    ...(input.phone.trim() ? { telst: input.phone.trim() } : {}) };
  const { json, sha256 } = exactRequest(body);
  const expected = customerFingerprint({ name: body.naziv, phone: body.telst ?? "", email: body.emajl ?? "" });
  let op = await journal.get("customer", input.customerId);
  if (op) unchanged(op, json, sha256);

  async function reconcile(current: Operation): Promise<Operation> {
    const matches = (await read.customers()).filter((item) => item.remoteId === input.customerId);
    if (matches.length !== 1 || (current.quibiId && current.quibiId !== matches[0].id))
      throw new Error("QUIBI_CUSTOMER_CREATE_UNCERTAIN");
    const detail = await read.customer(matches[0].id);
    if (detail.id !== matches[0].id || detail.remoteId !== input.customerId ||
        customerFingerprint(detail) !== expected) throw new Error("QUIBI_CUSTOMER_REREAD_MISMATCH");
    if (current.state === "verified") return current;
    if (current.state !== "uncertain") throw new Error("QUIBI_CUSTOMER_CREATE_UNCERTAIN");
    return journal.patch(current.id, "uncertain", { state: "verified", quibiId: detail.id });
  }
  if (op?.state === "verified" || op?.state === "uncertain") return reconcile(op);
  if (op?.state === "dispatching" || op?.state === "failed")
    throw new Error("QUIBI_CUSTOMER_CREATE_UNCERTAIN");

  const existing = await read.customers();
  if (existing.some((item) => item.remoteId === input.customerId ||
      (!!input.email.trim() && normalized(item.email) === normalized(input.email)) ||
      (!!input.phone.trim() && normalized(item.phone) === normalized(input.phone)) ||
      normalized(item.name) === normalized(input.name)))
    throw new Error("QUIBI_CUSTOMER_MATCH_REVIEW_REQUIRED");
  op ??= await journal.insertOnce({ kind: "customer", localEntityId: input.customerId,
    serviceRequestId: input.serviceRequestId, externalId: input.customerId,
    requestBody: json, requestSha256: sha256 });
  unchanged(op, json, sha256);
  if (op.state !== "prepared" || !await journal.claim(op.id, "prepared"))
    throw new Error("QUIBI_CUSTOMER_CREATE_CONCURRENT");
  try { await write.createCustomer(body); } catch { /* Quibi may have committed before timeout. */ }
  op = await journal.patch(op.id, "dispatching", { state: "uncertain" });
  return reconcile(op);
}

export type VehicleCreateInput = { serviceRequestId: string; vehicleId: string; quibiCustomerId: string;
  registration: string; vin: string; make: string; model: string };
export type VehicleCreateRead = { vehicles(customerId: string): Promise<QuibiVehicle[]>;
  vehicle(id: string, customerId: string): Promise<QuibiVehicle> };
export type VehicleCreateWrite = { createVehicle(body: { stranka_id: string; registrskastevilka: string;
  internastevilka: string; proizvajalec: string; model: string }): Promise<string> };

/** Vehicle lacks a safe idempotency key, so an ambiguous POST is never repeated. */
export async function createOrReconcileVehicle(args: { journal: OperationJournal;
  read: VehicleCreateRead; write: VehicleCreateWrite; input: VehicleCreateInput }): Promise<Operation> {
  const { journal, read, write, input } = args;
  if (!uuid.test(input.vehicleId) || !uuid.test(input.serviceRequestId) || !numeric.test(input.quibiCustomerId) ||
      !input.registration.trim() || !input.vin.trim()) throw new Error("QUIBI_INVALID_VEHICLE_INPUT");
  const body = { stranka_id: input.quibiCustomerId, registrskastevilka: input.registration.trim(),
    internastevilka: input.vin.trim(), proizvajalec: input.make.trim(), model: input.model.trim() };
  const { json, sha256 } = exactRequest(body);
  const expected = vehicleFingerprint({ vin: body.internastevilka,
    registration: body.registrskastevilka, make: body.proizvajalec, model: body.model });
  let op = await journal.get("vehicle", input.vehicleId);
  if (op) unchanged(op, json, sha256);

  async function reconcile(current: Operation): Promise<Operation> {
    const matches = (await read.vehicles(input.quibiCustomerId)).filter((item) =>
      item.customerId === input.quibiCustomerId && !item.disabled && vehicleFingerprint(item) === expected);
    if (matches.length !== 1 || (current.quibiId && current.quibiId !== matches[0].id))
      throw new Error("QUIBI_VEHICLE_CREATE_UNCERTAIN");
    const detail = await read.vehicle(matches[0].id, input.quibiCustomerId);
    if (detail.id !== matches[0].id || detail.customerId !== input.quibiCustomerId || detail.disabled ||
        vehicleFingerprint(detail) !== expected) throw new Error("QUIBI_VEHICLE_REREAD_MISMATCH");
    if (current.state === "verified") return current;
    if (current.state !== "uncertain") throw new Error("QUIBI_VEHICLE_CREATE_UNCERTAIN");
    return journal.patch(current.id, "uncertain", { state: "verified", quibiId: detail.id });
  }
  if (op?.state === "verified" || op?.state === "uncertain") return reconcile(op);
  if (op?.state === "dispatching" || op?.state === "failed") throw new Error("QUIBI_VEHICLE_CREATE_UNCERTAIN");
  const existing = await read.vehicles(input.quibiCustomerId);
  if (existing.some((item) => item.customerId === input.quibiCustomerId && !item.disabled &&
      (normalized(item.registration) === normalized(input.registration) ||
       normalized(item.vin) === normalized(input.vin))))
    throw new Error("QUIBI_VEHICLE_MATCH_REVIEW_REQUIRED");
  op ??= await journal.insertOnce({ kind: "vehicle", localEntityId: input.vehicleId,
    serviceRequestId: input.serviceRequestId, externalId: null,
    requestBody: json, requestSha256: sha256 });
  unchanged(op, json, sha256);
  if (op.state !== "prepared" || !await journal.claim(op.id, "prepared"))
    throw new Error("QUIBI_VEHICLE_CREATE_CONCURRENT");
  let returnedId: string | null = null;
  try { returnedId = await write.createVehicle(body); } catch { /* May have committed. */ }
  op = await journal.patch(op.id, "dispatching", { state: "uncertain",
    ...(returnedId ? { quibiId: returnedId } : {}) });
  return reconcile(op);
}
