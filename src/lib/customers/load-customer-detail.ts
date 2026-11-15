import { createClient } from "@/lib/supabase/server";
import {
  canQueryCustomerId,
  cleanText,
  compareVehicles,
  customerTypeLabel,
  toCustomerVehicleView,
  toServiceRequestView,
  type ServiceRequestSource,
  type VehicleSource,
} from "@/lib/customers/present";
import type {
  CustomerDetailResult,
  CustomerVehicleView,
} from "@/lib/customers/types";

const LOAD_ERROR_MESSAGE =
  "Podatkov o stranki trenutno ni mogoče naložiti. Poskusite znova kasneje.";

type CustomerSource = {
  id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  customer_type: string;
  notes: string | null;
};

/**
 * One customer plus active vehicles and non-archived service requests.
 * organizationId must come from requirePhase1OperationalAccess() — never from the URL.
 * Lookup is id + organization_id. Missing, archived, invalid, and other-org ids
 * all return the same unavailable result.
 * Uses the publishable cookie client only (no service_role).
 * service_requests are intake/orchestration rows, not workshop history.
 */
export async function loadCustomerDetail(
  organizationId: string,
  customerId: string,
): Promise<CustomerDetailResult> {
  if (!canQueryCustomerId(customerId)) {
    return { ok: false, reason: "unavailable" };
  }

  const now = new Date();

  try {
    const supabase = await createClient();

    const { data: customerRow, error: customerError } = await supabase
      .from("customers")
      .select("id, display_name, phone, email, customer_type, notes")
      .eq("id", customerId)
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .maybeSingle();

    if (customerError) {
      return { ok: false, reason: "error", message: LOAD_ERROR_MESSAGE };
    }

    const customer = customerRow as unknown as CustomerSource | null;
    if (!customer) {
      return { ok: false, reason: "unavailable" };
    }

    const [{ data: vehicleRows, error: vehicleError }, { data: requestRows, error: requestError }] =
      await Promise.all([
        supabase
          .from("vehicles")
          .select(
            "id, registration_current, vin, make, model, year, power_kw, engine, engine_type, fuel, notes, mileage_latest_km",
          )
          .eq("organization_id", organizationId)
          .eq("customer_id", customerId)
          .is("archived_at", null),
        supabase
          .from("service_requests")
          .select(
            "id, vehicle_id, summary, status, next_action, attention_needed, attention_reason, has_error, error_reason, updated_at",
          )
          .eq("organization_id", organizationId)
          .eq("customer_id", customerId)
          .is("archived_at", null)
          .order("updated_at", { ascending: false }),
      ]);

    if (vehicleError || requestError) {
      return { ok: false, reason: "error", message: LOAD_ERROR_MESSAGE };
    }

    const vehicles = (
      (vehicleRows ?? []) as unknown as VehicleSource[]
    )
      .map(toCustomerVehicleView)
      .sort(compareVehicles);

    const vehiclesById = new Map<string, CustomerVehicleView>(
      vehicles.map((vehicle) => [vehicle.id, vehicle]),
    );

    const requests = (requestRows ?? []) as unknown as ServiceRequestSource[];
    const missingVehicleIds = [
      ...new Set(
        requests
          .map((request) => request.vehicle_id)
          .filter(
            (id): id is string =>
              typeof id === "string" && id.length > 0 && !vehiclesById.has(id),
          ),
      ),
    ];

    if (missingVehicleIds.length > 0) {
      const { data: linkedRows, error: linkedError } = await supabase
        .from("vehicles")
        .select(
          "id, registration_current, vin, make, model, year, power_kw, engine, engine_type, fuel, notes, mileage_latest_km",
        )
        .eq("organization_id", organizationId)
        .in("id", missingVehicleIds)
        .is("archived_at", null);

      if (linkedError) {
        return { ok: false, reason: "error", message: LOAD_ERROR_MESSAGE };
      }

      for (const row of (linkedRows ?? []) as unknown as VehicleSource[]) {
        vehiclesById.set(row.id, toCustomerVehicleView(row));
      }
    }

    return {
      ok: true,
      customer: {
        id: customer.id,
        displayName: customer.display_name.trim(),
        phone: cleanText(customer.phone),
        email: cleanText(customer.email),
        customerType: customer.customer_type,
        customerTypeLabel: customerTypeLabel(customer.customer_type),
        notes: cleanText(customer.notes),
        vehicles,
        serviceRequests: requests.map((request) =>
          toServiceRequestView(
            request,
            request.vehicle_id
              ? vehiclesById.get(request.vehicle_id)
              : undefined,
            now,
          ),
        ),
      },
    };
  } catch {
    return { ok: false, reason: "error", message: LOAD_ERROR_MESSAGE };
  }
}
