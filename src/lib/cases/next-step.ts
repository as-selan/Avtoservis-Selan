export type CaseStepKind =
  | "verify_intake" | "request_data" | "link_quibi" | "review_quibi_mismatch" | "prepare_offer"
  | "manual_quibi_estimate" | "review_estimate" | "revise_estimate" | "send_estimate"
  | "await_customer" | "manual_scheduling"
  | "manual_external_handoff" | "manual_inspection_billing" | "closed";

export type CaseStep = { kind: CaseStepKind; label: string; externalConfirmed: false };

export function nextCaseStep(input: {
  status: string; workOrderStatus?:string;
  offerPrepared: boolean;
  quibiLinked: boolean;
  quibiSyncStatus?: string;
  quoteReviewStatus?: string;
  deliveryStatus?: string;
  customerDecision?: string | null;
  fixedPriceStatus?: string | null;
  inspectionRepairDecision?: string | null;
  slotOfferStatus?: string | null;
  quibiDevWriteEnabled?: boolean; quibiSendStatus?: string | null; quibiSendAttempted?: boolean;
}): CaseStep {
  const step = (kind: CaseStepKind, label: string): CaseStep => ({ kind, label, externalConfirmed: false });
  if (input.inspectionRepairDecision === "not_ordered") {
    return step("manual_inspection_billing",
      "Popravilo ni naročeno: predhodni pregled je plačljiv. Znesek, račun in plačilo preverite ročno v Quibiju; tukaj niso potrjeni.");
  }
  switch (input.status) {
    case "needs_data": return step("request_data", "Zahtevaj manjkajoče podatke in nadaljuj isti primer.");
    case "new": return step("verify_intake", input.inspectionRepairDecision === "ordered"
      ? "Po naročenem popravilu je pregled brezplačen. Preveri podatke primera in izrecno sprejmi pripravo predračuna."
      : "Tadej naj preveri stranko, vozilo in podatke povpraševanja pred pripravo ponudbe.");
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
      if (input.quibiSendAttempted) return step("await_customer", input.quibiSendStatus === "sent"
        ? "Quibi je predal predračun poštnemu strežniku. Prejem ni dokazan; počakajte na dejanski odgovor stranke."
        : input.quibiSendStatus === "failed" ? "Quibi pošiljanje ni uspelo. Preverite napako; samodejne ponovitve ni."
        : "Quibi pošiljanje čaka ali je izid neznan. Selan spremlja status; ne pošiljajte ponovno.");
      if (input.quoteReviewStatus === "unreviewed")
        return step("review_estimate", "Tadej naj pregleda postavke in znesek v Selanu ter odobri in pošlje predračun.");
      if (input.quoteReviewStatus === "approved_for_send" && input.deliveryStatus !== "delivered")
        return step("send_estimate", "Pošlji odobreni predračun iz Selana prek Quibi API-ja; stanje se shrani samodejno.");
      return step("manual_quibi_estimate", input.quibiDevWriteEnabled
        ? "Pripravi in preveri predračun prek Quibi API-ja. Tadej mora pred pošiljanjem odobriti dejansko ceno."
        : "Poveži obstoječi predračun ali konfiguriraj preverjeno ustvarjanje prek Quibi API-ja.");
    case "awaiting_customer_approval": return step("await_customer", input.fixedPriceStatus
      ? "Po dejanskem sporočilu objavljene cene počakajte na odločitev stranke."
      : "Po dejanski dostavi počakaj na odločitev stranke.");
    case "awaiting_slot_selection":
      if (input.slotOfferStatus === "selected") return step("manual_scheduling",
        "Stranka je izbrala termin. Rezerviraj ga v MyPlanlyju in zabeleži dejansko referenco; rezervacija še ni potrjena.");
      if (input.slotOfferStatus === "offered") return step("manual_scheduling",
        "Tri možnosti so bile ročno poslane. Počakaj na dejansko izbiro stranke; termini še niso rezervirani.");
      if (input.slotOfferStatus === "proposed") return step("manual_scheduling",
        "Tri možnosti so pripravljene. Po dejanskem pošiljanju stranki zabeleži referenco; termini še niso rezervirani.");
      return step("manual_scheduling", "Ročno preveri tri možnosti v MyPlanlyju, pošlji jih stranki in zabeleži izbiro. Možnosti niso rezervirane.");
    case "converted": return step("manual_external_handoff", input.workOrderStatus==="awaiting_parts" ? "Pridobi potrebne dele in nadaljuj delo v nalogu." : input.workOrderStatus==="ready_for_collection" ? "Preveri dejanski račun v Quibiju ter uredi prevzem in plačilo pred zaključkom naloga." : "Odpri delovni nalog in zabeleži potek popravila. Račun ostaja v Quibiju; zaključek zahteva dejansko preverjen račun in prevzem.");
    case "closed": return step("closed", "Primer in delovni nalog sta zaključena.");
    case "appointment_confirmed": return step("manual_external_handoff", "Interni termin temelji na ročno zabeleženi rezervaciji v MyPlanlyju. Google Koledar ni samodejno usklajen.");
    case "declined": return step("closed", "Stranka je zavrnila storitev. Primer je zaključen brez termina.");
    default: return step("closed", "Preveri stanje primera in morebitne odprte napake.");
  }
}
