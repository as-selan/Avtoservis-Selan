/**
 * Manual intake domain types (shared by dashboard modal and future website form).
 * Completeness / status derivation is mirrored from the SQL helper;
 * the RPC remains authoritative at write time.
 */

export type ManualIntakeChannel = "phone" | "sms" | "manual";

export type ManualIntakeErrorCode =
  | "validation_failed"
  | "forbidden"
  | "ambiguous_customer"
  | "ambiguous_vehicle"
  | "vehicle_ownership_conflict"
  | "archived_customer_match"
  | "archived_vehicle_match"
  | "selection_conflict"
  | "unexpected";

/** Machine-readable missing field ids from V1 completeness. */
export type IntakeMissingField =
  | "phone"
  | "email"
  | "vin"
  | "make"
  | "model";

export type IntakeCompleteness = {
  status: "new" | "needs_data";
  missing_fields: IntakeMissingField[];
  next_action: string;
};

/** DB fuel values (M3 vehicles.fuel check). */
export type IntakeFuelDb =
  | "petrol"
  | "diesel"
  | "hybrid"
  | "plug_in_hybrid"
  | "electric"
  | "lpg"
  | "cng"
  | "hydrogen"
  | "other";

export type ManualIntakeInput = {
  displayName: string;
  phone: string | null;
  email: string | null;
  channel: ManualIntakeChannel;
  vin: string | null;
  registration: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  powerKw: number | null;
  engine: string | null;
  engineType: string | null;
  fuel: IntakeFuelDb | null;
  mileageReportedKm: number | null;
  serviceWanted: string | null;
  problemDescription: string | null;
  bringsOwnMaterial: boolean;
  selectedCustomerId: string | null;
  selectedVehicleId: string | null;
  clientRequestId: string;
};

export type IntakeVehicleCandidate = {
  vehicleId: string;
  make: string | null;
  model: string | null;
  registrationCurrent: string | null;
  vin: string | null;
};

export type IntakeCustomerCandidate = {
  customerId: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  vehicles: IntakeVehicleCandidate[];
};

export type CreateManualIntakeSuccess = {
  ok: true;
  customerId: string;
  customerCreated: boolean;
  vehicleId: string | null;
  vehicleCreated: boolean;
  serviceRequestId: string;
  status: "new" | "needs_data";
  missingFields: string[];
  nextAction: string | null;
  replayed: boolean;
};

export type CreateManualIntakeFailure = {
  ok: false;
  errorCode: ManualIntakeErrorCode;
};

export type CreateManualIntakeResult =
  | CreateManualIntakeSuccess
  | CreateManualIntakeFailure;
