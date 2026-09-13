import { createClient } from "@/lib/supabase/server";
import { requireWorkshopAccess } from "@/lib/auth/requireWorkshopAccess";
import {
  adaptServiceRequestToAttention,
  adaptServiceRequestToOrder,
  type CustomerRow,
  type ServiceRequestRow,
  type VehicleRow,
} from "@/lib/dashboard/adapt-dashboard";
import {
  adaptAppointmentToDashboard,
  type AppointmentCustomerRow,
  type AppointmentRow,
  type AppointmentVehicleRow,
} from "@/lib/dashboard/adapt-appointment";
import {
  DASHBOARD_APPOINTMENT_LIST_LIMIT,
  getAppointmentDashboardWindow,
} from "@/lib/dashboard/appointment-window";
import type {
  AppointmentDemo,
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

    const appointments = await loadConfirmedAppointments(
      supabase,
      access.organizationId,
      now,
    );

    return {
      ok: true,
      generatedAt,
      orders,
      attention,
      appointments,
      activity: [],
    };
  } catch {
    return { ok: false, message: LOAD_ERROR_MESSAGE, generatedAt };
  }
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Confirmed appointments for the Dashboard Termini card:
 * Europe/Ljubljana [today, today+14 calendar days), ASC, limit 5.
 * Query failure throws so the snapshot fails safely (no fake empty list).
 */
async function loadConfirmedAppointments(
  supabase: SupabaseServerClient,
  organizationId: string,
  now: Date,
): Promise<AppointmentDemo[]> {
  const { start, endExclusive } = getAppointmentDashboardWindow(now);

  const { data: appointmentRows, error: appointmentError } = await supabase
    .from("appointments")
    .select("id, customer_id, vehicle_id, appointment_type, starts_at")
    .eq("organization_id", organizationId)
    .eq("status", "confirmed")
    .gte("starts_at", start.toISOString())
    .lt("starts_at", endExclusive.toISOString())
    .order("starts_at", { ascending: true })
    .limit(DASHBOARD_APPOINTMENT_LIST_LIMIT);

  if (appointmentError) {
    throw new Error("appointments_query_failed");
  }

  const rows = (appointmentRows ?? []) as unknown as AppointmentRow[];
  if (rows.length === 0) {
    return [];
  }

  const customerIds = uniqueIds(rows.map((r) => r.customer_id));
  const vehicleIds = uniqueIds(rows.map((r) => r.vehicle_id));

  const customersById = new Map<string, AppointmentCustomerRow>();
  const vehiclesById = new Map<string, AppointmentVehicleRow>();

  if (customerIds.length > 0) {
    const { data: customerRows, error: customerError } = await supabase
      .from("customers")
      .select("id, display_name")
      .eq("organization_id", organizationId)
      .in("id", customerIds);

    if (customerError) {
      throw new Error("appointments_customers_query_failed");
    }

    for (const row of (customerRows ?? []) as unknown as AppointmentCustomerRow[]) {
      customersById.set(row.id, row);
    }
  }

  if (vehicleIds.length > 0) {
    const { data: vehicleRows, error: vehicleError } = await supabase
      .from("vehicles")
      .select("id, make, model, registration_current")
      .eq("organization_id", organizationId)
      .in("id", vehicleIds);

    if (vehicleError) {
      throw new Error("appointments_vehicles_query_failed");
    }

    for (const row of (vehicleRows ?? []) as unknown as AppointmentVehicleRow[]) {
      vehiclesById.set(row.id, row);
    }
  }

  return rows.map((row) =>
    adaptAppointmentToDashboard(
      row,
      customersById.get(row.customer_id),
      row.vehicle_id ? vehiclesById.get(row.vehicle_id) : undefined,
      now,
    ),
  );
}
