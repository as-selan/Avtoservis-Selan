import type { WorkflowStatusId } from "./types";

/** Canonical M3 `service_requests.status` values. */
export type ServiceRequestDbStatus =
  | "new"
  | "needs_data"
  | "preparing_offer"
  | "awaiting_customer_approval"
  | "awaiting_slot_selection"
  | "appointment_confirmed"
  | "admin_completed"
  | "converted"
  | "declined"
  | "cancelled"
  | "closed";

const DB_TO_UI_STATUS: Record<ServiceRequestDbStatus, WorkflowStatusId> = {
  new: "novo",
  needs_data: "manjkajo_podatki",
  preparing_offer: "priprava_ponudbe",
  awaiting_customer_approval: "caka_potrditev_ponudbe",
  awaiting_slot_selection: "caka_izbiro_termina",
  appointment_confirmed: "termin_potrjen",
  admin_completed: "zakljuceno",
  converted: "zakljuceno",
  declined: "zakljuceno",
  cancelled: "zakljuceno",
  closed: "zakljuceno",
};

export function isServiceRequestDbStatus(
  value: string,
): value is ServiceRequestDbStatus {
  return Object.prototype.hasOwnProperty.call(DB_TO_UI_STATUS, value);
}

/**
 * Map every allowed M3 status to a Dashboard presentation status.
 * Unknown values throw — never silently fall through to "novo".
 * UI-only "potreben_pregled" has no DB counterpart.
 */
export function mapDbStatusToUiStatus(status: string): WorkflowStatusId {
  if (!isServiceRequestDbStatus(status)) {
    throw new Error(`Unknown service_request status: ${status}`);
  }
  return DB_TO_UI_STATUS[status];
}
