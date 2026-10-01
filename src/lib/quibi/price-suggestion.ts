import { vehicleFingerprint, type QuibiEstimateDetail, type QuibiVehicle } from "./contracts.ts";

type Quote = {
  evidence_kind: string; evidence_payload: unknown; content_sha256: string;
  internal_review_status: string;
};

/** A price can be proposed only from the exact Quibi document linked to this case. */
export function verifiedLinkedEstimatePrice(
  quote: Quote, externalCustomerId: string, detail: QuibiEstimateDetail,
): { amount: string; state: "proposed" | "approved"; sourceId: string } | null {
  if (quote.evidence_kind !== "quibi_manual_estimate" || !quote.evidence_payload ||
      typeof quote.evidence_payload !== "object" || Array.isArray(quote.evidence_payload)) return null;
  const evidence = quote.evidence_payload as Record<string, unknown>;
  if (evidence.external_id !== detail.id || evidence.customer_external_id !== externalCustomerId ||
      detail.customerId !== externalCustomerId || detail.contentSha256 !== quote.content_sha256 ||
      !["unreviewed", "approved_for_send"].includes(quote.internal_review_status) ||
      detail.lines.length === 0 || !/^\d+(?:\.\d{1,2})?$/.test(detail.amount) ||
      Number(detail.amount) <= 0 || !Number.isFinite(Number(detail.amount))) return null;
  return {
    amount: detail.amount, sourceId: detail.id,
    state: quote.internal_review_status === "approved_for_send" ? "approved" : "proposed",
  };
}

export function verifiedCasePrice(input: {
  quote: Quote; customerId: string; detail: QuibiEstimateDetail;
  localVehicle: Pick<QuibiVehicle, "vin" | "registration" | "make" | "model">;
  remoteVehicle: QuibiVehicle;
  vehicleLink: {
    quibi_customer_id: string; quibi_vehicle_id: string; sync_status: string;
    local_fingerprint: string; external_fingerprint: string;
  };
}) {
  if (!verifiedVehicleLink(input)) return null;
  return verifiedLinkedEstimatePrice(input.quote, input.customerId, input.detail);
}

export function verifiedVehicleLink(input: {
  customerId: string;
  localVehicle: Pick<QuibiVehicle, "vin" | "registration" | "make" | "model">;
  remoteVehicle: QuibiVehicle;
  vehicleLink: {
    quibi_customer_id: string; quibi_vehicle_id: string; sync_status: string;
    local_fingerprint: string; external_fingerprint: string;
  };
}): boolean {
  const { customerId, localVehicle, remoteVehicle, vehicleLink } = input;
  if (vehicleLink.sync_status !== "ok" || vehicleLink.quibi_customer_id !== customerId ||
      vehicleLink.quibi_vehicle_id !== remoteVehicle.id || remoteVehicle.customerId !== customerId ||
      vehicleFingerprint(localVehicle) !== vehicleLink.local_fingerprint ||
      vehicleFingerprint(remoteVehicle) !== vehicleLink.external_fingerprint || remoteVehicle.disabled) return false;
  return true;
}
