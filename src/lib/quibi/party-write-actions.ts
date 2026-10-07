"use server";

import { createClient as createPrivilegedClient } from "@supabase/supabase-js";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";
import { createQuibiReadClient } from "./client";
import { customerFingerprint, vehicleFingerprint } from "./contracts";
import { createOrReconcileCustomer, createOrReconcileVehicle } from "./party-write-workflow";
import { customerCreateInput, vehicleCreateInput } from "./party-write-input";
import { configuredQuibiDevWriteClient } from "./write-client";
import { quibiDevOperationJournal } from "./write-journal";

type Result = { ok: true; detail: string } | { ok: false; message: string };
const fail = (message: string): Result => ({ ok: false, message });

async function context() {
  const access = await requirePhase1OperationalAccess();
  if (!["owner", "admin"].includes(access.role)) throw new Error("QUIBI_WRITE_FORBIDDEN");
  // This checks the exact DEV origin, environment, credentials and explicit flag.
  const write = configuredQuibiDevWriteClient();
  const read = createQuibiReadClient({ username: process.env.QUIBI_DEV_USERNAME ?? "",
    password: process.env.QUIBI_DEV_PASSWORD ?? "" });
  const db = await createClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("QUIBI_LINK_STORAGE_NOT_CONFIGURED");
  const trusted = createPrivilegedClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { access, db, trusted, write, read,
    journal: quibiDevOperationJournal(access.organizationId, access.userId) };
}

export async function createQuibiDevCustomer(form: FormData): Promise<Result> {
  const customerId = customerCreateInput(form);
  if (!customerId)
    return fail("Potrdite ustvarjanje nove stranke po preverjanju obstoječih Quibijevih zapisov.");
  try {
    const ctx = await context();
    const [{ data: customer, error: customerError }, { data: link, error: linkError },
      { data: serviceCase, error: caseError }] = await Promise.all([
      ctx.db.from("customers").select("display_name,phone,email").eq("organization_id", ctx.access.organizationId)
        .eq("id", customerId).is("archived_at", null).maybeSingle(),
      ctx.db.from("integration_links").select("external_id").eq("organization_id", ctx.access.organizationId)
        .eq("provider", "quibi").eq("entity_type", "customer").eq("entity_id", customerId).maybeSingle(),
      ctx.db.from("service_requests").select("id").eq("organization_id", ctx.access.organizationId)
        .eq("customer_id", customerId).is("archived_at", null).order("created_at", { ascending: true })
        .limit(1).maybeSingle(),
    ]);
    if (customerError || linkError || caseError || !customer || !serviceCase || link)
      return fail("Stranka je že povezana ali nima veljavnega servisnega primera.");
    const input = { serviceRequestId: serviceCase.id, customerId, name: customer.display_name,
      phone: customer.phone ?? "", email: customer.email ?? "" };
    const op = await createOrReconcileCustomer({ journal: ctx.journal, read: ctx.read, write: ctx.write, input });
    if (!op.quibiId) return fail("Quibijevega ID-ja ni mogoče potrditi.");
    const remote = await ctx.read.customer(op.quibiId);
    if (remote.remoteId !== customerId || customerFingerprint(remote) !== customerFingerprint({
      name: input.name, phone: input.phone, email: input.email,
    })) return fail("Nova stranka v Quibiju se ne ujema s Selanovimi podatki.");
    const { error } = await ctx.trusted.from("integration_links").insert({
      organization_id: ctx.access.organizationId, provider: "quibi", entity_type: "customer",
      entity_id: customerId, external_id: op.quibiId,
      local_fingerprint: customerFingerprint({ name: input.name, phone: input.phone, email: input.email }),
      external_fingerprint: customerFingerprint(remote), confirmed_by: ctx.access.userId,
      sync_status: "ok", last_checked_at: new Date().toISOString(),
    });
    if (error) return fail("Stranka je preverjeno ustvarjena v Quibiju, povezava pa zahteva pregled; ne ustvarjajte je znova.");
    return { ok: true, detail: `Quibi DEV stranka #${op.quibiId} je ponovno prebrana in povezana.` };
  } catch (error) {
    if (error instanceof Error && error.message === "QUIBI_CUSTOMER_MATCH_REVIEW_REQUIRED")
      return fail("V Quibiju je možno ujemanje. Najprej ročno preglejte in povežite obstoječo stranko.");
    return fail("Ustvarjanje stranke ni zanesljivo potrjeno. Ponovni poskus samo preveri remote_id; ne pošlje novega create zahtevka.");
  }
}

export async function createQuibiDevVehicle(form: FormData): Promise<Result> {
  const inputIds = vehicleCreateInput(form);
  if (!inputIds)
    return fail("Potrdite ustvarjanje vozila za preverjeno Quibijevo stranko.");
  const { customerId, vehicleId } = inputIds;
  try {
    const ctx = await context();
    const [{ data: customer }, { data: link }, { data: vehicle }, { data: existingLink },
      { data: serviceCase }] = await Promise.all([
      ctx.db.from("customers").select("display_name,phone,email").eq("organization_id", ctx.access.organizationId)
        .eq("id", customerId).is("archived_at", null).maybeSingle(),
      ctx.db.from("integration_links").select("external_id,local_fingerprint,external_fingerprint,sync_status")
        .eq("organization_id", ctx.access.organizationId).eq("provider", "quibi")
        .eq("entity_type", "customer").eq("entity_id", customerId).maybeSingle(),
      ctx.db.from("vehicles").select("customer_id,vin,registration_current,make,model")
        .eq("organization_id", ctx.access.organizationId).eq("customer_id", customerId)
        .eq("id", vehicleId).is("archived_at", null).maybeSingle(),
      ctx.db.from("quibi_vehicle_links").select("quibi_vehicle_id")
        .eq("organization_id", ctx.access.organizationId).eq("vehicle_id", vehicleId).maybeSingle(),
      ctx.db.from("service_requests").select("id").eq("organization_id", ctx.access.organizationId)
        .eq("customer_id", customerId).eq("vehicle_id", vehicleId).is("archived_at", null)
        .order("created_at", { ascending: true }).limit(1).maybeSingle(),
    ]);
    if (!customer || !link || !vehicle || !serviceCase || existingLink || link.sync_status !== "ok" ||
        !vehicle.registration_current?.trim() || !vehicle.vin?.trim())
      return fail("Vozilo je že povezano ali manjka preverjena stranka, registracija oziroma številka šasije.");
    const remoteCustomer = await ctx.read.customer(link.external_id);
    if (customerFingerprint(remoteCustomer) !== link.external_fingerprint ||
        customerFingerprint({ name: customer.display_name, phone: customer.phone ?? "", email: customer.email ?? "" }) !== link.local_fingerprint)
      return fail("Povezava stranke se je spremenila. Najprej jo ponovno preverite.");
    const input = { serviceRequestId: serviceCase.id, vehicleId, quibiCustomerId: link.external_id,
      vin: vehicle.vin, registration: vehicle.registration_current,
      make: vehicle.make ?? "", model: vehicle.model ?? "" };
    const op = await createOrReconcileVehicle({ journal: ctx.journal, read: ctx.read, write: ctx.write, input });
    if (!op.quibiId) return fail("Quibijevega ID-ja vozila ni mogoče potrditi.");
    const remote = await ctx.read.vehicle(op.quibiId, link.external_id);
    const fingerprint = vehicleFingerprint({ vin: input.vin, registration: input.registration,
      make: input.make, model: input.model });
    if (remote.disabled || remote.customerId !== link.external_id || vehicleFingerprint(remote) !== fingerprint)
      return fail("Novo Quibijevo vozilo se ne ujema s tem primerom.");
    const { error } = await ctx.trusted.from("quibi_vehicle_links").insert({
      organization_id: ctx.access.organizationId, customer_id: customerId, vehicle_id: vehicleId,
      quibi_customer_id: link.external_id, quibi_vehicle_id: op.quibiId,
      local_fingerprint: fingerprint, external_fingerprint: vehicleFingerprint(remote),
      confirmed_by: ctx.access.userId, sync_status: "ok", last_checked_at: new Date().toISOString(),
    });
    if (error) return fail("Vozilo je preverjeno ustvarjeno v Quibiju, povezava pa zahteva pregled; ne ustvarjajte ga znova.");
    return { ok: true, detail: `Quibi DEV vozilo #${op.quibiId} je ponovno prebrano in povezano.` };
  } catch (error) {
    if (error instanceof Error && error.message === "QUIBI_VEHICLE_MATCH_REVIEW_REQUIRED")
      return fail("V Quibiju je možno ujemanje vozila. Najprej ročno preglejte obstoječi zapis.");
    return fail("Ustvarjanje vozila ni zanesljivo potrjeno. Ponovni poskus samo preveri vozila iste stranke; ne pošlje novega create zahtevka.");
  }
}
