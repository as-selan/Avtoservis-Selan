export type OfferPreparationStatus = "ready_for_provider";

export type CanonicalOfferServiceRequest = {
  id: string;
  summary: string;
  problem_description: string | null;
  service_wanted: string | null;
  brings_own_material: boolean | null;
  mileage_reported_km: number | null;
};

export type CanonicalOfferCustomer = {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
};

export type CanonicalOfferVehicle = {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  registration_current: string | null;
  vin: string | null;
};

/**
 * Provider-neutral payload: references plus existing operational fields.
 * Does not copy invented prices, labour, parts, VAT, or external IDs.
 */
export type CanonicalOfferInput = {
  organizationId: string;
  serviceRequestId: string;
  offerPreparationId: string;
  serviceRequest: CanonicalOfferServiceRequest;
  customer: CanonicalOfferCustomer | null;
  vehicle: CanonicalOfferVehicle | null;
};

export type OfferProviderFailureCode =
  | "NOT_CONFIGURED"
  | "PROVIDER_UNAVAILABLE";

export type OfferProviderResult =
  | { ok: true }
  | {
      ok: false;
      code: OfferProviderFailureCode;
      message: string;
    };

export type OfferDraftProvider = {
  createDraft(input: CanonicalOfferInput): Promise<OfferProviderResult>;
  getDraft(input: CanonicalOfferInput): Promise<OfferProviderResult>;
  updateDraft(input: CanonicalOfferInput): Promise<OfferProviderResult>;
};
