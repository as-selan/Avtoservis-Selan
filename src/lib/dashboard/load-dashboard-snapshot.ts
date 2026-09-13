import { createClient } from "@/lib/supabase/server";
import { requireWorkshopAccess } from "@/lib/auth/requireWorkshopAccess";
import {
  adaptServiceRequestToAttention,
  adaptServiceRequestToOrder,
  type CustomerRow,
  type ServiceRequestRow,
  type VehicleRow,
} from "@/lib/dashboard/adapt-dashboard";
import type {
  AttentionItemDemo,
  DashboardSnapshot,
  ServiceOrderDemo,
} from "@/lib/dashboard/types";

const LOAD_ERROR_MESSAGE =
  "Nadzorne plošče trenutno ni mogoče naložiti. Poskusite znova kasneje.";

function uniqueIds(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      set.add(value);
    }
  }
  return [...set];
}

/**
 * Server-side dashboard snapshot for the authenticated workshop membership.
 * organization_id is derived from membership — never from the browser.
 * Uses the publishable cookie client only (no service_role).
 */
export async function loadDashboardSnapshot(): Promise<DashboardSnapshot> {
  // Outside try: requireWorkshopAccess may redirect() — must not be swallowed.
  const access = await requireWorkshopAccess();

  // One server reference time for labels + client SSR/hydration period filtering.
  const now = new Date();
  const generatedAt = now.toISOString();

  try {
    const supabase = await createClient();

    const { data: requestRows, error: requestError } = await supabase
      .from("service_requests")
      .select(
        [
          "id",
          "customer_id",
          "vehicle_id",
          "status",
          "summary",
          "next_action",
          "attention_needed",
          "attention_reason",
          "has_error",
          "error_reason",
          "updated_at",
        ].join(", "),
      )
      .eq("organization_id", access.organizationId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false });

    if (requestError) {
      return { ok: false, message: LOAD_ERROR_MESSAGE, generatedAt };
    }

    // M3 tables are not in generated Database types yet (migrations unapplied).
    const requests = (requestRows ?? []) as unknown as ServiceRequestRow[];
    const customerIds = uniqueIds(requests.map((r) => r.customer_id));
    const vehicleIds = uniqueIds(requests.map((r) => r.vehicle_id));

    const customersById = new Map<string, CustomerRow>();
    const vehiclesById = new Map<string, VehicleRow>();

    if (customerIds.length > 0) {
      const { data: customerRows, error: customerError } = await supabase
        .from("customers")
        .select("id, display_name, phone")
        .eq("organization_id", access.organizationId)
        .in("id", customerIds);

      if (customerError) {
        return { ok: false, message: LOAD_ERROR_MESSAGE, generatedAt };
      }

      for (const row of (customerRows ?? []) as unknown as CustomerRow[]) {
        customersById.set(row.id, row);
      }
    }

    if (vehicleIds.length > 0) {
      const { data: vehicleRows, error: vehicleError } = await supabase
        .from("vehicles")
        .select("id, make, model, registration_current")
        .eq("organization_id", access.organizationId)
        .in("id", vehicleIds);

      if (vehicleError) {
        return { ok: false, message: LOAD_ERROR_MESSAGE, generatedAt };
      }

      for (const row of (vehicleRows ?? []) as unknown as VehicleRow[]) {
        vehiclesById.set(row.id, row);
      }
    }

    const orders: ServiceOrderDemo[] = [];
    const attention: AttentionItemDemo[] = [];

    for (const row of requests) {
      const customer = row.customer_id
        ? customersById.get(row.customer_id)
        : undefined;
      const vehicle = row.vehicle_id
        ? vehiclesById.get(row.vehicle_id)
        : undefined;

      orders.push(adaptServiceRequestToOrder(row, customer, vehicle, now));

      const attentionItem = adaptServiceRequestToAttention(row, now);
      if (attentionItem) {
        attention.push(attentionItem);
      }
    }

    return {
      ok: true,
      generatedAt,
      orders,
      attention,
      appointments: [],
      activity: [],
    };
  } catch {
    return { ok: false, message: LOAD_ERROR_MESSAGE, generatedAt };
  }
}
