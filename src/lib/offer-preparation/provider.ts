import { OFFER_PROVIDER_UNCONFIGURED_MESSAGE } from "@/lib/offer-preparation/constants";
import type {
  OfferDraftProvider,
  OfferProviderResult,
} from "@/lib/offer-preparation/types";

/**
 * Fail-closed adapter until a real offer system (Quibi) is documented and configured.
 * No HTTP, no credentials, no invented endpoints, no fabricated external IDs.
 */
export function getOfferDraftProvider(): OfferDraftProvider {
  return unconfiguredOfferDraftProvider;
}

const unconfiguredResult = (): OfferProviderResult => ({
  ok: false,
  code: "NOT_CONFIGURED",
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
