import {hasRecordedCustomerApproval} from '@/lib/quibi/business-form-state';
import {internalWorkOrdersEnabled} from '@/lib/work-orders/availability';
import { createClient } from "@/lib/supabase/server";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
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
import { OFFER_PREPARATION_STATUS_READY_FOR_PROVIDER } from "@/lib/offer-preparation/constants";
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
  // Outside try: requirePhase1OperationalAccess may redirect() — must not be swallowed.
  const access = await requirePhase1OperationalAccess();

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

    const preparedRequestIds = await loadReadyOfferPreparationIds(
      supabase,
      access.organizationId,
      requests.map((r) => r.id),
    );
    const fixedPriceByRequest = new Map<string, string>();
    const slotByRequest = new Map<string, string>();
    const syntheticAppointments = new Set<string>();
    const linkByCustomer = new Map<string, { sync_status: string }>();
    const quoteByRequest = new Map<string, { id: string; internal_review_status: string; content_sha256:string }>();
    const approvalByRequest = new Map<string, { quote_id: string; delivery_status: string; customer_decision: string | null;content_sha256:string;decided_at:string|null;decision_evidence_reference:string|null;revoked_at:string|null }>();
    const inspectionByRequest = new Map<string, string | null>();
    const requestIds = requests.map((row) => row.id);
    const uncertainEstimateRequests = new Set<string>();
    const rejectedEstimateRequests = new Set<string>();
    const quoteSendByRequest = new Map<string,{status:string|null}>();
    if (customerIds.length > 0) {
      const { data, error } = await supabase.from("integration_links")
        .select("entity_id, sync_status").eq("organization_id", access.organizationId)
        .eq("provider", "quibi").eq("entity_type", "customer").in("entity_id", customerIds);
      if (error) return { ok: false, message: LOAD_ERROR_MESSAGE, generatedAt };
      for (const row of data ?? []) linkByCustomer.set(row.entity_id, { sync_status: row.sync_status });
    }
    if (requestIds.length > 0) {
      const [quotes, approvals, inspections] = await Promise.all([
        supabase.from("quotes").select("id, service_request_id, internal_review_status, version_no, content_sha256")
          .eq("organization_id", access.organizationId).in("service_request_id", requestIds)
          .order("version_no", { ascending: false }),
        supabase.from("customer_approvals").select("service_request_id, quote_id, delivery_status, customer_decision, created_at, content_sha256, decided_at, decision_evidence_reference, revoked_at")
          .eq("organization_id", access.organizationId).in("service_request_id", requestIds)
          .is("revoked_at",null).order("created_at", { ascending: false }),
        supabase.from("preliminary_inspections").select("service_request_id, repair_decision")
          .eq("organization_id", access.organizationId).in("service_request_id", requestIds),
      ]);
      if (quotes.error || approvals.error || inspections.error)
        return { ok: false, message: LOAD_ERROR_MESSAGE, generatedAt };
      for (const row of quotes.data ?? []) if (!quoteByRequest.has(row.service_request_id)) quoteByRequest.set(row.service_request_id, row);
      for (const row of approvals.data ?? []) if (!approvalByRequest.has(row.service_request_id)) approvalByRequest.set(row.service_request_id, row);
      for (const row of inspections.data ?? []) inspectionByRequest.set(row.service_request_id, row.repair_decision);
    }
    if (requestIds.length && process.env.APP_ENV === 'preproduction' && process.env.QUIBI_MODE === 'dev' && ['owner','admin'].includes(access.role)) {
      const {data,error} = await supabase.from('quibi_dev_operation_journal')
        .select('service_request_id,kind,state,local_entity_id,attempted_at,send_status').eq('organization_id',access.organizationId)
        .in('service_request_id',requestIds).in('kind',['estimate','send']);
      if(error) return {ok:false,message:LOAD_ERROR_MESSAGE,generatedAt};
      for(const operation of data ?? []) {
        if(!operation.service_request_id)continue;
        if(operation.kind==='estimate'&&['uncertain','dispatching'].includes(operation.state))uncertainEstimateRequests.add(operation.service_request_id);
        if(operation.kind==='estimate'&&operation.state==='failed')rejectedEstimateRequests.add(operation.service_request_id);
        if(operation.kind==='send'&&operation.attempted_at&&operation.local_entity_id===quoteByRequest.get(operation.service_request_id)?.id)quoteSendByRequest.set(operation.service_request_id,{status:operation.send_status});
      }
    }
    const priceRequestIds = requests.filter((row) => row.status === "preparing_offer").map((row) => row.id);
    const slotRequestIds = requests.filter((row) => ["awaiting_slot_selection", "appointment_confirmed"].includes(row.status)).map((row) => row.id);
    if (process.env.SELAN_FIXED_PRICE_V1 === "1" && priceRequestIds.length > 0) {
      const { data, error } = await supabase.from("published_fixed_price_cases")
        .select("service_request_id, status").eq("organization_id", access.organizationId)
        .in("service_request_id", priceRequestIds);
      if (error) return { ok: false, message: LOAD_ERROR_MESSAGE, generatedAt };
      for (const row of data ?? []) fixedPriceByRequest.set(row.service_request_id, row.status);
    }
    if (slotRequestIds.length > 0) {
      const { data, error } = await supabase.from("manual_slot_offers")
        .select("service_request_id, status, booking_reference").eq("organization_id", access.organizationId)
        .eq("appointment_type", "service").neq("status", "cancelled")
        .in("service_request_id", slotRequestIds);
      if (error) return { ok: false, message: LOAD_ERROR_MESSAGE, generatedAt };
      for (const row of data ?? []) {
        slotByRequest.set(row.service_request_id, row.status);
        if (row.booking_reference?.startsWith("QA-SIM-")) syntheticAppointments.add(row.service_request_id);
      }
    }

    const workOrderByRequest = new Map<string,string>();
    const convertedIds=requests.filter(row=>row.status==='converted').map(row=>row.id);
    if(convertedIds.length&&internalWorkOrdersEnabled(process.env)){
      const {data,error}=await supabase.from('work_orders').select('service_request_id,status').eq('organization_id',access.organizationId).in('service_request_id',convertedIds);
      // Older installations may not have the optional local work-order module yet.
      if(error&&!['42P01','PGRST205'].includes(error.code))return {ok:false,message:LOAD_ERROR_MESSAGE,generatedAt};
      for(const row of data??[])workOrderByRequest.set(row.service_request_id,row.status);
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

      orders.push(
        adaptServiceRequestToOrder(
          row,
          customer,
          vehicle,
          now,
          {
            customerApprovalVerified: (()=>{const approval=approvalByRequest.get(row.id),quote=quoteByRequest.get(row.id);return !!approval&&!!quote&&approval.quote_id===quote.id&&hasRecordedCustomerApproval(approval,quote.content_sha256)})(),
            quibiCreateRejected:rejectedEstimateRequests.has(row.id),
            quibiCreateUncertain: uncertainEstimateRequests.has(row.id),
            quibiSendAttempted: quoteSendByRequest.has(row.id),
            quibiSendStatus: quoteSendByRequest.get(row.id)?.status,
            directQuibiBusiness: process.env.APP_ENV === 'preproduction' && process.env.QUIBI_MODE === 'dev' && process.env.VERCEL_ENV === 'preview',
            workOrderStatus: workOrderByRequest.get(row.id),
            offerPrepared: preparedRequestIds.has(row.id),
            quibiLinked: !!(row.customer_id && linkByCustomer.has(row.customer_id)),
            quibiSyncStatus: row.customer_id ? linkByCustomer.get(row.customer_id)?.sync_status : undefined,
            quoteReviewStatus: quoteByRequest.get(row.id)?.internal_review_status,
            deliveryStatus: approvalByRequest.get(row.id)?.quote_id === quoteByRequest.get(row.id)?.id
              ? approvalByRequest.get(row.id)?.delivery_status : undefined,
            customerDecision: approvalByRequest.get(row.id)?.quote_id === quoteByRequest.get(row.id)?.id
              ? approvalByRequest.get(row.id)?.customer_decision : undefined,
            fixedPriceStatus: fixedPriceByRequest.get(row.id),
            inspectionRepairDecision: inspectionByRequest.get(row.id),
            slotOfferStatus: slotByRequest.get(row.id),
            syntheticAppointment: syntheticAppointments.has(row.id),
          },
        ),
      );

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

type OfferPreparationRow = {
  service_request_id: string;
  status: string;
};

/**
 * Canonical Phase 8 readiness: offer_preparations with status ready_for_provider.
 * Query failure throws so the snapshot fails safely (no fake empty prepared set).
 */
async function loadReadyOfferPreparationIds(
  supabase: SupabaseServerClient,
  organizationId: string,
  serviceRequestIds: string[],
): Promise<Set<string>> {
  const ready = new Set<string>();
  if (serviceRequestIds.length === 0) {
    return ready;
  }

  const { data: prepRows, error: prepError } = await supabase
    .from("offer_preparations")
    .select("service_request_id, status")
    .eq("organization_id", organizationId)
    .eq("status", OFFER_PREPARATION_STATUS_READY_FOR_PROVIDER)
    .in("service_request_id", serviceRequestIds);

  if (prepError) {
    throw new Error("offer_preparations_query_failed");
  }

  for (const row of (prepRows ?? []) as unknown as OfferPreparationRow[]) {
    if (
      row.status === OFFER_PREPARATION_STATUS_READY_FOR_PROVIDER &&
      typeof row.service_request_id === "string"
    ) {
      ready.add(row.service_request_id);
    }
  }

  return ready;
}

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
    .select("id, customer_id, vehicle_id, appointment_type, starts_at, notes")
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
