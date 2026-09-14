/** Abuse / payload bounds for public website intake (not a substitute for rate limits). */
export const WEB_INTAKE_MAX_BODY_BYTES = 16 * 1024;

export const WEB_INTAKE_MAX_LENGTH = {
  displayName: 200,
  phone: 40,
  email: 254,
  vin: 32,
  registration: 40,
  make: 100,
  model: 100,
  engine: 100,
  engineType: 100,
  fuel: 32,
  serviceWanted: 200,
  problemDescription: 4000,
} as const;

export const WEB_INTAKE_ALLOWED_BODY_KEYS = [
  "clientRequestId",
  "displayName",
  "phone",
  "email",
  "vin",
  "registration",
  "make",
  "model",
  "year",
  "powerKw",
  "engine",
  "engineType",
  "fuel",
  "mileage",
  "serviceWanted",
  "problemDescription",
  "bringsOwnMaterial",
  "companyWebsite",
] as const;
