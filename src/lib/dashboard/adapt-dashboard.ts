import {automaticDraftPresentation} from '../quibi/automatic-draft-state';
import { nextCaseStep } from "@/lib/cases/next-step";
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
  problem_description?: string|null;
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

export function adaptServiceRequestToOrder(
  row: ServiceRequestRow,
  customer: CustomerRow | undefined,
  vehicle: VehicleRow | undefined,
  now: Date,
  stepInput: Omit<Parameters<typeof nextCaseStep>[0], "status"> & {automaticDraftState?:import('../quibi/automatic-estimate-draft').AutomaticDraftState;intakeConnectionLabel?:string;repairUiStatus?:import('./types').WorkflowStatusId;repairUpdatedAt?:string|null;businessUpdatedAt?:string|null;repairPhase?:string;quibiWorkOrderId?:string;mechanicName?:string|null;mechanicEmail?:string|null},
): ServiceOrderDemo {
  const updatedAt=latestBusinessActivity(stepInput.repairUpdatedAt,stepInput.businessUpdatedAt,row.updated_at)??row.updated_at;
  const uiStatus = stepInput.repairUiStatus??mapDbStatusToUiStatus(row.status,stepInput.workOrderStatus);

  return {
    id: toPresentationRef(row.id),
    serviceRequestId: row.id,
    customerName: customer?.display_name?.trim() || FALLBACK_CUSTOMER,
    customerPhone: customer?.phone?.trim() || undefined,
    vehicleMakeModel: vehicleMakeModel(vehicle),
    registration: vehicle?.registration_current?.trim() || undefined,
    requestSummary: row.summary,
    synthetic:[row.summary,row.problem_description,customer?.display_name].some(value=>/^(?:QA-SIM(?:\b|[-_])|TEST(?:[-_\s:]|$))/i.test(value?.trim()??'')),
    intakeConnectionLabel:stepInput.intakeConnectionLabel,
    repairPhase:stepInput.repairPhase,quibiWorkOrderId:stepInput.quibiWorkOrderId,mechanicName:stepInput.mechanicName,mechanicEmail:stepInput.mechanicEmail,
    status: uiStatus,
    nextActionLabel: stepInput.automaticDraftState?automaticDraftPresentation(stepInput.automaticDraftState).action:nextCaseStep({ ...stepInput, status: row.status }).label,
    nextActionKind: stepInput.automaticDraftState?'automatic_estimate':nextCaseStep({ ...stepInput, status: row.status }).kind,
    fixedPriceStatus: stepInput.fixedPriceStatus,
    requiresAttention: row.has_error || row.attention_needed,
    offerPreparationReady: stepInput.offerPrepared,
    locationLabel: undefined,
    appointmentTime: null,
    updatedAt,
    updatedLabel: formatRelativeUpdatedLabel(updatedAt, now),
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

/** Compare actual instants, including provider timestamps with different UTC offsets. */
export function latestBusinessActivity(...values:(string|null|undefined)[]){return values.filter((value):value is string=>!!value&&Number.isFinite(Date.parse(value))).sort((a,b)=>Date.parse(b)-Date.parse(a))[0]??null;}
