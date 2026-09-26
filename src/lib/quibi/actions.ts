"use server";

import { redirect } from "next/navigation";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";
import { canQueryCustomerId } from "@/lib/customers/present";
import { configuredQuibiReadClient } from "@/lib/quibi/client";
import { customerFingerprint } from "@/lib/quibi/contracts";

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
