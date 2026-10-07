import "server-only";
import { createClient as createPrivilegedClient } from "@supabase/supabase-js";
import type { NewOperation, Operation, OperationJournal, OperationPatch, OperationState } from "./write-workflow";

type Row = {
  id: string; kind: Operation["kind"]; local_entity_id: string; service_request_id: string;
  external_id: string | null; request_body: string; request_sha256: string;
  state: OperationState; quibi_id: string | null; document_number: string | null;
  send_id: string | null; send_status: Operation["sendStatus"];
};

function project(row: Row): Operation {
  return { id: row.id, kind: row.kind, localEntityId: row.local_entity_id,
    serviceRequestId: row.service_request_id, externalId: row.external_id,
    requestBody: row.request_body, requestSha256: row.request_sha256,
    state: row.state, quibiId: row.quibi_id, documentNumber: row.document_number,
    sendId: row.send_id, sendStatus: row.send_status };
}

/** Server-only storage. The caller must verify active workshop membership first. */
export function quibiDevOperationJournal(organizationId: string, actorId: string): OperationJournal {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("QUIBI_JOURNAL_UNAVAILABLE");
  const db = createPrivilegedClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const table = () => db.from("quibi_dev_operation_journal");
  async function byId(id: string): Promise<Operation> {
    const { data, error } = await table().select("*").eq("organization_id", organizationId)
      .eq("id", id).single();
    if (error || !data) throw new Error("QUIBI_JOURNAL_READ_FAILED");
    return project(data as Row);
  }
  return {
    async get(kind, localEntityId) {
      const { data, error } = await table().select("*").eq("organization_id", organizationId)
        .eq("kind", kind).eq("local_entity_id", localEntityId).maybeSingle();
      if (error) throw new Error("QUIBI_JOURNAL_READ_FAILED");
      return data ? project(data as Row) : null;
    },
    async insertOnce(entry: NewOperation) {
      const { data, error } = await table().insert({
        organization_id: organizationId, created_by_profile_id: actorId,
        service_request_id: entry.serviceRequestId, local_entity_id: entry.localEntityId,
        kind: entry.kind, external_id: entry.externalId, request_body: entry.requestBody,
        request_sha256: entry.requestSha256,
      }).select("*").single();
      if (!error && data) return project(data as Row);
      if (error?.code === "23505") {
        const existing = await this.get(entry.kind, entry.localEntityId);
        if (existing) return existing;
      }
      throw new Error("QUIBI_JOURNAL_INSERT_FAILED");
    },
    async claim(id, expected) {
      const { data, error } = await table().update({ state: "dispatching",
        attempted_at: new Date().toISOString() })
        .eq("organization_id", organizationId).eq("id", id).eq("state", expected)
        .select("id").maybeSingle();
      if (error) throw new Error("QUIBI_JOURNAL_CLAIM_FAILED");
      return Boolean(data);
    },
    async patch(id, expected, changes: OperationPatch) {
      const update: Record<string, unknown> = {};
      if (changes.state) update.state = changes.state;
      if (changes.quibiId !== undefined) update.quibi_id = changes.quibiId;
      if (changes.documentNumber !== undefined) update.document_number = changes.documentNumber;
      if (changes.sendId !== undefined) update.send_id = changes.sendId;
      if (changes.sendStatus !== undefined) {
        update.send_status = changes.sendStatus;
        update.send_status_checked_at = new Date().toISOString();
      }
      if (changes.state === "verified") update.verified_at = new Date().toISOString();
      const { data, error } = await table().update(update).eq("organization_id", organizationId)
        .eq("id", id).eq("state", expected).select("id").maybeSingle();
      if (error || !data) throw new Error("QUIBI_JOURNAL_CONCURRENT_CHANGE");
      return byId(id);
    },
  };
}
