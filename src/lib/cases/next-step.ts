export type CaseStepKind =
  | "verify_intake" | "request_data" | "link_quibi" | "review_quibi_mismatch" | "prepare_offer"
  | "manual_quibi_estimate" | "review_estimate" | "revise_estimate" | "send_estimate"
  | "await_customer" | "manual_scheduling"
  | "manual_external_handoff" | "closed";

export type CaseStep = { kind: CaseStepKind; label: string; externalConfirmed: false };

export function nextCaseStep(input: {
  status: string;
  offerPrepared: boolean;
  quibiLinked: boolean;
  quibiSyncStatus?: string;
  quoteReviewStatus?: string;
  deliveryStatus?: string;
  customerDecision?: string | null;
  fixedPriceStatus?: string | null;
}): CaseStep {
  const step = (kind: CaseStepKind, label: string): CaseStep => ({ kind, label, externalConfirmed: false });
  switch (input.status) {
    case "needs_data": return step("request_data", "Zahtevaj manjkajoče podatke in nadaljuj isti primer.");
    case "new": return step("verify_intake", "Preveri stranko, vozilo in podatke povpraševanja.");
    case "preparing_offer":
      if (input.fixedPriceStatus === "prepared") return step("review_estimate", "Tadej naj preveri objavljeno končno ceno in vir.");
      if (input.fixedPriceStatus === "approved") return step("send_estimate", "Odobreno končno ceno dejansko sporočite stranki in zabeležite dokazilo.");
      if (input.fixedPriceStatus) return step("await_customer", "Preverite dejansko odločitev stranke o objavljeni končni ceni.");
      if (!input.quibiLinked) return step("link_quibi", "Ročno potrdi obstoječo stranko v Quibiju.");
      if (input.quibiSyncStatus && !["ok", "never_checked"].includes(input.quibiSyncStatus))
        return step("review_quibi_mismatch", "Preveri spremembe ali napako Quibijeve povezave pred nadaljevanjem.");
      if (!input.offerPrepared) return step("prepare_offer", "Pripravi podatke za predračun.");
      if (input.customerDecision === "rejected" || input.quoteReviewStatus === "rejected_for_revision")
        return step("revise_estimate", "Po zavrnitvi se s stranko dogovori o nadaljevanju in po potrebi pripravi novo različico v Quibiju.");
      if (input.quoteReviewStatus === "unreviewed")
        return step("review_estimate", "Tadej naj pregleda dejanski Quibijev dokument in odloči o ceni.");
      if (input.quoteReviewStatus === "approved_for_send" && input.deliveryStatus !== "delivered")
        return step("send_estimate", "Odobreni predračun dejansko pošlji stranki in zabeleži dokazilo o pošiljanju.");
      return step("manual_quibi_estimate", "Predračun ustvari ročno v Quibiju, nato preveri in poveži dejanski dokument.");
    case "awaiting_customer_approval": return step("await_customer", input.fixedPriceStatus
      ? "Po dejanskem sporočilu objavljene cene počakajte na odločitev stranke."
      : "Po dejanski dostavi počakaj na odločitev stranke.");
    case "awaiting_slot_selection": return step("manual_scheduling", "Ročno preveri tri možnosti v MyPlanlyju, pošlji jih stranki in zabeleži izbiro. Možnosti niso rezervirane.");
    case "appointment_confirmed": return step("manual_external_handoff", "Interni termin temelji na ročno zabeleženi rezervaciji v MyPlanlyju. Google Koledar ni samodejno usklajen.");
    case "declined": return step("closed", "Stranka je zavrnila storitev. Primer je zaključen brez termina.");
    default: return step("closed", "Preveri stanje primera in morebitne odprte napake.");
  }
}
