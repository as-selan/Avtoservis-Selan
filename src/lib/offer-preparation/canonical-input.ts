import type {
  CanonicalOfferCustomer,
  CanonicalOfferInput,
  CanonicalOfferServiceRequest,
  CanonicalOfferVehicle,
} from "@/lib/offer-preparation/types";

type ServiceRequestSource = {
  id: string;
  summary: string;
  problem_description: string | null;
  service_wanted: string | null;
  brings_own_material: boolean | null;
  mileage_reported_km: number | null;
};

type CustomerSource = {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
};

type VehicleSource = {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  registration_current: string | null;
  vin: string | null;
};

export function buildCanonicalOfferInput(args: {
  organizationId: string;
  offerPreparationId: string;
  serviceRequest: ServiceRequestSource;
  customer: CustomerSource | null;
  vehicle: VehicleSource | null;
}): CanonicalOfferInput {
  const serviceRequest: CanonicalOfferServiceRequest = {
    id: args.serviceRequest.id,
    summary: args.serviceRequest.summary,
    problem_description: args.serviceRequest.problem_description,
    service_wanted: args.serviceRequest.service_wanted,
    brings_own_material: args.serviceRequest.brings_own_material,
    mileage_reported_km: args.serviceRequest.mileage_reported_km,
  };

  const customer: CanonicalOfferCustomer | null = args.customer
    ? {
        id: args.customer.id,
        display_name: args.customer.display_name,
        email: args.customer.email,
        phone: args.customer.phone,
      }
    : null;

  const vehicle: CanonicalOfferVehicle | null = args.vehicle
    ? {
        id: args.vehicle.id,
        make: args.vehicle.make,
        model: args.vehicle.model,
        year: args.vehicle.year,
        registration_current: args.vehicle.registration_current,
        vin: args.vehicle.vin,
      }
    : null;

  return {
    organizationId: args.organizationId,
    serviceRequestId: args.serviceRequest.id,
    offerPreparationId: args.offerPreparationId,
    serviceRequest,
    customer,
    vehicle,
  };
}
