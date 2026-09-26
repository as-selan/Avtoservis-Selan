"use server";

import { redirect } from "next/navigation";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";
import { canQueryCustomerId } from "@/lib/customers/present";
import { configuredQuibiReadClient } from "@/lib/quibi/client";
import { customerFingerprint } from "@/lib/quibi/contracts";
import { readFailureCode, syncOutcome } from "@/lib/quibi/sync-state";

export async function confirmQuibiCustomerLink(form: FormData): Promise<void> {
  const access = await requirePhase1OperationalAccess();
  const customerId = form.get("customerId");
  const externalId = form.get("externalId");
  const expectedFingerprint = form.get("remoteFingerprint");
  if (typeof customerId !== "string" || !canQueryCustomerId(customerId)) redirect("/dashboard/stranke");
  const back = `/dashboard/stranke/${customerId}/quibi`;
  if (typeof externalId !== "string" || !/^\d+$/.test(externalId) ||
      typeof expectedFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(expectedFingerprint) ||
      form.get("confirmed") !== "yes") redirect(`${back}?error=invalid`);

  let outcome = "error";
  try {
    const db = await createClient();
    const { data: customer, error: customerError } = await db.from("customers")
      .select("id, display_name, phone, email")
      .eq("organization_id", access.organizationId).eq("id", customerId)
      .is("archived_at", null).maybeSingle();
    if (!customerError && customer) {
      const { data: existing, error: existingError } = await db.from("integration_links")
        .select("id").eq("organization_id", access.organizationId)
        .eq("provider", "quibi").eq("entity_type", "customer")
        .eq("entity_id", customerId).maybeSingle();
      if (!existingError && !existing) {
        const remote = await configuredQuibiReadClient().customer(externalId);
        const actualFingerprint = customerFingerprint(remote);
        if (actualFingerprint !== expectedFingerprint) outcome = "changed";
        else {
          const localFingerprint = customerFingerprint({ name: customer.display_name, phone: customer.phone ?? "", email: customer.email ?? "" });
          const { error } = await db.from("integration_links").insert({
            organization_id: access.organizationId, provider: "quibi", entity_type: "customer",
            entity_id: customerId, external_id: externalId,
            local_fingerprint: localFingerprint, external_fingerprint: actualFingerprint,
            confirmed_by: access.userId,
          });
          outcome = error?.code === "23505" ? "already" : error ? "error" : "linked";
        }
      } else outcome = existing ? "already" : "error";
    } else outcome = "missing";
  } catch {
    outcome = "error";
  }
  redirect(`${back}?result=${outcome}`);
}

/** Re-checks only the confirmed Quibi customer. Never changes the baseline or Quibi. */
export async function refreshQuibiCustomerLink(form: FormData): Promise<void> {
  const access = await requirePhase1OperationalAccess();
  const customerId = form.get("customerId");
  if (typeof customerId !== "string" || !canQueryCustomerId(customerId)) redirect("/dashboard/stranke");
  const back = `/dashboard/stranke/${customerId}/quibi`;
  let outcome = "error";
  try {
    const db = await createClient();
    const { data: customer, error: customerError } = await db.from("customers")
      .select("id, display_name, phone, email").eq("organization_id", access.organizationId)
      .eq("id", customerId).is("archived_at", null).maybeSingle();
    if (customerError || !customer) throw new Error("QUIBI_CUSTOMER_UNAVAILABLE");
    const { data: link, error: linkError } = await db.from("integration_links")
      .select("external_id, external_fingerprint, local_fingerprint")
      .eq("organization_id", access.organizationId).eq("provider", "quibi")
      .eq("entity_type", "customer").eq("entity_id", customerId).maybeSingle();
    if (!linkError && link) {
      let state: {
        sync_status: "ok" | "local_changed" | "remote_changed" | "both_changed" | "error";
        last_seen_fingerprint: string | null;
        last_error_code: string | null;
      };
      try {
        const remote = await configuredQuibiReadClient().customer(link.external_id);
        const localFingerprint = customerFingerprint({
          name: customer.display_name, phone: customer.phone ?? "", email: customer.email ?? "",
        });
        state = syncOutcome(link.external_fingerprint, customerFingerprint(remote), link.local_fingerprint, localFingerprint);
      } catch (error) {
        state = { sync_status: "error", last_seen_fingerprint: null, last_error_code: readFailureCode(error) };
      }
      const { error } = await db.from("integration_links").update({
        ...state, last_checked_at: new Date().toISOString(),
      }).eq("organization_id", access.organizationId).eq("provider", "quibi")
        .eq("entity_type", "customer").eq("entity_id", customerId)
        .eq("external_id", link.external_id);
      if (!error) outcome = state.sync_status;
    }
  } catch {
    outcome = "error";
  }
  redirect(`${back}?refresh=${outcome}`);
}
