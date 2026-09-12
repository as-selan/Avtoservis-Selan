export type WorkflowStatusId =
  | "novo"
  | "manjkajo_podatki"
  | "potreben_pregled"
  | "priprava_ponudbe"
  | "caka_potrditev_ponudbe"
  | "caka_izbiro_termina"
  | "termin_potrjen"
  | "zakljuceno";

export type DashboardPeriodId =
  | "vsi"
  | "danes"
  | "ta_teden"
  | "ta_mesec"
  | "po_zelji";

export type AppointmentType = "sprejem" | "servis" | "diagnoza";

export type AttentionSeverity = "critical" | "warning" | "info";

export type FuelType = "bencin" | "dizel" | "hibrid" | "elektrika" | "plin";

export interface ServiceOrderDemo {
  id: string;
  customerName: string;
  customerPhone?: string;
  vehicleMakeModel: string;
  registration?: string;
  requestSummary: string;
  status: WorkflowStatusId;
  nextActionLabel: string;
  locationLabel?: string;
  appointmentTime?: string | null;
  updatedAt: string;
  updatedLabel: string;
}

export interface AppointmentDemo {
  id: string;
  time: string;
  customerName: string;
  vehicleLabel: string;
  type: AppointmentType;
  date: string;
}

export interface AttentionItemDemo {
  id: string;
  title: string;
  detail: string;
  severity: AttentionSeverity;
  timeLabel: string;
  primaryAction: string;
  secondaryAction?: string;
}

export interface ActivityItemDemo {
  id: string;
  time: string;
  description: string;
  actor: string;
  timeAgo: string;
  occurredAt: string;
}
