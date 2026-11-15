import { OFFER_PROVIDER_UNCONFIGURED_MESSAGE } from "@/lib/offer-preparation/constants";
import type {
  OfferDraftProvider,
  OfferProviderResult,
} from "@/lib/offer-preparation/types";

/**
 * Quibi write boundary. Public documentation names a create endpoint but does
 * not define a safe idempotency/reconciliation contract or returned ID shape.
 * The read integration never enables this provider's writes.
 */
export function getOfferDraftProvider(): OfferDraftProvider {
  return unconfiguredOfferDraftProvider;
}

const unconfiguredResult = (): OfferProviderResult => ({
  ok: false,
  code: "CONTRACT_UNVERIFIED",
  message: OFFER_PROVIDER_UNCONFIGURED_MESSAGE,
});

const unconfiguredOfferDraftProvider: OfferDraftProvider = {
  async createDraft(): Promise<OfferProviderResult> {
    return unconfiguredResult();
  },
  async getDraft(): Promise<OfferProviderResult> {
    return unconfiguredResult();
  },
  async updateDraft(): Promise<OfferProviderResult> {
    return unconfiguredResult();
  },
};
