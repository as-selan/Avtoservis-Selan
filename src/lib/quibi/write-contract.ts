import { createHash } from "node:crypto";

export const QUIBI_DEV_ORIGIN = "https://dev.quibi.net";

const numericId = (value: string): string => {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)
    throw new Error("QUIBI_INVALID_ID");
  return value;
};

export function assertQuibiDevWriteAllowed(env: Record<string, string | undefined>, origin = QUIBI_DEV_ORIGIN): void {
  if (origin !== QUIBI_DEV_ORIGIN || env.APP_ENV !== "preproduction" || env.QUIBI_MODE !== "dev" ||
      env.QUIBI_DEV_WRITE_ENABLED !== "1" || env.SELAN_REMOTE_DEMO === "1" ||
      env.NEXT_PUBLIC_SELAN_REMOTE_DEMO === "1" || !env.QUIBI_DEV_USERNAME || !env.QUIBI_DEV_PASSWORD ||
      !(env.VERCEL_ENV === "preview" || env.SELAN_APPROVED_LOCAL_DEV === "1")) {
    throw new Error("QUIBI_DEV_WRITE_DISABLED");
  }
}

export type DocumentLine =
  | { sifra: string; kolicina: number; popust?: number; ddv_id?: string }
  | { opis: string; enota_id: string; ddv_id: string; kolicina: number; cenaZDDV: number; popust: number };

export type CreateEstimateInput = {
  numberingId: string;
  saleTypeId: string;
  customerId: string;
  vehicleId: string;
  serviceRequestId: string;
  lines: DocumentLine[];
  note?: string;
};

export type EstimateBody = {
  Glavadokumenta: {
    stevilcenje_id: number; vrstaprodaje: number; stranka_id: number;
    vozila_id: number; external_id: string; opomba?: string; id?: number;
  };
  Postavkedokumenta: Record<string, DocumentLine>;
};

export function buildEstimateBody(input: CreateEstimateInput): EstimateBody {
  const externalId = `selan-service-request:${input.serviceRequestId}`;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.serviceRequestId) || externalId.length > 128 ||
      input.lines.length < 1 || input.lines.length > 100) throw new Error("QUIBI_INVALID_ESTIMATE_INPUT");
  const lines: Record<string, DocumentLine> = {};
  input.lines.forEach((line, index) => {
    if (!Number.isFinite(line.kolicina) || line.kolicina <= 0 || line.kolicina > 100000 ||
        ("sifra" in line ? !line.sifra.trim() || line.sifra.length > 100 :
          !line.opis.trim() || line.opis.length > 500 || !/^\d+$/.test(line.enota_id) ||
          !/^\d+$/.test(line.ddv_id) || !Number.isFinite(line.cenaZDDV) || line.cenaZDDV < 0 ||
          !Number.isFinite(line.popust) || line.popust < 0 || line.popust > 100)) {
      throw new Error("QUIBI_INVALID_ESTIMATE_LINE");
    }
    lines[String(index + 1)] = line;
  });
  return {
    Glavadokumenta: {
      stevilcenje_id: Number(numericId(input.numberingId)),
      vrstaprodaje: Number(numericId(input.saleTypeId)),
      stranka_id: Number(numericId(input.customerId)),
      vozila_id: Number(numericId(input.vehicleId)),
      external_id: externalId,
      ...(input.note?.trim() ? { opomba: input.note.trim().slice(0, 500) } : {}),
    },
    Postavkedokumenta: lines,
  };
}

export function stableEstimatePayload(body: EstimateBody): { json: string; sha256: string } {
  const json = JSON.stringify(body);
  return { json, sha256: createHash("sha256").update(json).digest("hex") };
}

export function withDocumentId(body: EstimateBody, documentId: string): EstimateBody {
  return { Glavadokumenta: { ...body.Glavadokumenta, id: Number(numericId(documentId)) },
    Postavkedokumenta: body.Postavkedokumenta };
}

export function parseQuibiWriteResponse(value: unknown): { id: string; number: string; replayed: boolean } {
  if (!value || typeof value !== "object") throw new Error("QUIBI_INVALID_RESPONSE");
  const result = value as Record<string, unknown>;
  if (result.error !== false || !/^\d+$/.test(String(result.id ?? "")) || !String(result.ZapSt ?? "").trim())
    throw new Error(result.error === true ? "QUIBI_API_REJECTED" : "QUIBI_INVALID_RESPONSE");
  return { id: String(result.id), number: String(result.ZapSt), replayed: result.replayed === true };
}

export { numericId as validQuibiId };

/** Sending is permitted only on Vercel Preview; the local write exception never applies. */
export function assertQuibiDevTestSendAllowed(env: Record<string, string | undefined>, origin = QUIBI_DEV_ORIGIN): void {
  try { assertQuibiDevWriteAllowed(env, origin); }
  catch { throw new Error("QUIBI_DEV_TEST_SEND_DISABLED"); }
  if (env.VERCEL_ENV !== "preview") throw new Error("QUIBI_DEV_TEST_SEND_DISABLED");
}

export function quibiDevTestRecipient(env: Record<string, string | undefined>, customerEmail?: string | null): string {
  const email = env.QUIBI_DEV_TEST_RECIPIENT ?? "";
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      /(^|\.)(example\.(test|com|org|net)|test|localhost)$/.test(domain) ||
      domain.includes("example.test") || email.toLowerCase() === customerEmail?.trim().toLowerCase())
    throw new Error("QUIBI_TEST_RECIPIENT");
  return email;
}
