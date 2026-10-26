import {isDefinitiveQuibiRejection} from './send-outcome.ts';
import {customerRemoteId} from './customer-remote-id.ts';
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
  name: string; phone: string; email: string; allowDistinctName?:boolean };
export type CustomerCreateRead = { customers(): Promise<QuibiCustomer[]>; customer(id: string): Promise<QuibiCustomer> };
export type CustomerCreateWrite = { createCustomer(body: { remote_id: string; naziv: string;
  emajl?: string; telst?: string }): Promise<unknown> };

/** A timeout never causes a second POST. Reconciliation requires exact remote_id and re-read. */
export async function createOrReconcileCustomer(args: { journal: OperationJournal;
  read: CustomerCreateRead; write: CustomerCreateWrite; input: CustomerCreateInput }): Promise<Operation> {
  const { journal, read, write, input } = args;
  if (!uuid.test(input.customerId) || !uuid.test(input.serviceRequestId) || !input.name.trim())
    throw new Error("QUIBI_INVALID_CUSTOMER_INPUT");
  let op = await journal.get("customer", input.customerId);
  const remoteId=op?String(JSON.parse(op.requestBody).remote_id??''):customerRemoteId(input.customerId);
  if(![input.customerId,customerRemoteId(input.customerId)].includes(remoteId))throw Error('QUIBI_CREATE_CHANGED_REQUIRES_UPDATE');
  const body = { remote_id: remoteId, naziv: input.name.trim(),
    ...(input.email.trim() ? { emajl: input.email.trim() } : {}),
    ...(input.phone.trim() ? { telst: input.phone.trim() } : {}) };
  const { json, sha256 } = exactRequest(body);
  const expected = customerFingerprint({ name: body.naziv, phone: body.telst ?? "", email: body.emajl ?? "" });
  if (op) unchanged(op, json, sha256);

  async function reconcile(current: Operation): Promise<Operation> {
    const matches = (await read.customers()).filter((item) => item.remoteId === body.remote_id);
    if (matches.length !== 1 || (current.quibiId && current.quibiId !== matches[0].id))
      throw new Error("QUIBI_CUSTOMER_CREATE_UNCERTAIN");
    const detail = await read.customer(matches[0].id);
    if (detail.id !== matches[0].id || detail.remoteId !== body.remote_id ||
        customerFingerprint(detail) !== expected) throw new Error("QUIBI_CUSTOMER_REREAD_MISMATCH");
    if (current.state === "verified") return current;
    if (current.state !== "uncertain") throw new Error("QUIBI_CUSTOMER_CREATE_UNCERTAIN");
    return journal.patch(current.id, "uncertain", { state: "verified", quibiId: detail.id });
  }
  if (op?.state === "verified" || op?.state === "uncertain") return reconcile(op);
  if (op?.state === "dispatching" || op?.state === "failed")
    throw new Error("QUIBI_CUSTOMER_CREATE_UNCERTAIN");

  if(input.allowDistinctName&&!input.phone.trim()&&!input.email.trim())throw Error('QUIBI_CUSTOMER_MATCH_REVIEW_REQUIRED');
  // Persist the explicit new-identity intent before a transient provider READ failure.
  if(input.allowDistinctName)op??=await journal.insertOnce({kind:'customer',localEntityId:input.customerId,serviceRequestId:input.serviceRequestId,externalId:input.customerId,requestBody:json,requestSha256:sha256});
  const existing = await read.customers();
  if (existing.some((item) => item.remoteId === body.remote_id ||
      (!!input.email.trim() && normalized(item.email) === normalized(input.email)) ||
      (!!input.phone.trim() && item.phone.replace(/[^0-9]/g,'') === input.phone.replace(/[^0-9]/g,'')) ||
      (!input.allowDistinctName && normalized(item.name) === normalized(input.name))))
    throw new Error("QUIBI_CUSTOMER_MATCH_REVIEW_REQUIRED");
  op ??= await journal.insertOnce({ kind: "customer", localEntityId: input.customerId,
    serviceRequestId: input.serviceRequestId, externalId: input.customerId,
    requestBody: json, requestSha256: sha256 });
  unchanged(op, json, sha256);
  if (op.state !== "prepared" || !await journal.claim(op.id, "prepared"))
    throw new Error("QUIBI_CUSTOMER_CREATE_CONCURRENT");
  let rejection:unknown=null;
  try { await write.createCustomer(body); } catch(error) { rejection=error; }
  op = await journal.patch(op.id, "dispatching", { state: "uncertain" });
  if(isDefinitiveQuibiRejection(rejection)){await journal.patch(op.id,'uncertain',{state:'failed'});throw Error('QUIBI_CUSTOMER_CREATE_REJECTED')}
  return reconcile(op);
}

export type VehicleCreateInput = { serviceRequestId: string; vehicleId: string; quibiCustomerId: string;
  registration: string; vin: string; make: string; model: string; year?:number };
export type VehicleCreateRead = { allVehicles?(): Promise<Pick<QuibiVehicle,"id"|"vin"|"registration">[]>; vehicles(customerId: string): Promise<QuibiVehicle[]>;
  vehicle(id: string, customerId: string): Promise<QuibiVehicle> };
export type VehicleCreateWrite = { createVehicle(body: { stranka_id: string; registrskastevilka: string;
  internastevilka: string; proizvajalec: string; model: string;letnik?:number }): Promise<string> };

/** Vehicle lacks a safe idempotency key, so an ambiguous POST is never repeated. */
export async function createOrReconcileVehicle(args: { journal: OperationJournal;
  read: VehicleCreateRead; write: VehicleCreateWrite; input: VehicleCreateInput }): Promise<Operation> {
  const { journal, read, write, input } = args;
  if (!uuid.test(input.vehicleId) || !uuid.test(input.serviceRequestId) || !numeric.test(input.quibiCustomerId) ||
      !input.registration.trim() || !input.vin.trim()) throw new Error("QUIBI_INVALID_VEHICLE_INPUT");
  let op = await journal.get("vehicle", input.vehicleId);
  if(input.year!==undefined&&(!Number.isInteger(input.year)||input.year<1886||input.year>2100))throw Error('QUIBI_INVALID_VEHICLE_INPUT');
  const body = { stranka_id: input.quibiCustomerId, registrskastevilka: input.registration.trim(),
    internastevilka: input.vin.trim(), proizvajalec: input.make.trim(), model: input.model.trim(),...(input.year!==undefined&&(!op||'letnik' in JSON.parse(op.requestBody))?{letnik:input.year}:{}) };
  const { json, sha256 } = exactRequest(body);
  const expected = vehicleFingerprint({ vin: body.internastevilka,
    registration: body.registrskastevilka, make: body.proizvajalec, model: body.model });
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
  const existing = read.allVehicles ? await read.allVehicles() : await read.vehicles(input.quibiCustomerId);
  if (existing.some((item) =>
      (item.registration.replace(/[^a-z0-9]/gi,"").toLowerCase() === input.registration.replace(/[^a-z0-9]/gi,"").toLowerCase() ||
       normalized(item.vin) === normalized(input.vin))))
    throw new Error("QUIBI_VEHICLE_MATCH_REVIEW_REQUIRED");
  op ??= await journal.insertOnce({ kind: "vehicle", localEntityId: input.vehicleId,
    serviceRequestId: input.serviceRequestId, externalId: null,
    requestBody: json, requestSha256: sha256 });
  unchanged(op, json, sha256);
  if (op.state !== "prepared" || !await journal.claim(op.id, "prepared"))
    throw new Error("QUIBI_VEHICLE_CREATE_CONCURRENT");
  let returnedId: string | null = null;
  let rejection:unknown=null;
  try { returnedId = await write.createVehicle(body); } catch(error) { rejection=error; }
  op = await journal.patch(op.id, "dispatching", { state: "uncertain",
    ...(returnedId ? { quibiId: returnedId } : {}) });
  if(isDefinitiveQuibiRejection(rejection)){await journal.patch(op.id,'uncertain',{state:'failed'});throw Error('QUIBI_VEHICLE_CREATE_REJECTED')}
  return reconcile(op);
}
