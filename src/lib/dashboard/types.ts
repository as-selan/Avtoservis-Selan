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
  /** Canonical service_requests.id (UUID). Not shown in the ID column. */
  serviceRequestId?: string;
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
  /** Compact date label for multi-day Termini card (e.g. Danes / 14. 9.). */
  dateLabel: string;
  time: string;
  customerName: string;
  vehicleLabel: string;
  type: AppointmentType;
  /** Workshop YYYY-MM-DD for the appointment start. */
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
  /** ISO timestamp for period filtering (real data). */
  occurredAt?: string;
}

export interface ActivityItemDemo {
  id: string;
  time: string;
  description: string;
  actor: string;
  timeAgo: string;
  occurredAt: string;
}

/** Server-loaded dashboard payload (no demo fallback). */
export type DashboardSnapshotOk = {
  ok: true;
  /** Server reference instant used for labels + SSR/hydration period filtering. */
  generatedAt: string;
  orders: ServiceOrderDemo[];
  attention: AttentionItemDemo[];
  appointments: AppointmentDemo[];
  activity: ActivityItemDemo[];
};

export type DashboardSnapshotError = {
  ok: false;
  generatedAt: string;
  message: string;
};

export type DashboardSnapshot = DashboardSnapshotOk | DashboardSnapshotError;
