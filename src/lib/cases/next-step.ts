export type CaseStepKind =
  | "verify_intake" | "request_data" | "link_quibi" | "prepare_offer"
  | "quote_contract_blocked" | "await_customer" | "scheduling_blocked"
  | "manual_external_handoff" | "closed";

export type CaseStep = { kind: CaseStepKind; label: string; externalConfirmed: false };

export function nextCaseStep(input: {
  status: string;
  offerPrepared: boolean;
  quibiLinked: boolean;
}): CaseStep {
  const step = (kind: CaseStepKind, label: string): CaseStep => ({ kind, label, externalConfirmed: false });
  switch (input.status) {
    case "needs_data": return step("request_data", "Zahtevaj manjkajoče podatke in nadaljuj isti primer.");
    case "new": return step("verify_intake", "Preveri stranko, vozilo in podatke povpraševanja.");
    case "preparing_offer":
      if (!input.quibiLinked) return step("link_quibi", "Ročno potrdi obstoječo stranko v Quibiju.");
      if (!input.offerPrepared) return step("prepare_offer", "Pripravi podatke za predračun.");
      return step("quote_contract_blocked", "Quibijevo ustvarjanje predračuna čaka na potrjeno pogodbo API-ja.");
    case "awaiting_customer_approval": return step("await_customer", "Po dejanski dostavi počakaj na odločitev stranke.");
    case "awaiting_slot_selection": return step("scheduling_blocked", "Ponudba treh terminov čaka na potrjena pravila rezervacij.");
    case "appointment_confirmed": return step("manual_external_handoff", "Interni termin je potrjen; preveri in ročno uskladi Google Koledar ter MyPlanly.");
    default: return step("closed", "Preveri stanje primera in morebitne odprte napake.");
  }
}
