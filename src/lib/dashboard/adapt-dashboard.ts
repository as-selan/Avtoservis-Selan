import { WORKFLOW_STATUS_MAP } from "./statuses";
import { mapDbStatusToUiStatus } from "./db-status";
import { formatRelativeUpdatedLabel } from "./relative-time";
import type {
  AttentionItemDemo,
  AttentionSeverity,
  ServiceOrderDemo,
} from "./types";

export type ServiceRequestRow = {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  status: string;
  summary: string;
  next_action: string | null;
  attention_needed: boolean;
  attention_reason: string | null;
  has_error: boolean;
  error_reason: string | null;
  updated_at: string;
};

export type CustomerRow = {
  id: string;
  display_name: string;
  phone: string | null;
};

export type VehicleRow = {
  id: string;
  make: string | null;
  model: string | null;
  registration_current: string | null;
};

const FALLBACK_CUSTOMER = "Neznana stranka";
const FALLBACK_VEHICLE = "Neznano vozilo";

/** Short deterministic presentation id — not a full UUID. */
export function toPresentationRef(serviceRequestId: string): string {
  const hex = serviceRequestId.replace(/-/g, "").toUpperCase();
  if (hex.length >= 8) {
    return hex.slice(0, 8);
  }
  return hex || "--------";
}

function vehicleMakeModel(vehicle: VehicleRow | undefined): string {
  if (!vehicle) return FALLBACK_VEHICLE;
  const parts = [vehicle.make, vehicle.model]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : FALLBACK_VEHICLE;
}

function nextActionLabel(
  nextAction: string | null,
  uiStatus: ServiceOrderDemo["status"],
): string {
  const trimmed = nextAction?.trim();
  if (trimmed) return trimmed;
  return WORKFLOW_STATUS_MAP[uiStatus].nextActionDefault;
}

export function adaptServiceRequestToOrder(
  row: ServiceRequestRow,
  customer: CustomerRow | undefined,
  vehicle: VehicleRow | undefined,
  now: Date,
): ServiceOrderDemo {
  const uiStatus = mapDbStatusToUiStatus(row.status);

  return {
    id: toPresentationRef(row.id),
    serviceRequestId: row.id,
    customerName: customer?.display_name?.trim() || FALLBACK_CUSTOMER,
    customerPhone: customer?.phone?.trim() || undefined,
    vehicleMakeModel: vehicleMakeModel(vehicle),
    registration: vehicle?.registration_current?.trim() || undefined,
    requestSummary: row.summary,
    status: uiStatus,
    nextActionLabel: nextActionLabel(row.next_action, uiStatus),
    locationLabel: undefined,
    appointmentTime: null,
    updatedAt: row.updated_at,
    updatedLabel: formatRelativeUpdatedLabel(row.updated_at, now),
  };
}

/**
 * Build attention items only from real has_error / attention_needed flags.
 * Title: error_reason → attention_reason → summary (never drop attention_reason
 * merely because has_error is true).
 */
export function adaptServiceRequestToAttention(
  row: ServiceRequestRow,
  now: Date,
): AttentionItemDemo | null {
  if (!row.has_error && !row.attention_needed) {
    return null;
  }

  const severity: AttentionSeverity = row.has_error ? "critical" : "warning";
  const errorReason = row.error_reason?.trim() || null;
  const attentionReason = row.attention_reason?.trim() || null;
  const nextAction = row.next_action?.trim() || null;
  const summary = row.summary;

  const title = errorReason || attentionReason || summary;

  const detailParts: string[] = [];
  for (const part of [errorReason, attentionReason, summary, nextAction]) {
    if (part && part !== title && !detailParts.includes(part)) {
      detailParts.push(part);
    }
  }

  return {
    id: row.id,
    title,
    detail: detailParts.length > 0 ? detailParts.join(" · ") : title,
    severity,
    timeLabel: formatRelativeUpdatedLabel(row.updated_at, now),
    primaryAction: nextAction || "Preveri",
    secondaryAction: undefined,
    occurredAt: row.updated_at,
  };
}
