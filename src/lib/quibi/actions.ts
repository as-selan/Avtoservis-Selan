"use server";

import { createClient as createPrivilegedClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";
import { canQueryCustomerId } from "@/lib/customers/present";
import { configuredQuibiReadClient } from "@/lib/quibi/client";
import { quibiLinkEnvironment } from "./workflow-config";
import { customerFingerprint, vehicleFingerprint } from "@/lib/quibi/contracts";
import { readFailureCode, syncOutcome } from "@/lib/quibi/sync-state";

function trustedQuibiLinkDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("QUIBI_LINK_STORAGE_NOT_CONFIGURED");
  return createPrivilegedClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

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
        .select("id, external_id,quibi_environment").eq("organization_id", access.organizationId)
        .eq("provider", "quibi").eq("entity_type", "customer")
        .eq("entity_id", customerId).maybeSingle();
      if (!existingError && !existing) {
        const remote = await configuredQuibiReadClient().customer(externalId);
        const actualFingerprint = customerFingerprint(remote);
        if (actualFingerprint !== expectedFingerprint) outcome = "changed";
        else {
          const localFingerprint = customerFingerprint({ name: customer.display_name, phone: customer.phone ?? "", email: customer.email ?? "" });
          const { error } = await trustedQuibiLinkDb().from("integration_links").insert({
            quibi_environment: quibiLinkEnvironment(process.env), organization_id: access.organizationId, provider: "quibi", entity_type: "customer",
            entity_id: customerId, external_id: externalId,
            local_fingerprint: localFingerprint, external_fingerprint: actualFingerprint,
            confirmed_by: access.userId,
          });
          if (error?.code === "23505") {
            const { data: stored } = await db.from("integration_links")
              .select("external_id, quibi_environment").eq("organization_id", access.organizationId)
              .eq("provider", "quibi").eq("entity_type", "customer").eq("entity_id", customerId).maybeSingle();
            outcome = stored?.external_id === externalId && stored?.quibi_environment === quibiLinkEnvironment(process.env) ? "linked" : "already";
          } else outcome = error ? "error" : "linked";
        }
      } else outcome = existing ? (existing.external_id === externalId && existing.quibi_environment === quibiLinkEnvironment(process.env) ? "linked" : "already") : "error";
    } else outcome = "missing";
  } catch {
    outcome = "error";
  }
  revalidatePath("/dashboard", "layout");
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
      .select("external_id, external_fingerprint, local_fingerprint,quibi_environment")
      .eq("organization_id", access.organizationId).eq("provider", "quibi")
      .eq("entity_type", "customer").eq("entity_id", customerId).maybeSingle();
    if (!linkError && link) {
      if (link.quibi_environment !== quibiLinkEnvironment(process.env)) throw Error("QUIBI_ENVIRONMENT_MISMATCH");
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

/** An operator confirms one vehicle pair after a fresh owner-scoped Quibi read. */
export async function confirmQuibiVehicleLink(form: FormData): Promise<void> {
  const access = await requirePhase1OperationalAccess();
  const customerId = form.get("customerId");
  const vehicleId = form.get("vehicleId");
  const externalId = form.get("externalId");
  const expectedFingerprint = form.get("remoteFingerprint");
  if (typeof customerId !== "string" || !canQueryCustomerId(customerId)) redirect("/dashboard/stranke");
  const back = `/dashboard/stranke/${customerId}/quibi`;
  if (typeof vehicleId !== "string" || !canQueryCustomerId(vehicleId)
    || typeof externalId !== "string" || !/^\d+$/.test(externalId)
    || typeof expectedFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(expectedFingerprint)
    || form.get("confirmed") !== "yes") redirect(`${back}?vehicleResult=invalid`);

  let outcome = "error";
  try {
    const db = await createClient();
    const [{ data: link }, { data: customer }, { data: vehicle }] = await Promise.all([
      db.from("integration_links").select("external_id, external_fingerprint, local_fingerprint,quibi_environment")
        .eq("organization_id", access.organizationId).eq("provider", "quibi")
        .eq("entity_type", "customer").eq("entity_id", customerId).maybeSingle(),
      db.from("customers").select("display_name, phone, email")
        .eq("organization_id", access.organizationId).eq("id", customerId)
        .is("archived_at", null).maybeSingle(),
      db.from("vehicles").select("id, customer_id, vin, registration_current, make, model")
        .eq("organization_id", access.organizationId).eq("id", vehicleId)
        .eq("customer_id", customerId).is("archived_at", null).maybeSingle(),
    ]);
    if (link?.quibi_environment !== quibiLinkEnvironment(process.env)) throw Error("QUIBI_ENVIRONMENT_MISMATCH");
    if (!link || !customer || !vehicle) outcome = "missing";
    else {
      const quibi = configuredQuibiReadClient();
      const remoteCustomer = await quibi.customer(link.external_id);
      const localCustomerHash = customerFingerprint({ name: customer.display_name, phone: customer.phone ?? "", email: customer.email ?? "" });
      if (customerFingerprint(remoteCustomer) !== link.external_fingerprint || localCustomerHash !== link.local_fingerprint) {
        outcome = "customer_changed";
      } else {
        const remoteVehicle = await quibi.vehicle(externalId, link.external_id);
        if (remoteVehicle.disabled) outcome = "disabled";
        else if (vehicleFingerprint(remoteVehicle) !== expectedFingerprint) outcome = "changed";
        else {
          const { error } = await trustedQuibiLinkDb().from("quibi_vehicle_links").insert({
            quibi_environment: quibiLinkEnvironment(process.env), organization_id: access.organizationId, customer_id: customerId, vehicle_id: vehicleId,
            quibi_customer_id: link.external_id, quibi_vehicle_id: externalId,
            local_fingerprint: vehicleFingerprint({
              vin: vehicle.vin ?? "", registration: vehicle.registration_current ?? "",
              make: vehicle.make ?? "", model: vehicle.model ?? "",
            }),
            external_fingerprint: expectedFingerprint, confirmed_by: access.userId,
          });
          if (error?.code === "23505") {
            const { data: stored } = await db.from("quibi_vehicle_links")
              .select("quibi_customer_id, quibi_vehicle_id, quibi_environment").eq("organization_id", access.organizationId)
              .eq("customer_id", customerId).eq("vehicle_id", vehicleId).maybeSingle();
            outcome = stored?.quibi_customer_id === link.external_id && stored?.quibi_vehicle_id === externalId && stored?.quibi_environment === quibiLinkEnvironment(process.env) ? "linked" : "already";
          } else outcome = error ? "error" : "linked";
        }
      }
    }
  } catch { outcome = "error"; }
  revalidatePath("/dashboard", "layout");
  redirect(`${back}?vehicleResult=${outcome}`);
}

/** Records drift without overwriting either system's confirmed baseline. */
export async function refreshQuibiVehicleLink(form: FormData): Promise<void> {
  const access = await requirePhase1OperationalAccess();
  const customerId = form.get("customerId");
  const vehicleId = form.get("vehicleId");
  if (typeof customerId !== "string" || !canQueryCustomerId(customerId)) redirect("/dashboard/stranke");
  const back = `/dashboard/stranke/${customerId}/quibi`;
  if (typeof vehicleId !== "string" || !canQueryCustomerId(vehicleId)) redirect(`${back}?vehicleRefresh=invalid`);
  let outcome = "error";
  try {
    const db = await createClient();
    const { data: link } = await db.from("quibi_vehicle_links")
      .select("quibi_customer_id, quibi_vehicle_id, local_fingerprint, external_fingerprint,quibi_environment")
      .eq("organization_id", access.organizationId).eq("customer_id", customerId)
      .eq("vehicle_id", vehicleId).maybeSingle();
    if (link) {
      const { data: vehicle } = await db.from("vehicles")
        .select("customer_id, vin, registration_current, make, model")
        .eq("organization_id", access.organizationId).eq("id", vehicleId)
        .is("archived_at", null).maybeSingle();
      let state: ReturnType<typeof syncOutcome> | { sync_status: "error"; last_seen_fingerprint: null; last_error_code: string };
      try {
        if (!vehicle || vehicle.customer_id !== customerId || link.quibi_environment !== quibiLinkEnvironment(process.env)) throw new Error("QUIBI_CUSTOMER_ID_MISMATCH");
        const remote = await configuredQuibiReadClient().vehicle(link.quibi_vehicle_id, link.quibi_customer_id);
        if (remote.disabled) throw new Error("QUIBI_INVALID_RESPONSE");
        state = syncOutcome(link.external_fingerprint, vehicleFingerprint(remote), link.local_fingerprint,
          vehicleFingerprint({ vin: vehicle.vin ?? "", registration: vehicle.registration_current ?? "",
            make: vehicle.make ?? "", model: vehicle.model ?? "" }));
      } catch (error) {
        state = { sync_status: "error", last_seen_fingerprint: null, last_error_code: readFailureCode(error) };
      }
      const { error } = await trustedQuibiLinkDb().from("quibi_vehicle_links").update({ ...state, last_checked_at: new Date().toISOString() })
        .eq("organization_id", access.organizationId).eq("customer_id", customerId).eq("vehicle_id", vehicleId);
      if (!error) outcome = state.sync_status;
    }
  } catch { outcome = "error"; }
  redirect(`${back}?vehicleRefresh=${outcome}`);
}
