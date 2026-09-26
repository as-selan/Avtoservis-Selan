/**
 * DEMO UI DATA ONLY — never insert into Supabase.
 * Timestamps are derived from the caller's `now` so period filters
 * (Danes / Ta teden / Ta mesec) stay meaningful without a hardcoded product calendar day.
 *
 * DASHBOARD_INITIAL_CLOCK remains for legacy demo helpers only.
 * The real dashboard uses server `generatedAt` via useDashboardNow(iso).
 */

import type {
  ActivityItemDemo,
  AppointmentDemo,
  AttentionItemDemo,
  ServiceOrderDemo,
} from "./types";
import {
  formatZonedClock,
  startOfZonedDay,
  toZonedDateString,
  zonedDateTimeToUtc,
  getZonedParts,
} from "./zoned-time";

/**
 * Stable reference clock for SSR and the client's first hydration render.
 * Must be a fixed absolute instant (not `new Date()`).
 */
export const DASHBOARD_INITIAL_CLOCK = new Date("2024-06-15T12:00:00.000Z");

/** Relative time, clamped to stay on the current workshop calendar day. */
function minutesAgoToday(now: Date, minutes: number): Date {
  const candidate = new Date(now.getTime() - minutes * 60_000);
  const start = startOfZonedDay(now);
  if (candidate < start) {
    return new Date(start.getTime() + 15 * 60_000);
  }
  return candidate;
}

function daysAgoAt(now: Date, days: number, hour: number, minute: number): Date {
  const start = startOfZonedDay(now);
  const pivoted = new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
  const p = getZonedParts(pivoted);
  return zonedDateTimeToUtc(p.year, p.month, p.day, hour, minute);
}

export function buildDemoServiceOrders(now: Date): ServiceOrderDemo[] {
  const rows: Array<Omit<ServiceOrderDemo, "updatedAt"> & { at: Date }> = [
    {
      id: "1050",
      customerName: "Anita Flogie",
      customerPhone: "+386 41 112 220",
      vehicleMakeModel: "Citroën C-Elysée",
      registration: "LJ 12-ABC",
      requestSummary: "Menjava zobatega jermena",
      status: "potreben_pregled",
      nextActionLabel: "Preglej vozilo",
      locationLabel: "Na servisu",
      appointmentTime: null,
      updatedLabel: "pred 17 min",
      at: minutesAgoToday(now, 17),
    },
    {
      id: "1049",
      customerName: "Dario Fekonja",
      customerPhone: "+386 40 555 101",
      vehicleMakeModel: "Škoda Superb",
      registration: "MB 33-SUP",
      requestSummary: "Menjava olja v avtomatskem menjalniku",
      status: "novo",
      nextActionLabel: "Preglej povpraševanje",
      locationLabel: "Pri stranki",
      appointmentTime: null,
      updatedLabel: "pred 35 min",
      at: minutesAgoToday(now, 35),
    },
    {
      id: "1048",
      customerName: "Jure Klančar",
      customerPhone: "+386 31 778 900",
      vehicleMakeModel: "Citroën C-Elysée",
      registration: "KR 19-CEL",
      requestSummary: "Zobati jermen + DPF",
      status: "potreben_pregled",
      nextActionLabel: "Preglej zahtevo / opravi diagnostiko",
      locationLabel: "Dvigalo 2",
      appointmentTime: null,
      updatedLabel: "pred 50 min",
      at: minutesAgoToday(now, 50),
    },
    {
      id: "1047",
      customerName: "Nina Mlakar",
      customerPhone: "+386 51 220 440",
      vehicleMakeModel: "Škoda Superb",
      registration: "CE 08-NML",
      requestSummary: "Menjava olja avtomatskega menjalnika",
      status: "priprava_ponudbe",
      nextActionLabel: "Pripravi ponudbo",
      locationLabel: "Parkirišče · cona B",
      appointmentTime: null,
      updatedLabel: "pred 1 uro",
      at: minutesAgoToday(now, 78),
    },
    {
      id: "1046",
      customerName: "Rok Zupan",
      customerPhone: "+386 41 900 311",
      vehicleMakeModel: "Audi A4 2.0 TDI",
      registration: "LJ 41-NPK",
      requestSummary: "Tresljaji pri zaviranju",
      status: "caka_potrditev_ponudbe",
      nextActionLabel: "Čaka stranko",
      locationLabel: "Pri stranki",
      appointmentTime: null,
      updatedLabel: "pred 1 uri",
      at: minutesAgoToday(now, 85),
    },
    {
      id: "1045",
      customerName: "Maja Rozman",
      customerPhone: "+386 70 333 212",
      vehicleMakeModel: "Peugeot 3008",
      registration: "CE 26-RVM",
      requestSummary: "Klimatska naprava ne hladi",
      status: "termin_potrjen",
      nextActionLabel: "Sprejem vozila",
      locationLabel: "Pri stranki",
      appointmentTime: "14:00",
      updatedLabel: "pred 2 urama",
      at: minutesAgoToday(now, 103),
    },
    {
      id: "1044",
      customerName: "Eva Kocjan",
      customerPhone: "+386 40 111 222",
      vehicleMakeModel: "Audi A4 2.0 TDI",
      registration: "LJ 41-NPK",
      requestSummary: "Redni servis + diagnostika",
      status: "caka_izbiro_termina",
      nextActionLabel: "Čaka izbiro termina",
      locationLabel: "Pri stranki",
      appointmentTime: null,
      updatedLabel: "včeraj",
      at: daysAgoAt(now, 1, 16, 20),
    },
    {
      id: "1043",
      customerName: "Borut Zajc",
      customerPhone: "+386 31 444 555",
      vehicleMakeModel: "VW Golf VII",
      registration: "KP 58-GOL",
      requestSummary: "Menjava zavor in kolesnih ležajev",
      status: "manjkajo_podatki",
      nextActionLabel: "Dopolni podatke",
      locationLabel: "Pri stranki",
      appointmentTime: null,
      updatedLabel: "pred 2 dnevoma",
      at: daysAgoAt(now, 2, 11, 0),
    },
  ];

  return rows.map(({ at, ...rest }) => ({
    ...rest,
    updatedAt: at.toISOString(),
  }));
}

/** Extra counts so workflow strip matches operational density (demo only) */
export const DEMO_WORKFLOW_BASE_COUNTS: Record<string, number> = {
  novo: 1,
  manjkajo_podatki: 7,
  potreben_pregled: 5,
  priprava_ponudbe: 6,
  caka_potrditev_ponudbe: 4,
  caka_izbiro_termina: 6,
  termin_potrjen: 8,
  zakljuceno: 12,
};

export function buildDemoAppointments(now: Date): AppointmentDemo[] {
  const today = toZonedDateString(now);
  return [
    {
      id: "a1",
      time: "09:00",
      customerName: "Eva Kocjan",
      vehicleLabel: "Audi A4 2.0 TDI · LJ 41-NPK",
      type: "sprejem",
      date: today,
    },
    {
      id: "a2",
      time: "11:00",
      customerName: "Borut Zajc",
      vehicleLabel: "VW Golf VII · KP 58-GOL",
      type: "servis",
      date: today,
    },
    {
      id: "a3",
      time: "14:00",
      customerName: "Maja Rozman",
      vehicleLabel: "Peugeot 3008 · CE 26-RVM",
      type: "diagnoza",
      date: today,
    },
  ];
}

export const DEMO_ATTENTION_ITEMS: AttentionItemDemo[] = [
  {
    id: "att1",
    title: "Neuspešna dostava e-pošte",
    detail: "Ponudba za nalog #1046 ni bila dostavljena.",
    severity: "critical",
    timeLabel: "pred 25 min",
    primaryAction: "Ponovi",
    secondaryAction: "Razreši",
  },
  {
    id: "att2",
    title: "Možen podvojen zapis stranke",
    detail: "Anita Flogie — preverite telefonsko številko.",
    severity: "warning",
    timeLabel: "pred 40 min",
    primaryAction: "Preveri",
  },
  {
    id: "att3",
    title: "Nerazrešen servisni nalog",
    detail: "Nalog #1043 čaka na manjkajoče podatke.",
    severity: "warning",
    timeLabel: "pred 2 urama",
    primaryAction: "Preveri",
    secondaryAction: "Razreši",
  },
];

export function buildDemoActivity(now: Date): ActivityItemDemo[] {
  const events = [
    {
      id: "act1",
      description: "Nalog #1047 – status spremenjen v Priprava ponudbe",
      actor: "Tadej Selan",
      timeAgo: "pred 1 uro",
      at: minutesAgoToday(now, 78),
    },
    {
      id: "act2",
      description: "Nova ponudba poslana – nalog #1046",
      actor: "Sistem",
      timeAgo: "pred 1 uri",
      at: minutesAgoToday(now, 85),
    },
    {
      id: "act3",
      description: "Termin potrjen – nalog #1045",
      actor: "Sistem",
      timeAgo: "pred 2 urama",
      at: minutesAgoToday(now, 103),
    },
    {
      id: "act4",
      description: "Nov servisni nalog ustvarjen – #1048",
      actor: "Tadej Selan",
      timeAgo: "pred 2 urama",
      at: minutesAgoToday(now, 120),
    },
  ];

  return events.map(({ at, ...rest }) => ({
    ...rest,
    time: formatZonedClock(at),
    occurredAt: at.toISOString(),
  }));
}

export const FUEL_OPTIONS = [
  { value: "bencin", label: "Bencin" },
  { value: "dizel", label: "Dizel" },
  { value: "hibrid", label: "Hibrid" },
  { value: "elektrika", label: "Elektrika" },
  { value: "plin", label: "Plin" },
] as const;
