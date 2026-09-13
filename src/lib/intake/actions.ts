"use server";

import { createClient } from "@/lib/supabase/server";
import { requireManualIntakeAccess } from "@/lib/intake/access";
import { manualIntakeErrorMessage } from "@/lib/intake/errors";
import { validateManualIntakeForm } from "@/lib/intake/validate";
import type {
  CreateManualIntakeResult,
  IntakeCustomerCandidate,
  ManualIntakeErrorCode,
  ManualIntakeInput,
} from "@/lib/intake/types";

type RpcErrorPayload = {
  ok?: boolean;
  error_code?: string;
  customer_id?: string;
  customer_created?: boolean;
  vehicle_id?: string | null;
  vehicle_created?: boolean;
  service_request_id?: string;
  status?: string;
  missing_fields?: unknown;
  next_action?: string | null;
  replayed?: boolean;
};

type SearchRpcPayload = {
  ok?: boolean;
  error_code?: string;
  candidates?: Array<{
    customer_id?: string;
    display_name?: string;
    phone?: string | null;
    email?: string | null;
    vehicles?: Array<{
      vehicle_id?: string;
      make?: string | null;
      model?: string | null;
      registration_current?: string | null;
      vin?: string | null;
    }>;
  }>;
};

function asErrorCode(value: string | undefined): ManualIntakeErrorCode {
  switch (value) {
    case "validation_failed":
    case "forbidden":
    case "ambiguous_customer":
    case "ambiguous_vehicle":
    case "vehicle_ownership_conflict":
    case "archived_customer_match":
    case "archived_vehicle_match":
    case "selection_conflict":
      return value;
    default:
      return "unexpected";
  }
}

function mapMissingFields(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}

export type SearchManualIntakeResult =
  | { ok: true; candidates: IntakeCustomerCandidate[] }
  | { ok: false; errorCode: ManualIntakeErrorCode; message: string };

/**
 * Authenticated discovery search (name / phone / email / registration / VIN).
 * Name is discovery-only — never auto-selects identity.
 */
export async function searchManualIntakeCandidatesAction(
  query: string,
): Promise<SearchManualIntakeResult> {
  const gate = await requireManualIntakeAccess();
  if (!gate.ok) {
    return {
      ok: false,
      errorCode: "forbidden",
      message: manualIntakeErrorMessage("forbidden"),
    };
  }

  const trimmed = query.trim();
  if (!trimmed) {
    return { ok: true, candidates: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_manual_intake_candidates", {
    p_query: trimmed,
    p_limit: 15,
  });

  if (error) {
    return {
      ok: false,
      errorCode: "unexpected",
      message: manualIntakeErrorMessage("unexpected"),
    };
  }

  const payload = (data ?? {}) as SearchRpcPayload;
  if (payload.ok === false) {
    const code = asErrorCode(payload.error_code);
    return {
      ok: false,
      errorCode: code,
      message: manualIntakeErrorMessage(code),
    };
  }

  const candidates: IntakeCustomerCandidate[] = (payload.candidates ?? [])
    .filter((c) => typeof c.customer_id === "string" && typeof c.display_name === "string")
    .map((c) => ({
      customerId: c.customer_id as string,
      displayName: c.display_name as string,
      phone: c.phone ?? null,
      email: c.email ?? null,
      vehicles: (c.vehicles ?? [])
        .filter((v) => typeof v.vehicle_id === "string")
        .map((v) => ({
          vehicleId: v.vehicle_id as string,
          make: v.make ?? null,
          model: v.model ?? null,
          registrationCurrent: v.registration_current ?? null,
          vin: v.vin ?? null,
        })),
    }));

  return { ok: true, candidates };
}

export type CreateManualIntakeActionResult =
  | { ok: true; result: Extract<CreateManualIntakeResult, { ok: true }>; message: string }
  | {
      ok: false;
      errorCode: ManualIntakeErrorCode;
      message: string;
      fieldErrors?: Record<string, string>;
    };

async function callCreateRpc(
  input: ManualIntakeInput,
): Promise<CreateManualIntakeResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "create_manual_service_request_intake",
    {
      p_display_name: input.displayName,
      p_phone: input.phone,
      p_email: input.email,
      p_channel: input.channel,
      p_vin: input.vin,
      p_registration: input.registration,
      p_make: input.make,
      p_model: input.model,
      p_year: input.year,
      p_power_kw: input.powerKw,
      p_engine: input.engine,
      p_engine_type: input.engineType,
      p_fuel: input.fuel,
      p_mileage_reported_km: input.mileageReportedKm,
      p_service_wanted: input.serviceWanted,
      p_problem_description: input.problemDescription,
      p_brings_own_material: input.bringsOwnMaterial,
      p_selected_customer_id: input.selectedCustomerId,
      p_selected_vehicle_id: input.selectedVehicleId,
      p_client_request_id: input.clientRequestId,
    },
  );

  if (error) {
    return { ok: false, errorCode: "unexpected" };
  }

  const payload = (data ?? {}) as RpcErrorPayload;
  if (!payload.ok) {
    return { ok: false, errorCode: asErrorCode(payload.error_code) };
  }

  if (
    typeof payload.customer_id !== "string" ||
    typeof payload.service_request_id !== "string" ||
    (payload.status !== "new" && payload.status !== "needs_data")
  ) {
    return { ok: false, errorCode: "unexpected" };
  }

  return {
    ok: true,
    customerId: payload.customer_id,
    customerCreated: Boolean(payload.customer_created),
    vehicleId: payload.vehicle_id ?? null,
    vehicleCreated: Boolean(payload.vehicle_created),
    serviceRequestId: payload.service_request_id,
    status: payload.status,
    missingFields: mapMissingFields(payload.missing_fields),
    nextAction: payload.next_action ?? null,
    replayed: Boolean(payload.replayed),
  };
}

/**
 * Create one manual service_request via atomic RPC.
 * organization_id / source / status / completeness are never taken from the browser.
 */
export async function createManualServiceRequestIntakeAction(raw: {
  displayName: string;
  phone: string;
  email: string;
  channel: string;
  vin: string;
  registration: string;
  make: string;
  model: string;
  year: string;
  powerKw: string;
  engine: string;
  engineType: string;
  fuel: string;
  mileage: string;
  serviceWanted: string;
  problemDescription: string;
  bringsOwnMaterial: boolean;
  selectedCustomerId: string | null;
  selectedVehicleId: string | null;
  clientRequestId: string;
}): Promise<CreateManualIntakeActionResult> {
  const gate = await requireManualIntakeAccess();
  if (!gate.ok) {
    return {
      ok: false,
      errorCode: "forbidden",
      message: manualIntakeErrorMessage("forbidden"),
    };
  }

  const validated = validateManualIntakeForm(raw);
  if (!validated.ok) {
    return {
      ok: false,
      errorCode: "validation_failed",
      message:
        validated.formError ?? manualIntakeErrorMessage("validation_failed"),
      fieldErrors: validated.fieldErrors,
    };
  }

  const result = await callCreateRpc(validated.input);
  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.errorCode,
      message: manualIntakeErrorMessage(result.errorCode),
    };
  }

  const statusNote =
    result.status === "needs_data"
      ? " Status: manjkajo podatki."
      : "";
  const replayNote = result.replayed ? " (ponovitev iste zahteve)." : "";

  return {
    ok: true,
    result,
    message: `Povpraševanje je shranjeno.${statusNote}${replayNote}`,
  };
}
