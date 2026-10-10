import "server-only";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";
import { configuredQuibiReadClient } from "./client";
import { customerFingerprint } from "./contracts";
import { verifiedVehicleLink } from "./price-suggestion";
import { configuredQuibiWorkflowWriteClient } from "./write-client";
import { quibiWorkflowConfig } from "./workflow-config";
import { quibiWorkflowJournal } from "./write-journal";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function quibiWorkflowContext(serviceRequestId: string) {
    const access = await requirePhase1OperationalAccess();
    if (!["owner", "admin"].includes(access.role) || !uuid.test(serviceRequestId))
        throw new Error("QUIBI_WRITE_FORBIDDEN");
    // Fails closed even when invoked directly without a visible UI button.
    const write = configuredQuibiWorkflowWriteClient();
    const db = await createClient();
    const { data: request, error: requestError } = await db.from("service_requests")
        .select("customer_id,vehicle_id,status,service_wanted").eq("organization_id", access.organizationId)
        .eq("id", serviceRequestId).is("archived_at", null).maybeSingle();
    if (requestError || !request || request.status !== "preparing_offer" || !request.customer_id ||
        !request.vehicle_id || !request.service_wanted?.trim())
        throw new Error("QUIBI_CASE_NOT_READY");
    const [customerResult, vehicleResult, linkResult, vehicleLinkResult, prepResult, fixedResult] = await Promise.all([
        db.from("customers").select("display_name,phone,email").eq("organization_id", access.organizationId)
            .eq("id", request.customer_id).is("archived_at", null).maybeSingle(),
        db.from("vehicles").select("customer_id,vin,registration_current,make,model")
            .eq("organization_id", access.organizationId).eq("id", request.vehicle_id)
            .is("archived_at", null).maybeSingle(),
        db.from("integration_links").select("external_id,local_fingerprint,external_fingerprint,sync_status,quibi_environment")
            .eq("organization_id", access.organizationId).eq("provider", "quibi")
            .eq("entity_type", "customer").eq("entity_id", request.customer_id).maybeSingle(),
        db.from("quibi_vehicle_links").select("quibi_customer_id,quibi_vehicle_id,sync_status,local_fingerprint,external_fingerprint,quibi_environment")
            .eq("organization_id", access.organizationId).eq("customer_id", request.customer_id)
            .eq("vehicle_id", request.vehicle_id).maybeSingle(),
        db.from("offer_preparations").select("status").eq("organization_id", access.organizationId)
            .eq("service_request_id", serviceRequestId).maybeSingle(),
        db.from("published_fixed_price_cases").select("id").eq("organization_id", access.organizationId)
            .eq("service_request_id", serviceRequestId).maybeSingle(),
    ]);
    if ([customerResult, vehicleResult, linkResult, vehicleLinkResult, prepResult, fixedResult]
        .some((result) => result.error) || !customerResult.data || !vehicleResult.data ||
        !linkResult.data || !vehicleLinkResult.data || fixedResult.data ||
        prepResult.data?.status !== "ready_for_provider" ||
        vehicleResult.data.customer_id !== request.customer_id || linkResult.data.sync_status !== "ok")
        throw new Error("QUIBI_CASE_LINKS_NOT_READY");
    const mode = quibiWorkflowConfig(process.env, "write").mode;
    if (linkResult.data.quibi_environment !== mode || vehicleLinkResult.data.quibi_environment !== mode)
        throw new Error("QUIBI_ENVIRONMENT_MISMATCH");
    const customer = customerResult.data;
    const vehicle = vehicleResult.data;
    const link = linkResult.data;
    const vehicleLink = vehicleLinkResult.data;
    if (customerFingerprint({ name: customer.display_name, phone: customer.phone ?? "",
        email: customer.email ?? "" }) !== link.local_fingerprint)
        throw new Error("QUIBI_CUSTOMER_CHANGED");
    const read = configuredQuibiReadClient();
    const [remoteCustomer, remoteVehicle] = await Promise.all([
        read.customer(link.external_id), read.vehicle(vehicleLink.quibi_vehicle_id, link.external_id),
    ]);
    if (customerFingerprint(remoteCustomer) !== link.external_fingerprint ||
        !verifiedVehicleLink({ customerId: link.external_id,
            localVehicle: { vin: vehicle.vin ?? "", registration: vehicle.registration_current ?? "",
                make: vehicle.make ?? "", model: vehicle.model ?? "" }, remoteVehicle, vehicleLink }))
        throw new Error("QUIBI_LINK_CHANGED");
    return { access, db, request, customer, remoteCustomer, link, vehicleLink, read, write,
        journal: quibiWorkflowJournal(access.organizationId, access.userId) };
}
