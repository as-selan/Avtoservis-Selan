import type { WorkflowStatusId } from "./types";

export interface WorkflowStatusConfig {
  id: WorkflowStatusId;
  label: string;
  /** Tailwind-oriented token classes for badges and counters */
  badgeClass: string;
  counterClass: string;
  nextActionDefault: string;
}

/**
 * Centralized workflow labels — product/UI only.
 * Later these can map 1:1 to database enums without UI renames.
 */
export const WORKFLOW_STATUSES: WorkflowStatusConfig[] = [
  {
    id: "novo",
    label: "Novo",
    badgeClass: "bg-blue-50 text-blue-700 ring-blue-200",
    counterClass: "bg-blue-600 text-white",
    nextActionDefault: "Preglej povpraševanje",
  },
  {
    id: "manjkajo_podatki",
    label: "Manjkajo podatki",
    badgeClass: "bg-amber-50 text-amber-800 ring-amber-200",
    counterClass: "bg-amber-500 text-white",
    nextActionDefault: "Dopolni podatke",
  },
  {
    id: "potreben_pregled",
    label: "Potreben pregled",
    badgeClass: "bg-orange-50 text-orange-800 ring-orange-200",
    counterClass: "bg-orange-500 text-white",
    nextActionDefault: "Preglej vozilo",
  },
  {
    id: "priprava_ponudbe",
    label: "Priprava ponudbe",
    badgeClass: "bg-violet-50 text-violet-800 ring-violet-200",
    counterClass: "bg-violet-600 text-white",
    nextActionDefault: "Pripravi ponudbo",
  },
  {
    id: "caka_potrditev_ponudbe",
    label: "Čaka potrditev ponudbe",
    badgeClass: "bg-yellow-50 text-yellow-800 ring-yellow-200",
    counterClass: "bg-yellow-500 text-white",
    nextActionDefault: "Čaka stranko",
  },
  {
    id: "caka_izbiro_termina",
    label: "Čaka izbiro termina",
    badgeClass: "bg-cyan-50 text-cyan-800 ring-cyan-200",
    counterClass: "bg-cyan-600 text-white",
    nextActionDefault: "Čaka izbiro termina",
  },
  {
    id: "termin_potrjen",
    label: "Termin potrjen",
    badgeClass: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    counterClass: "bg-emerald-600 text-white",
    nextActionDefault: "Sprejem vozila",
  },
  {
    id: "zakljuceno",
    label: "Zaključeno",
    badgeClass: "bg-slate-100 text-slate-600 ring-slate-200",
    counterClass: "bg-slate-500 text-white",
    nextActionDefault: "Arhiv",
  },
];

export const WORKFLOW_STATUS_MAP = Object.fromEntries(
  WORKFLOW_STATUSES.map((s) => [s.id, s]),
) as Record<WorkflowStatusId, WorkflowStatusConfig>;

export function getStatusLabel(id: WorkflowStatusId): string {
  return WORKFLOW_STATUS_MAP[id].label;
}

export function getStatusBadgeClass(id: WorkflowStatusId): string {
  return WORKFLOW_STATUS_MAP[id].badgeClass;
}
