"use server";
import { createClient as privileged } from "@supabase/supabase-js";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";
import { quibiWorkflowContext } from "./workflow-context";
import { configuredQuibiWorkflowWriteClient } from "./write-client";
import { quibiWorkflowJournal } from "./write-journal";
import { quibiWorkflowConfig } from "./workflow-config";
import { approveAndSendEstimate, pollEstimateSend, type SendSnapshot } from "./unified-workflow";
import { reviewManualQuibiEstimate } from "./manual-estimate-action";
import type { Operation } from "./write-workflow";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result = {
    ok: true;
    status: string;
    detail: string;
} | {
    ok: false;
    message: string;
};
function ids(form: FormData) {
    const caseId = form.get("serviceRequestId"), quoteId = form.get("quoteId");
    if (typeof caseId !== "string" || !uuid.test(caseId) || typeof quoteId !== "string" || !uuid.test(quoteId))
        throw Error("INVALID_CASE");
    return { caseId, quoteId };
}
async function snapshot(caseId: string, quoteId: string): Promise<SendSnapshot> {
    const c = await quibiWorkflowContext(caseId);
    const [quote, last, approval] = await Promise.all([
        c.db.from("quotes").select("id,service_request_id,internal_review_status,evidence_kind,evidence_payload,content_sha256,quibi_environment")
            .eq("organization_id", c.access.organizationId).eq("service_request_id", caseId).eq("id", quoteId).maybeSingle(),
        c.db.from("quotes").select("id").eq("organization_id", c.access.organizationId).eq("service_request_id", caseId).order("version_no", { ascending: false }).limit(1).maybeSingle(),
        c.db.from("customer_approvals").select("delivery_status").eq("organization_id", c.access.organizationId).eq("quote_id", quoteId).is("revoked_at", null).maybeSingle()
    ]);
    const q = quote.data, e = q?.evidence_payload as {
        external_id?: unknown;
        customer_external_id?: unknown;
    } | null;
    if (quote.error || last.error || approval.error || approval.data?.delivery_status === "delivered" || !q || q.quibi_environment !== quibiWorkflowConfig(process.env, "send").mode || q.evidence_kind !== "quibi_manual_estimate" ||
        typeof e?.external_id !== "string" || e.customer_external_id !== c.link.external_id)
        throw Error("QUIBI_QUOTE_UNAVAILABLE");
    if (!(await c.read.estimates(c.link.external_id)).some(d => d.id === e.external_id))
        throw Error("QUIBI_DOCUMENT_NOT_LISTED");
    return { actorId: c.access.userId, organizationId: c.access.organizationId, role: c.access.role, caseId: q.service_request_id, quoteId: q.id, latestQuoteId: last.data?.id ?? "",
        caseStatus: c.request.status, reviewStatus: q.internal_review_status, customerId: c.link.external_id, vehicleId: c.vehicleLink.quibi_vehicle_id,
        documentId: e.external_id, serviceWanted: c.request.service_wanted, customerEmail: c.customer.email, remoteEmail: c.remoteCustomer.email, sha256: q.content_sha256,
        detail: await c.read.estimateDetail(e.external_id, c.link.external_id) };
}
async function recordAcceptance(orgId: string, quoteId: string, op: Operation) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !secret)
        throw Error("STORAGE_UNAVAILABLE");
    const db = privileged(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("record_quibi_api_dispatch", { p_organization_id: orgId, p_quote_id: quoteId, p_operation_id: op.id });
    if (error || (data as {
        ok?: boolean;
    } | null)?.ok !== true)
        throw Error("QUIBI_LOCAL_ACCEPTANCE_RECONCILIATION_REQUIRED");
}
function success(status: string | null, dev: boolean): Result {
    return { ok: true, status: status ?? "unknown", detail: status === "sent"
            ? (dev ? "DEV test: " : "") + "Predano poštnemu strežniku. Prejem pri naslovniku ni potrjen."
            : status === "failed" ? "Quibi je pošiljanje zavrnil. Ponovnega dispatcha za to različico ni." : "Quibi je pošiljanje uvrstil v čakalno vrsto." };
}
export async function approveAndSendQuibiEstimate(form: FormData): Promise<Result> {
    try {
        const config = quibiWorkflowConfig(process.env, "send"), { caseId, quoteId } = ids(form);
        const access = await requirePhase1OperationalAccess();
        if (!["owner", "admin"].includes(access.role))
            throw Error("FORBIDDEN");
        const op = await approveAndSendEstimate({ environment: process.env, caseId, quoteId, journal: quibiWorkflowJournal(access.organizationId, access.userId),
            write: configuredQuibiWorkflowWriteClient(), authorize: () => snapshot(caseId, quoteId),
            approve: async () => { const r = await reviewManualQuibiEstimate(quoteId, "approve"); if (!r.ok)
                throw Error("APPROVAL_FAILED"); },
            recordAcceptance: op => recordAcceptance(access.organizationId, quoteId, op), reviewConfirmed: form.get("reviewConfirmed") === "yes",
            displayedSha256: String(form.get("displayedSha256") ?? ""), displayedAmount: String(form.get("displayedAmount") ?? ""), manualReference: String(form.get("manualReference") ?? "") });
        return success(op.sendStatus, config.mode === "dev");
    }
    catch {
        return { ok: false, message: "Pošiljanje ni potrjeno. Preverite konfiguracijo, odobritev in ujemanje. Ob neznanem izidu ne pošiljajte ponovno; uporabite preverjanje statusa." };
    }
}
export async function pollQuibiEstimateSend(form: FormData): Promise<Result> {
    try {
        const config = quibiWorkflowConfig(process.env, "send"), { caseId, quoteId } = ids(form), access = await requirePhase1OperationalAccess();
        if (!["owner", "admin"].includes(access.role))
            throw Error("FORBIDDEN");
        const db = await createClient();
        const { data: q, error } = await db.from("quotes").select("evidence_payload")
            .eq("organization_id", access.organizationId).eq("service_request_id", caseId).eq("id", quoteId).maybeSingle();
        const journal = quibiWorkflowJournal(access.organizationId, access.userId), stored = await journal.get("send", quoteId);
        const e = q?.evidence_payload as {
            external_id?: unknown;
        } | null;
        if (error || !q || !stored || stored.quibiId !== e?.external_id || stored.serviceRequestId !== caseId)
            throw Error("FORBIDDEN");
        const op = await pollEstimateSend({ environment: process.env, caseId, quoteId, journal, write: configuredQuibiWorkflowWriteClient(),
            recordAcceptance: op => recordAcceptance(access.organizationId, quoteId, op) });
        return success(op.sendStatus, config.mode === "dev");
    }
    catch {
        return { ok: false, message: "Status ali samodejna lokalna evidenca nista potrjena. Pošiljanje se ne ponovi; preverite journal in send_id." };
    }
}
