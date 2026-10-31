export type CustomerDirectoryItem = {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  customerType: string;
  customerTypeLabel: string;
  activeVehicleCount: number;
  serviceRequestCount: number;
  lastUpdatedAt: string | null;
  lastUpdatedLabel: string;
};

export type CustomerDirectoryResult =
  | { ok: true; customers: CustomerDirectoryItem[] }
  | { ok: false; message: string };

export type CustomerVehicleView = {
  id: string;
  registration: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  powerKw: number | null;
  engine: string | null;
  engineType: string | null;
  fuel: string | null;
  fuelLabel: string | null;
  notes: string | null;
  mileageLatestKm: number | null;
  mileageLabel: string | null;
};

export type CustomerServiceRequestView = {
  id: string;
  summary: string;
  statusLabel: string;
  statusBadgeClass: string;
  nextAction: string | null;
  hasError: boolean;
  errorReason: string | null;
  attentionNeeded: boolean;
  attentionReason: string | null;
  vehicleLabel: string | null;
  updatedAt: string;
  updatedLabel: string;
};

export type CustomerDetailView = {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  customerType: string;
  customerTypeLabel: string;
  notes: string | null;
  vehicles: CustomerVehicleView[];
  serviceRequests: CustomerServiceRequestView[];
};

export type CustomerDetailResult =
  | { ok: true; customer: CustomerDetailView }
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "error"; message: string };
