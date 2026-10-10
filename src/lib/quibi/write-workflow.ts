import { createHash } from "node:crypto";
import { assertQuibiDevTestSendAllowed, quibiDevTestRecipient, validQuibiId, buildEstimateBody, stableEstimatePayload, withDocumentId,
  type CreateEstimateInput, type EstimateBody } from "./write-contract.ts";

export type OperationKind = "customer" | "vehicle" | "estimate" | "estimate_update" | "send" | "work_order" | "invoice" | "customer_update" | "vehicle_update";
export type OperationState = "prepared" | "dispatching" | "uncertain" | "verified" | "failed";
export type Operation = {
  id: string; kind: OperationKind; localEntityId: string; serviceRequestId: string;
  externalId: string | null; requestBody: string; requestSha256: string;
  state: OperationState; quibiId: string | null; quibiContentSha256: string | null; documentNumber: string | null;
  sendId: string | null; sendStatus: "queued" | "sent" | "failed" | null;
  attemptedAt?: string | null;
};
export type NewOperation = Omit<Operation, "id" | "state" | "quibiId" | "quibiContentSha256" | "documentNumber" | "sendId" | "sendStatus">;
export type OperationPatch = Partial<Pick<Operation, "state" | "quibiId" | "quibiContentSha256" | "documentNumber" | "sendId" | "sendStatus">>;

/** Implementations must atomically claim a prepared/uncertain operation. */
export interface OperationJournal {
  get(kind: OperationKind, localEntityId: string): Promise<Operation | null>;
  insertOnce(entry: NewOperation): Promise<Operation>;
  claim(id: string, expected: OperationState): Promise<boolean>;
  patch(id: string, expected: OperationState, changes: OperationPatch): Promise<Operation>;
}

export interface EstimateRead {
  estimates(customerId: string): Promise<Array<{ id: string }>>;
  estimateDetail(id: string, customerId: string): Promise<{
    id: string; customerId: string; vehicleId?: string; externalId?: string;
    number?: string; numberingId?: string; lines: unknown[]; contentSha256: string;
  }>;
}
export interface EstimateWrite {
  getNumberings(): Promise<Array<{ Stevilcenje: { id: string; naziv: string; glava_id: string } }>>;
  createEstimate(body: EstimateBody): Promise<{ id: string; number: string }>;
  updateEstimate(id: string, body: EstimateBody): Promise<{ id: string; number: string }>;
  sendDocument(id: string, email: string, subject?: string): Promise<{ sendId: string; status: "queued" | "sent" }>;
  getSendStatus(id: string, sendId: string): Promise<{ status: "queued" | "sent" | "failed" }>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function samePayload(existing: Operation, json: string, sha256: string): void {
  if (existing.requestSha256 !== sha256 || existing.requestBody !== json)
    throw new Error("QUIBI_CREATE_CHANGED_REQUIRES_UPDATE");
}

export async function discoverEstimateNumbering(write: Pick<EstimateWrite, "getNumberings">): Promise<string> {
  const matches = (await write.getNumberings()).filter(({ Stevilcenje: item }) =>
    item.naziv.trim().toLocaleLowerCase("sl-SI") === "predračun" && /^\d+$/.test(item.id));
  if (matches.length !== 1) throw new Error("QUIBI_ESTIMATE_NUMBERING_AMBIGUOUS");
  return matches[0].Stevilcenje.id;
}

async function verifyDocument(read: EstimateRead, customerId: string, vehicleId: string,
  externalId: string, id: string, numberingId: string, expectedNumber?: string | null) {
  const listed = await read.estimates(customerId);
  if (!listed.some((item) => item.id === id)) throw new Error("QUIBI_DOCUMENT_NOT_LISTED_FOR_CUSTOMER");
  const detail = await read.estimateDetail(id, customerId);
  if (detail.id !== id || detail.customerId !== customerId || detail.vehicleId !== vehicleId ||
      detail.externalId !== externalId || detail.numberingId !== numberingId || !detail.lines.length ||
      !/^[0-9a-f]{64}$/.test(detail.contentSha256) ||
      (expectedNumber != null && detail.number !== expectedNumber))
    throw new Error("QUIBI_DOCUMENT_REREAD_MISMATCH");
  return detail;
}

/** No network write can happen before insertOnce has durably stored the exact body. */
export async function createAndVerifyEstimate(args: {
  journal: OperationJournal; read: EstimateRead; write: EstimateWrite;
  input: Omit<CreateEstimateInput, "numberingId">;
}) {
  const { journal, read, write, input } = args;
  if (!uuid.test(input.serviceRequestId)) throw new Error("QUIBI_INVALID_CASE_ID");
  const existing = await journal.get("estimate", input.serviceRequestId);
  // Numbering was discovered from Quibi before the first persisted request.
  // A retry must not silently adopt a subsequently changed numbering list.
  const numberingId = existing
    ? String((JSON.parse(existing.requestBody) as EstimateBody).Glavadokumenta.stevilcenje_id)
    : await discoverEstimateNumbering(write);
  const body = buildEstimateBody({ ...input, numberingId });
  const payload = stableEstimatePayload(body);
  const op = existing ?? await journal.insertOnce({
    kind: "estimate", localEntityId: input.serviceRequestId, serviceRequestId: input.serviceRequestId,
    externalId: body.Glavadokumenta.external_id, requestBody: payload.json, requestSha256: payload.sha256,
  });
  samePayload(op, payload.json, payload.sha256);
  if (op.externalId !== body.Glavadokumenta.external_id) throw new Error("QUIBI_EXTERNAL_ID_MISMATCH");
  if (op.state === "verified") return op;
  if (op.state === "dispatching" || op.state === "failed") throw new Error("QUIBI_OPERATION_REQUIRES_RECONCILIATION");
  if (op.quibiId) {
    const detail = await verifyDocument(read, input.customerId, input.vehicleId, op.externalId, op.quibiId, numberingId,
      op.documentNumber);
    return journal.patch(op.id, op.state, { state: "verified", quibiContentSha256: detail.contentSha256 });
  }
  if (!await journal.claim(op.id, op.state)) throw new Error("QUIBI_OPERATION_CONCURRENT");
  try {
    // For an uncertain create, Quibi's documented same-body external_id replay
    // contract returns the original ID. Never rebuild the body from edited UI.
    const storedBody = JSON.parse(op.requestBody) as EstimateBody;
    const result = await write.createEstimate(storedBody);
    const dispatched = await journal.patch(op.id, "dispatching", {
      state: "uncertain", quibiId: result.id, documentNumber: result.number,
    });
    const detail = await verifyDocument(read, input.customerId, input.vehicleId, op.externalId, result.id, numberingId,
      result.number);
    return journal.patch(dispatched.id, "uncertain", { state: "verified", quibiContentSha256: detail.contentSha256 });
  } catch (cause) {
    // A timeout may mean Quibi committed the document. Preserve uncertain state.
    await journal.patch(op.id, "dispatching", { state: "uncertain" }).catch(() => undefined);
    throw cause;
  }
}

/** Update requires an explicit new revision ID and the current verified document. */
export async function updateAndVerifyEstimate(args: {
  journal: OperationJournal; read: EstimateRead; write: EstimateWrite;
  serviceRequestId: string; revisionId: string; customerId: string; vehicleId: string;
  documentId: string; externalId: string; numberingId: string;
  expectedContentSha256: string; replacement: EstimateBody;
}) {
  const { journal, read, write } = args;
  if (!uuid.test(args.revisionId) || !uuid.test(args.serviceRequestId) || !/^[0-9a-f]{64}$/.test(args.expectedContentSha256))
    throw new Error("QUIBI_INVALID_UPDATE_INPUT");
  const body = withDocumentId(args.replacement, args.documentId);
  if (body.Glavadokumenta.external_id !== args.externalId ||
      String(body.Glavadokumenta.stranka_id) !== args.customerId ||
      String(body.Glavadokumenta.vozila_id) !== args.vehicleId ||
      String(body.Glavadokumenta.stevilcenje_id) !== args.numberingId)
    throw new Error("QUIBI_UPDATE_OWNERSHIP_MISMATCH");
  const { json, sha256 } = stableEstimatePayload(body);
  const existing = await journal.get("estimate_update", args.revisionId);
  if (existing) samePayload(existing, json, sha256);
  if (existing?.state === "verified") {
    const current = await verifyDocument(read, args.customerId, args.vehicleId,
      args.externalId, args.documentId, args.numberingId, existing.documentNumber);
    if (current.contentSha256 !== existing.quibiContentSha256) throw new Error("QUIBI_DOCUMENT_CHANGED");
    return existing;
  }
  const current = await verifyDocument(read, args.customerId, args.vehicleId,
    args.externalId, args.documentId, args.numberingId);
  if (current.contentSha256 !== args.expectedContentSha256) throw new Error("QUIBI_DOCUMENT_CHANGED");
  const op = existing ?? await journal.insertOnce({
    kind: "estimate_update", localEntityId: args.revisionId, serviceRequestId: args.serviceRequestId,
    externalId: null, requestBody: json, requestSha256: sha256,
  });
  samePayload(op, json, sha256);
  if (op.state !== "prepared") throw new Error("QUIBI_UPDATE_REQUIRES_RECONCILIATION");
  if (!await journal.claim(op.id, "prepared")) throw new Error("QUIBI_OPERATION_CONCURRENT");
  try {
    const result = await write.updateEstimate(args.documentId, JSON.parse(op.requestBody) as EstimateBody);
    await journal.patch(op.id, "dispatching", { state: "uncertain", quibiId: result.id,
      documentNumber: result.number });
    const detail = await verifyDocument(read, args.customerId, args.vehicleId, args.externalId,
      result.id, args.numberingId, result.number);
    return journal.patch(op.id, "uncertain", { state: "verified", quibiContentSha256: detail.contentSha256 });
  } catch (cause) {
    await journal.patch(op.id, "dispatching", { state: "uncertain" }).catch(() => undefined);
    throw cause;
  }
}

/** One send per approved quote revision; ambiguous responses are never retried. */
export async function sendAndTrackEstimate(args: {
  journal: OperationJournal; read: EstimateRead; write: EstimateWrite; quoteRevisionId: string;
  serviceRequestId: string; documentId: string; recipient: string; subject: string;
  customerId: string; vehicleId: string; externalId: string; numberingId: string;
  approvedContentSha256: string; approvedForSend: boolean; beforeDispatch?: () => Promise<void>;
}) {
  const { journal, read, write } = args;
  if (!uuid.test(args.quoteRevisionId) || !uuid.test(args.serviceRequestId)) throw new Error("QUIBI_INVALID_SEND_INPUT");
  if (!args.approvedForSend || !/^[0-9a-f]{64}$/.test(args.approvedContentSha256))
    throw new Error("QUIBI_SEND_APPROVAL_REQUIRED");
  const body = { documentId: args.documentId, recipient: args.recipient, subject: args.subject };
  const json = JSON.stringify(body);
  const sha256 = createHash("sha256").update(json).digest("hex");
  const op = await journal.get("send", args.quoteRevisionId) ?? await journal.insertOnce({
    kind: "send", localEntityId: args.quoteRevisionId, serviceRequestId: args.serviceRequestId,
    externalId: null, requestBody: json, requestSha256: sha256,
  });
  samePayload(op, json, sha256);
  if (op.sendId) return checkTrackedEstimateStatus({ journal, write, operation: op, documentId: args.documentId });
  const current = await verifyDocument(read, args.customerId, args.vehicleId,
    args.externalId, args.documentId, args.numberingId);
  if (current.contentSha256 !== args.approvedContentSha256) throw new Error("QUIBI_DOCUMENT_CHANGED");
  if (op.state !== "prepared") throw new Error("QUIBI_SEND_AMBIGUOUS_NO_RETRY");
  if (!await journal.claim(op.id, "prepared")) throw new Error("QUIBI_OPERATION_CONCURRENT");
  try {
    await args.beforeDispatch?.();
    const fresh = await verifyDocument(read, args.customerId, args.vehicleId, args.externalId, args.documentId, args.numberingId);
    if (fresh.contentSha256 !== args.approvedContentSha256) throw new Error("QUIBI_DOCUMENT_CHANGED");
    const result = await write.sendDocument(args.documentId, args.recipient, args.subject);
    return journal.patch(op.id, "dispatching", { state: "uncertain", quibiId: args.documentId,
      sendId: result.sendId, sendStatus: result.status });
  } catch (cause) {
    await journal.patch(op.id, "dispatching", { state: "uncertain" }).catch(() => undefined);
    throw cause;
  }
}

export type ManualSendAuthorization = {
  actorId: string; organizationId: string; role: string; serviceRequestId: string; caseStatus: string;
  quoteRevisionId: string; quoteServiceRequestId: string; latestQuoteId: string; quoteReviewStatus: string;
  evidenceKind: string; documentId: string; customerId: string; evidenceCustomerId: string; vehicleId: string;
  serviceWanted: string; approvedContentSha256: string; customerEmail: string | null;
};
function validateManualAuthorization(a: ManualSendAuthorization, caseId: string, quoteId: string) {
  if (![a.actorId, a.organizationId, caseId, quoteId].every(v => uuid.test(v)) ||
      !["owner", "admin"].includes(a.role) || a.serviceRequestId !== caseId || a.caseStatus !== "preparing_offer" ||
      a.quoteRevisionId !== quoteId || a.quoteServiceRequestId !== caseId || a.latestQuoteId !== quoteId ||
      a.quoteReviewStatus !== "approved_for_send" || a.evidenceKind !== "quibi_manual_estimate" ||
      a.evidenceCustomerId !== a.customerId || !a.serviceWanted.trim() ||
      !/^[0-9a-f]{64}$/.test(a.approvedContentSha256)) throw new Error("QUIBI_SEND_AUTHORIZATION");
  try { [a.documentId, a.customerId, a.vehicleId].forEach(validQuibiId); }
  catch { throw new Error("QUIBI_SEND_AUTHORIZATION"); }
}
async function verifyManualDocument(read: EstimateRead, a: ManualSendAuthorization) {
  if (!(await read.estimates(a.customerId)).some(d => d.id === a.documentId))
    throw new Error("QUIBI_DOCUMENT_NOT_LISTED_FOR_CUSTOMER");
  const d = await read.estimateDetail(a.documentId, a.customerId);
  if (d.id !== a.documentId || d.customerId !== a.customerId ||
      (d.vehicleId !== undefined && d.vehicleId !== a.vehicleId) || !d.lines.length ||
      d.contentSha256 !== a.approvedContentSha256 ||
      (d.externalId?.startsWith("selan-service-request:") && d.externalId !== "selan-service-request:" + a.serviceRequestId))
    throw new Error("QUIBI_DOCUMENT_REREAD_MISMATCH");
}
/** Status-only operation: never calls sendDocument, including after a timeout. */
export async function checkTrackedEstimateStatus(args: {
  journal: OperationJournal; write: Pick<EstimateWrite, "getSendStatus">; operation: Operation; documentId: string;
}) {
  const op = args.operation;
  if (!op.sendId || op.quibiId !== args.documentId || op.kind !== "send") throw new Error("QUIBI_SEND_STATUS_UNAVAILABLE");
  if (op.state === "verified" || op.state === "failed") return op;
  const result = await args.write.getSendStatus(args.documentId, op.sendId);
  return args.journal.patch(op.id, op.state, { state: result.status === "sent" ? "verified" :
    result.status === "failed" ? "failed" : "uncertain", sendStatus: result.status });
}
/** Existing documents never use create/update. The shared quote journal is the dispatch lock. */
export async function sendManualLinkedEstimate(args: {
  journal: OperationJournal; read: EstimateRead; write: Pick<EstimateWrite, "sendDocument" | "getSendStatus">;
  authorize: () => Promise<ManualSendAuthorization>; environment: Record<string, string | undefined>; origin?: string;
  serviceRequestId: string; quoteRevisionId: string; manualMatchConfirmed: boolean; manualMatchReference: string;
  testSendConfirmed: boolean; requestedRecipient?: string;
}) {
  assertQuibiDevTestSendAllowed(args.environment, args.origin);
  if (!args.testSendConfirmed) throw new Error("QUIBI_TEST_SEND_CONFIRMATION");
  const reference = args.manualMatchReference.trim();
  if (!args.manualMatchConfirmed || reference.length < 12 || reference.length > 1000)
    throw new Error("QUIBI_MANUAL_CONFIRMATION");
  const a = await args.authorize();
  validateManualAuthorization(a, args.serviceRequestId, args.quoteRevisionId);
  const recipient = quibiDevTestRecipient(args.environment, a.customerEmail);
  if (args.requestedRecipient !== undefined && args.requestedRecipient !== recipient) throw new Error("QUIBI_TEST_RECIPIENT");
  const old = await args.journal.get("send", args.quoteRevisionId);
  const stored = old ? JSON.parse(old.requestBody) : null;
  const body = { path: "manual_linked_estimate", documentId: a.documentId, recipient,
    subject: "[TEST] Predračun Quibi DEV #" + a.documentId, authorization: a,
    manualConfirmation: { actorId: a.actorId, vehicleId: a.vehicleId, serviceRequestId: a.serviceRequestId,
      serviceWanted: a.serviceWanted, reference, confirmedAt: stored?.manualConfirmation?.confirmedAt ?? new Date().toISOString() } };
  // A retry retains the original actor and evidence. Any changed authority/content fails closed.
  const json = JSON.stringify(body), sha256 = createHash("sha256").update(json).digest("hex");
  const op = old ?? await args.journal.insertOnce({ kind: "send", localEntityId: args.quoteRevisionId,
    serviceRequestId: args.serviceRequestId, externalId: null, requestBody: json, requestSha256: sha256 });
  if (op.requestBody !== json || op.requestSha256 !== sha256 || op.serviceRequestId !== args.serviceRequestId)
    throw new Error("QUIBI_SEND_AUTHORIZATION_CHANGED");
  if (op.sendId) return checkTrackedEstimateStatus({ ...args, operation: op, documentId: a.documentId });
  if (op.state !== "prepared") throw new Error("QUIBI_SEND_AMBIGUOUS_NO_RETRY");
  await verifyManualDocument(args.read, a);
  if (!await args.journal.claim(op.id, "prepared")) throw new Error("QUIBI_OPERATION_CONCURRENT");
  try {
    const fresh = await args.authorize(); validateManualAuthorization(fresh, args.serviceRequestId, args.quoteRevisionId);
    if (JSON.stringify(fresh) !== JSON.stringify(a)) throw new Error("QUIBI_SEND_AUTHORIZATION_CHANGED");
    assertQuibiDevTestSendAllowed(args.environment, args.origin);
    quibiDevTestRecipient(args.environment, fresh.customerEmail);
    await verifyManualDocument(args.read, fresh);
  } catch (cause) {
    await args.journal.patch(op.id, "dispatching", { state: "uncertain" });
    await args.journal.patch(op.id, "uncertain", { state: "failed" });
    throw cause;
  }
  try {
    const sent = await args.write.sendDocument(a.documentId, recipient, body.subject);
    return await args.journal.patch(op.id, "dispatching", { state: "uncertain", quibiId: a.documentId,
      sendId: sent.sendId, sendStatus: sent.status });
  } catch (cause) {
    await args.journal.patch(op.id, "dispatching", { state: "uncertain" }).catch(() => undefined);
    throw cause;
  }
}
