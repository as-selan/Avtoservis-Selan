import { assertLocalQuibiSendTarget } from "./local-send-policy.ts";
import { createHash } from "node:crypto";
import type { Operation, OperationJournal, EstimateWrite } from "./write-workflow.ts";
import { checkTrackedEstimateStatus } from "./write-workflow.ts";
import { quibiWorkflowConfig, workflowRecipient } from "./workflow-config.ts";
export type SendSnapshot = {
    actorId: string;
    organizationId: string;
    role: string;
    caseId: string;
    quoteId: string;
    latestQuoteId: string;
    caseStatus: string;
    reviewStatus: string;
    customerId: string;
    vehicleId: string;
    documentId: string;
    serviceWanted: string;
    customerEmail: string | null;
    remoteEmail: string;
    sha256: string;
    detail: {
        id: string;
        customerId: string;
        vehicleId?: string;
        externalId?: string;
        amount: string;
        contentSha256: string;
        lines: unknown[];
    };
};
type Dependencies = {
    journal: OperationJournal;
    write: Pick<EstimateWrite, "sendDocument" | "getSendStatus">;
    environment: Record<string, string | undefined>;
    authorize: () => Promise<SendSnapshot>;
    recordAcceptance: (operation: Operation) => Promise<void>;
    caseId: string;
    quoteId: string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateSendSnapshot(s: SendSnapshot, caseId: string, quoteId: string) {
    if (![s.actorId, s.organizationId, caseId, quoteId].every(x => uuid.test(x)) || !["owner", "admin"].includes(s.role) ||
        s.caseId !== caseId || s.quoteId !== quoteId || s.latestQuoteId !== quoteId || s.caseStatus !== "preparing_offer" ||
        !["unreviewed", "approved_for_send"].includes(s.reviewStatus) || !s.serviceWanted.trim() ||
        ![s.customerId, s.vehicleId, s.documentId].every(x => /^[1-9]\d*$/.test(x) && Number.isSafeInteger(Number(x))) ||
        !/^[0-9a-f]{64}$/.test(s.sha256))
        throw Error("QUIBI_SEND_AUTHORIZATION");
    const d = s.detail;
    if (d.id !== s.documentId || d.customerId !== s.customerId || (d.vehicleId !== undefined && d.vehicleId !== s.vehicleId) ||
        d.contentSha256 !== s.sha256 || !d.lines.length || !/^[0-9]+(?:\.[0-9]{1,2})?$/.test(d.amount) || Number(d.amount) <= 0 || !Number.isFinite(Number(d.amount)) || Number(d.amount) > 1000000 ||
        (d.externalId?.startsWith("selan-service-request:") && d.externalId !== "selan-service-request:" + caseId))
        throw Error("QUIBI_DOCUMENT_CHANGED");
}
const identity = (s: SendSnapshot) => ({ organizationId: s.organizationId, caseId: s.caseId, quoteId: s.quoteId, customerId: s.customerId,
    vehicleId: s.vehicleId, documentId: s.documentId, serviceWanted: s.serviceWanted, sha256: s.sha256, amount: Number(s.detail.amount), customerEmail: s.customerEmail, remoteEmail: s.remoteEmail });
export async function approveAndSendEstimate(args: Dependencies & {
    approve: () => Promise<void>;
    reviewConfirmed: boolean;
    displayedSha256: string;
    displayedAmount: string;
    manualReference: string;
}) {
    const config = quibiWorkflowConfig(args.environment, "send");
    if (await args.journal.get("send", args.quoteId))
        throw Error("QUIBI_SEND_ALREADY_ATTEMPTED");
    const s = await args.authorize();
    validateSendSnapshot(s, args.caseId, args.quoteId);
    assertLocalQuibiSendTarget(args.environment, s);
    const recipient = workflowRecipient(args.environment, s.customerEmail, s.remoteEmail);
    if (!args.reviewConfirmed || args.displayedSha256 !== s.sha256 || Number(args.displayedAmount) !== Number(s.detail.amount))
        throw Error("QUIBI_REVIEW_REQUIRED");
    const explicitIdentity = s.detail.vehicleId === s.vehicleId && s.detail.externalId === "selan-service-request:" + args.caseId;
    const reference = args.manualReference.trim();
    if (!explicitIdentity && (reference.length < 12 || reference.length > 1000))
        throw Error("QUIBI_MANUAL_IDENTITY_PROOF_REQUIRED");
    if (s.reviewStatus === "unreviewed")
        await args.approve();
    const approved = await args.authorize();
    validateSendSnapshot(approved, args.caseId, args.quoteId);
    if (approved.reviewStatus !== "approved_for_send" || JSON.stringify(identity(approved)) !== JSON.stringify(identity(s)))
        throw Error("QUIBI_APPROVAL_CHANGED");
    const body = { path: "unified_quibi_send", mode: config.mode, ...identity(s), recipient, subject: "Predračun #" + s.documentId,
        confirmation: { actorId: s.actorId, confirmedAt: new Date().toISOString(), reference: explicitIdentity ? "API identity and explicit reviewed service confirmation" : reference } };
    const json = JSON.stringify(body), sha = createHash("sha256").update(json).digest("hex");
    const op = await args.journal.insertOnce({ kind: "send", localEntityId: args.quoteId, serviceRequestId: args.caseId, externalId: null, requestBody: json, requestSha256: sha });
    if (op.requestBody !== json || op.requestSha256 !== sha || op.state !== "prepared")
        throw Error("QUIBI_SEND_ALREADY_ATTEMPTED");
    if (!await args.journal.claim(op.id, "prepared"))
        throw Error("QUIBI_SEND_ALREADY_ATTEMPTED");
    try {
        const final = await args.authorize();
        validateSendSnapshot(final, args.caseId, args.quoteId);
        if (final.reviewStatus !== "approved_for_send" || JSON.stringify(identity(final)) !== JSON.stringify(identity(s)) ||
            workflowRecipient(args.environment, final.customerEmail, final.remoteEmail) !== recipient)
            throw Error("QUIBI_APPROVAL_CHANGED");
    }
    catch (e) {
        await args.journal.patch(op.id, "dispatching", { state: "uncertain" });
        await args.journal.patch(op.id, "uncertain", { state: "failed" });
        throw e;
    }
    try {
        const result = await args.write.sendDocument(s.documentId, recipient, config.mode === "dev" ? "[TEST] " + body.subject : body.subject);
        return await args.journal.patch(op.id, "dispatching", { state: "uncertain", quibiId: s.documentId, quibiContentSha256: s.sha256, sendId: result.sendId, sendStatus: "queued" });
    }
    catch (e) {
        await args.journal.patch(op.id, "dispatching", { state: "uncertain" }).catch(() => undefined);
        throw e;
    }
}
/** No send operation is available in the polling branch. Replays only repair local evidence. */
export async function pollEstimateSend(args: Omit<Dependencies, "authorize">) {
    const config = quibiWorkflowConfig(args.environment, "send");
    const op = await args.journal.get("send", args.quoteId);
    if (!op || op.serviceRequestId !== args.caseId || op.localEntityId !== args.quoteId || !op.quibiId)
        throw Error("QUIBI_SEND_STATUS_UNAVAILABLE");
    const body = JSON.parse(op.requestBody) as {
        path?: string;
        mode?: string;
    };
    if (config.mode === "production" && (body.path !== "unified_quibi_send" || body.mode !== "production"))
        throw Error("QUIBI_SEND_ENVIRONMENT_MISMATCH");
    if (createHash("sha256").update(op.requestBody).digest("hex") !== op.requestSha256)
        throw Error("QUIBI_SEND_JOURNAL_INTEGRITY");
    if (body.path === "unified_quibi_send" && body.mode !== config.mode)
        throw Error("QUIBI_SEND_ENVIRONMENT_MISMATCH");
    const current = await checkTrackedEstimateStatus({ ...args, operation: op, documentId: op.quibiId });
    if (config.mode === "production" && body.path === "unified_quibi_send" && current.sendStatus === "sent")
        await args.recordAcceptance(current);
    return current;
}
