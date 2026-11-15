import { formatRelativeUpdatedLabel } from "@/lib/dashboard/relative-time";
import { mapDbStatusToUiStatus } from "@/lib/dashboard/db-status";
import {
  getStatusBadgeClass,
  getStatusLabel,
} from "@/lib/dashboard/statuses";
import type {
  CustomerDirectoryItem,
  CustomerServiceRequestView,
  CustomerVehicleView,
} from "@/lib/customers/types";

const CUSTOMER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FUEL_LABELS: Record<string, string> = {
  petrol: "Bencin",
  diesel: "Dizel",
  hybrid: "Hibrid",
  plug_in_hybrid: "Priključni hibrid",
  electric: "Elektrika",
  lpg: "LPG",
  cng: "CNG",
  hydrogen: "Vodik",
  other: "Drugo",
};

export const VEHICLE_FUEL_OPTIONS = Object.entries(FUEL_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export type DirectoryCustomerSource = {
  id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  customer_type: string;
  updated_at: string;
};

export type DirectoryRelatedSource = {
  customer_id: string | null;
  updated_at: string;
};

export type VehicleSource = {
  id: string;
  registration_current: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  power_kw: number | null;
  engine: string | null;
  engine_type: string | null;
  fuel: string | null;
  notes: string | null;
  mileage_latest_km: number | null;
};

export type ServiceRequestSource = {
  id: string;
  vehicle_id: string | null;
  summary: string;
  status: string;
  next_action: string | null;
  attention_needed: boolean;
  attention_reason: string | null;
  has_error: boolean;
  error_reason: string | null;
  updated_at: string;
};

export function canQueryCustomerId(customerId: string): boolean {
  return CUSTOMER_ID_RE.test(customerId);
}

export function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function customerTypeLabel(customerType: string): string {
  if (customerType === "individual") return "Fizična oseba";
  if (customerType === "business") return "Podjetje";
  return customerType;
}

export function fuelLabel(fuel: string | null | undefined): string | null {
  const cleaned = cleanText(fuel);
  if (!cleaned) return null;
  return FUEL_LABELS[cleaned] ?? cleaned;
}

export function formatMileageKm(km: number | null | undefined): string | null {
  if (typeof km !== "number" || !Number.isInteger(km) || km < 0) {
    return null;
  }
  return `${new Intl.NumberFormat("sl-SI").format(km)} km`;
}

export function latestIso(
  values: Array<string | null | undefined>,
): string | null {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) continue;
    if (ms >= bestMs) {
      bestMs = ms;
      best = value;
    }
  }
  return best;
}

/** Digits-only form for phone comparison; name/email search is unchanged. */
export function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function customerMatchesSearch(
  customer: Pick<CustomerDirectoryItem, "displayName" | "phone" | "email">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const phoneDigits = normalizePhoneDigits(customer.phone ?? "");
  const queryDigits = normalizePhoneDigits(q);
  return (
    customer.displayName.toLowerCase().includes(q) ||
    (customer.email ?? "").toLowerCase().includes(q) ||
    (queryDigits.length > 0 && phoneDigits.includes(queryDigits))
  );
}

export function formatVehicleIdentity(vehicle: {
  registration: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
}): string | null {
  const makeModel = [vehicle.make, vehicle.model].filter(Boolean).join(" ");
  const parts = [
    vehicle.registration,
    makeModel || null,
    vehicle.year != null ? String(vehicle.year) : null,
  ].filter((part): part is string => Boolean(part));
  if (parts.length > 0) return parts.join(" · ");
  if (vehicle.vin) return `VIN ${vehicle.vin}`;
  return null;
}

export function toCustomerVehicleView(row: VehicleSource): CustomerVehicleView {
  return {
    id: row.id,
    registration: cleanText(row.registration_current),
    vin: cleanText(row.vin),
    make: cleanText(row.make),
    model: cleanText(row.model),
    year: typeof row.year === "number" ? row.year : null,
    powerKw: typeof row.power_kw === "number" ? row.power_kw : null,
    engine: cleanText(row.engine),
    engineType: cleanText(row.engine_type),
    fuel: cleanText(row.fuel),
    fuelLabel: fuelLabel(row.fuel),
    notes: cleanText(row.notes),
    mileageLatestKm:
      typeof row.mileage_latest_km === "number" ? row.mileage_latest_km : null,
    mileageLabel: formatMileageKm(row.mileage_latest_km),
  };
}

export function compareVehicles(
  a: CustomerVehicleView,
  b: CustomerVehicleView,
): number {
  const reg = (a.registration ?? "").localeCompare(b.registration ?? "", "sl");
  if (reg !== 0) return reg;
  const make = (a.make ?? "").localeCompare(b.make ?? "", "sl");
  if (make !== 0) return make;
  return (a.model ?? "").localeCompare(b.model ?? "", "sl");
}

export function toServiceRequestView(
  row: ServiceRequestSource,
  vehicle: CustomerVehicleView | undefined,
  now: Date,
): CustomerServiceRequestView {
  const uiStatus = mapDbStatusToUiStatus(row.status);
  const vehicleLabel = vehicle
    ? formatVehicleIdentity({
        registration: vehicle.registration,
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
      })
    : null;

  return {
    id: row.id,
    summary: row.summary,
    statusLabel: getStatusLabel(uiStatus),
    statusBadgeClass: getStatusBadgeClass(uiStatus),
    nextAction: cleanText(row.next_action),
    hasError: row.has_error === true,
    errorReason: cleanText(row.error_reason),
    attentionNeeded: row.attention_needed === true,
    attentionReason: cleanText(row.attention_reason),
    vehicleLabel,
    updatedAt: row.updated_at,
    updatedLabel: formatRelativeUpdatedLabel(row.updated_at, now),
  };
}

/**
 * Counts only the rows the loader already limited to this organization
 * and to non-archived customers, vehicles, and service requests.
 * serviceRequestCount is non-archived intake/orchestration rows, not workshop history.
 */
export function buildCustomerDirectoryItems(
  customers: DirectoryCustomerSource[],
  vehicles: DirectoryRelatedSource[],
  requests: DirectoryRelatedSource[],
  now: Date,
): CustomerDirectoryItem[] {
  const vehicleCount = new Map<string, number>();
  const vehicleTimes = new Map<string, string[]>();
  const requestCount = new Map<string, number>();
  const requestUpdated = new Map<string, string[]>();

  for (const vehicle of vehicles) {
    if (!vehicle.customer_id) continue;
    vehicleCount.set(
      vehicle.customer_id,
      (vehicleCount.get(vehicle.customer_id) ?? 0) + 1,
    );
    const times = vehicleTimes.get(vehicle.customer_id) ?? [];
    times.push(vehicle.updated_at);
    vehicleTimes.set(vehicle.customer_id, times);
  }

  for (const request of requests) {
    if (!request.customer_id) continue;
    requestCount.set(
      request.customer_id,
      (requestCount.get(request.customer_id) ?? 0) + 1,
    );
    const times = requestUpdated.get(request.customer_id) ?? [];
    times.push(request.updated_at);
    requestUpdated.set(request.customer_id, times);
  }

  return customers.map((customer) => {
    const lastUpdatedAt = latestIso([
      customer.updated_at,
      ...(vehicleTimes.get(customer.id) ?? []),
      ...(requestUpdated.get(customer.id) ?? []),
    ]);

    return {
      id: customer.id,
      displayName: customer.display_name.trim(),
      phone: cleanText(customer.phone),
      email: cleanText(customer.email),
      customerType: customer.customer_type,
      customerTypeLabel: customerTypeLabel(customer.customer_type),
      activeVehicleCount: vehicleCount.get(customer.id) ?? 0,
      serviceRequestCount: requestCount.get(customer.id) ?? 0,
      lastUpdatedAt,
      lastUpdatedLabel: lastUpdatedAt
        ? formatRelativeUpdatedLabel(lastUpdatedAt, now)
        : "—",
    };
  });
}
