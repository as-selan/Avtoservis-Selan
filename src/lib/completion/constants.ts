/** Default completion-link lifetime. Application constant (also capped in SQL). */
export const COMPLETION_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const COMPLETION_PATH = "/dopolnitev";
export const COMPLETION_API_PATH = "/api/dopolnitev";

export const COMPLETION_MAX_BODY_BYTES = 16 * 1024;

export const COMPLETION_MAX_LENGTH = {
  phone: 40,
  email: 254,
  vin: 32,
  make: 100,
  model: 100,
} as const;

export const COMPLETION_ALLOWED_BODY_KEYS = [
  "action",
  "phone",
  "email",
  "vin",
  "make",
  "model",
] as const;

export const COMPLETION_OFFER_NEXT_ACTION = "Pripravi ponudbo za pregled.";

export const COMPLETION_NEEDS_DATA_NEXT_ACTION =
  "Pridobi manjkajoče podatke stranke ali vozila.";

export const COMPLETION_ATTENTION_REASON =
  "Preveri podatke iz dopolnitve spletnega povpraševanja.";

export const COMPLETION_UNAVAILABLE_MESSAGE =
  "Povezava ni veljavna ali je potekla.";

export const COMPLETION_COMPLETED_MESSAGE =
  "Hvala. Podatki so dopolnjeni in servis lahko pripravi ponudbo.";

export const COMPLETION_PARTIAL_MESSAGE =
  "Hvala. Podatki so shranjeni. Servis še potrebuje manjkajoče podatke.";
