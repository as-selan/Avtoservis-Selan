"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { canQueryCustomerId } from "@/lib/customers/present";
import {
  CUSTOMER_VEHICLE_CREATE_UNAVAILABLE,
  CUSTOMER_VEHICLE_EDIT_GENERIC_ERROR,
  CUSTOMER_VEHICLE_EDIT_UNAVAILABLE,
  VIN_ALREADY_USED_MESSAGE,
} from "@/lib/customers/edit-messages";
import {
  isVinUniqueViolation,
  validateCustomerEdit,
  validateVehicleEdit,
} from "@/lib/customers/validate-edit";

export type CustomerVehicleEditResult =
  | { ok: true }
  | {
      ok: false;
      fieldErrors?: Record<string, string>;
      message?: string;
    };

export type CustomerVehicleCreateResult = CustomerVehicleEditResult;

/**
 * Update an active customer in the authenticated organization.
 * organizationId comes from requirePhase1OperationalAccess() only.
 */
export async function updateCustomerAction(input: {
  customerId: string;
  customerType: string;
  displayName: string;
  phone: string;
  email: string;
  notes: string;
}): Promise<CustomerVehicleEditResult> {
  const access = await requirePhase1OperationalAccess();

  if (
    typeof input.customerId !== "string" ||
    !canQueryCustomerId(input.customerId)
  ) {
    return { ok: false, message: CUSTOMER_VEHICLE_EDIT_UNAVAILABLE };
  }

  const validated = validateCustomerEdit({
    customerType: input.customerType,
    displayName: input.displayName,
    phone: input.phone,
    email: input.email,
    notes: input.notes,
  });
  if (!validated.ok) {
    return { ok: false, fieldErrors: validated.fieldErrors };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customers")
      .update({
        customer_type: validated.value.customer_type,
        display_name: validated.value.display_name,
        phone: validated.value.phone,
        email: validated.value.email,
        notes: validated.value.notes,
      })
      .eq("id", input.customerId)
      .eq("organization_id", access.organizationId)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      return { ok: false, message: CUSTOMER_VEHICLE_EDIT_GENERIC_ERROR };
    }
    if (!data?.id) {
      return { ok: false, message: CUSTOMER_VEHICLE_EDIT_UNAVAILABLE };
    }

    revalidatePath(`/dashboard/stranke/${input.customerId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: CUSTOMER_VEHICLE_EDIT_GENERIC_ERROR };
  }
}

/**
 * Update an active vehicle owned by the given customer in the authenticated org.
 * organizationId comes from requirePhase1OperationalAccess() only.
 * Does not change customer_id / ownership / archive.
 */
export async function updateVehicleAction(input: {
  customerId: string;
  vehicleId: string;
  registration: string;
  vin: string;
  make: string;
  model: string;
  year: string;
  powerKw: string;
  engine: string;
  engineType: string;
  fuel: string;
  notes: string;
  mileage: string;
}): Promise<CustomerVehicleEditResult> {
  const access = await requirePhase1OperationalAccess();

  if (
    typeof input.customerId !== "string" ||
    !canQueryCustomerId(input.customerId) ||
    typeof input.vehicleId !== "string" ||
    !canQueryCustomerId(input.vehicleId)
  ) {
    return { ok: false, message: CUSTOMER_VEHICLE_EDIT_UNAVAILABLE };
  }

  const validated = validateVehicleEdit({
    registration: input.registration,
    vin: input.vin,
    make: input.make,
    model: input.model,
    year: input.year,
    powerKw: input.powerKw,
    engine: input.engine,
    engineType: input.engineType,
    fuel: input.fuel,
    notes: input.notes,
    mileage: input.mileage,
  });
  if (!validated.ok) {
    return { ok: false, fieldErrors: validated.fieldErrors };
  }

  try {
    const supabase = await createClient();

    const { data: existing, error: existingError } = await supabase
      .from("vehicles")
      .select("id, mileage_latest_km")
      .eq("id", input.vehicleId)
      .eq("organization_id", access.organizationId)
      .eq("customer_id", input.customerId)
      .is("archived_at", null)
      .maybeSingle();

    if (existingError) {
      return { ok: false, message: CUSTOMER_VEHICLE_EDIT_GENERIC_ERROR };
    }
    if (!existing?.id) {
      return { ok: false, message: CUSTOMER_VEHICLE_EDIT_UNAVAILABLE };
    }

    const currentMileage =
      typeof existing.mileage_latest_km === "number"
        ? existing.mileage_latest_km
        : null;
    const mileageChanged =
      currentMileage !== validated.value.mileage_latest_km;

    const updatePayload: Record<string, string | number | null> = {
      registration_current: validated.value.registration_current,
      vin: validated.value.vin,
      make: validated.value.make,
      model: validated.value.model,
      year: validated.value.year,
      power_kw: validated.value.power_kw,
      engine: validated.value.engine,
      engine_type: validated.value.engine_type,
      fuel: validated.value.fuel,
      notes: validated.value.notes,
      mileage_latest_km: validated.value.mileage_latest_km,
    };
    if (mileageChanged) {
      updatePayload.mileage_latest_recorded_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("vehicles")
      .update(updatePayload)
      .eq("id", input.vehicleId)
      .eq("organization_id", access.organizationId)
      .eq("customer_id", input.customerId)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      if (isVinUniqueViolation(error)) {
        return {
          ok: false,
          fieldErrors: { vin: VIN_ALREADY_USED_MESSAGE },
        };
      }
      return { ok: false, message: CUSTOMER_VEHICLE_EDIT_GENERIC_ERROR };
    }
    if (!data?.id) {
      return { ok: false, message: CUSTOMER_VEHICLE_EDIT_UNAVAILABLE };
    }

    revalidatePath(`/dashboard/stranke/${input.customerId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: CUSTOMER_VEHICLE_EDIT_GENERIC_ERROR };
  }
}

/**
 * Create one new vehicle for an active customer in the authenticated org.
 * organizationId comes from requirePhase1OperationalAccess() only.
 * Does not create a customer or service_request; does not transfer ownership.
 */
export async function createCustomerVehicleAction(input: {
  customerId: string;
  registration: string;
  vin: string;
  make: string;
  model: string;
  year: string;
  powerKw: string;
  engine: string;
  engineType: string;
  fuel: string;
  notes: string;
  mileage: string;
}): Promise<CustomerVehicleCreateResult> {
  const access = await requirePhase1OperationalAccess();

  if (
    typeof input.customerId !== "string" ||
    !canQueryCustomerId(input.customerId)
  ) {
    return { ok: false, message: CUSTOMER_VEHICLE_CREATE_UNAVAILABLE };
  }

  const validated = validateVehicleEdit({
    registration: input.registration,
    vin: input.vin,
    make: input.make,
    model: input.model,
    year: input.year,
    powerKw: input.powerKw,
    engine: input.engine,
    engineType: input.engineType,
    fuel: input.fuel,
    notes: input.notes,
    mileage: input.mileage,
  });
  if (!validated.ok) {
    return { ok: false, fieldErrors: validated.fieldErrors };
  }

  try {
    const supabase = await createClient();

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id")
      .eq("id", input.customerId)
      .eq("organization_id", access.organizationId)
      .is("archived_at", null)
      .maybeSingle();

    if (customerError) {
      return { ok: false, message: CUSTOMER_VEHICLE_EDIT_GENERIC_ERROR };
    }
    if (!customer?.id) {
      return { ok: false, message: CUSTOMER_VEHICLE_CREATE_UNAVAILABLE };
    }

    const insertPayload: Record<string, string | number | null> = {
      organization_id: access.organizationId,
      customer_id: customer.id,
      registration_current: validated.value.registration_current,
      vin: validated.value.vin,
      make: validated.value.make,
      model: validated.value.model,
      year: validated.value.year,
      power_kw: validated.value.power_kw,
      engine: validated.value.engine,
      engine_type: validated.value.engine_type,
      fuel: validated.value.fuel,
      notes: validated.value.notes,
      mileage_latest_km: validated.value.mileage_latest_km,
    };
    if (validated.value.mileage_latest_km != null) {
      insertPayload.mileage_latest_recorded_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("vehicles")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      if (isVinUniqueViolation(error)) {
        return {
          ok: false,
          fieldErrors: { vin: VIN_ALREADY_USED_MESSAGE },
        };
      }
      return { ok: false, message: CUSTOMER_VEHICLE_EDIT_GENERIC_ERROR };
    }
    if (!data?.id) {
      return { ok: false, message: CUSTOMER_VEHICLE_CREATE_UNAVAILABLE };
    }

    revalidatePath(`/dashboard/stranke/${input.customerId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: CUSTOMER_VEHICLE_EDIT_GENERIC_ERROR };
  }
}
