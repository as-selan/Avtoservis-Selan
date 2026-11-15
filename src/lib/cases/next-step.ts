export type CaseStepKind =
  | "verify_intake" | "request_data" | "link_quibi" | "review_quibi_mismatch" | "prepare_offer"
  | "manual_quibi_estimate" | "review_estimate" | "revise_estimate" | "send_estimate"
  | "await_customer" | "manual_scheduling"
  | "manual_external_handoff" | "manual_inspection_billing" | "closed";

export type CaseStep = { kind: CaseStepKind; label: string; externalConfirmed: false };

export function nextCaseStep(input: {
  repairNextAction?:CaseStep;businessNextAction?:CaseStep; quibiCreateRejected?:boolean;customerApprovalVerified?:boolean;quibiCreateUncertain?:boolean;directQuibiBusiness?:boolean;status: string; workOrderStatus?:string; syntheticAppointment?:boolean;
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
  if(input.repairNextAction)return input.repairNextAction;
  if (input.inspectionRepairDecision === "not_ordered") {
    return step("manual_inspection_billing",
      "Popravilo ni naročeno: predhodni pregled je plačljiv. Znesek, račun in plačilo preverite ročno v Quibiju; tukaj niso potrjeni.");
  }
  if(input.directQuibiBusiness&&input.businessNextAction&&input.quibiLinked&&(!input.quibiSyncStatus||input.quibiSyncStatus==='ok')&&!['closed','cancelled','new','needs_data'].includes(input.status))return input.businessNextAction;
  if(input.directQuibiBusiness&&input.customerApprovalVerified&&input.quoteReviewStatus==='approved_for_send'&&input.quibiLinked&&(!input.quibiSyncStatus||input.quibiSyncStatus==='ok')&&!input.quibiCreateUncertain&&['preparing_offer','awaiting_customer_approval'].includes(input.status))return step('manual_external_handoff','Stranka je potrdila predračun. Nadaljujte s pripravo Quibi naloga spodaj; dostava in termin nista pogoja.');
  switch (input.status) {
    case "needs_data": return step("request_data", "Zahtevaj manjkajoče podatke in nadaljuj isti primer.");
    case "new": return step("verify_intake", input.inspectionRepairDecision === "ordered"
      ? "Po naročenem popravilu je pregled brezplačen. Preveri podatke primera in izrecno sprejmi pripravo predračuna."
      : "Tadej naj preveri stranko, vozilo in podatke povpraševanja pred pripravo ponudbe.");
    case "preparing_offer":
      if(input.quibiCreateRejected)return step('review_quibi_mismatch','Quibi je zavrnil prejšnje ustvarjanje; poskus ostaja zaklenjen. Ponudbo lahko spodaj informativno pregledate brez novega dokumenta.');
      if(input.quibiCreateUncertain)return step("review_quibi_mismatch","Spodaj lahko informativno pregledate ponudbo. Izid prejšnjega ustvarjanja še ni potrjen; ponovno ustvarjanje ostaja ustavljeno.");
      if (input.fixedPriceStatus === "prepared") return step("review_estimate", "Tadej naj preveri objavljeno končno ceno in vir.");
      if (input.fixedPriceStatus === "approved") return step("send_estimate", "Odobreno končno ceno dejansko sporočite stranki in zabeležite dokazilo.");
      if (input.fixedPriceStatus) return step("await_customer", "Preverite dejansko odločitev stranke o objavljeni končni ceni.");
      if (!input.quibiLinked) return step("link_quibi", "Preveri samodejno povezavo stranke in vozila s Quibijem; pri nejasnem ujemanju potrdi identiteto.");
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
        return step("send_estimate", "Pošlji odobreni predračun iz Selana v Quibiju; stanje se shrani samodejno.");
      return step("manual_quibi_estimate", input.quibiDevWriteEnabled === undefined
        ? "Odpri primer in preglej ponudbo s svežimi Quibijevimi postavkami in cenami. Ustvarjanje potrdiš ločeno."
        : input.quibiDevWriteEnabled
        ? "Pripravi in preveri predračun v Quibiju. Tadej mora pred pošiljanjem odobriti dejansko ceno."
        : "Samo predogled – ustvarjanje v Quibiju ni omogočeno. Uredite postavke in preglejte predračun.");
    case "awaiting_customer_approval": return step("await_customer", input.fixedPriceStatus
      ? "Po dejanskem sporočilu objavljene cene počakajte na odločitev stranke."
      : "Pošlji predračun, če še ni poslan, in zabeleži dejansko odločitev stranke. Odobritev po telefonu ne zahteva potrjene dostave.");
    case "awaiting_slot_selection":
      if(input.directQuibiBusiness&&input.customerDecision==="approved")return step("manual_external_handoff","Po potrditvi popravila nadaljujte s Quibi nalogom in nato računom v poslovnem postopku spodaj. Termin uredite ločeno po potrebi.");
      if (input.slotOfferStatus === "selected") return step("manual_scheduling",
        "Stranka je izbrala termin. Rezerviraj ga ročno in zabeleži dejansko referenco; rezervacija še ni potrjena.");
      if (input.slotOfferStatus === "offered") return step("manual_scheduling",
        "Tri možnosti so bile ročno poslane. Počakaj na dejansko izbiro stranke; termini še niso rezervirani.");
      if (input.slotOfferStatus === "proposed") return step("manual_scheduling",
        "Tri možnosti so pripravljene. Po dejanskem pošiljanju stranki zabeleži referenco; termini še niso rezervirani.");
      return step("manual_scheduling", "Ročno preveri tri dejanske možnosti, pošlji jih stranki in zabeleži izbiro. Možnosti niso rezervirane.");
    case "converted": return step("manual_external_handoff", input.workOrderStatus==="awaiting_parts" ? "Pridobi potrebne dele in nadaljuj delo v nalogu." : input.workOrderStatus==="ready_for_collection" ? "Preveri dejanski račun v Quibiju ter uredi prevzem in plačilo pred zaključkom naloga." : "Odpri delovni nalog in zabeleži potek popravila. Račun ostaja v Quibiju; zaključek zahteva dejansko preverjen račun in prevzem.");
    case "closed": return step("closed", "Primer in delovni nalog sta zaključena.");
    case "appointment_confirmed": return step("manual_external_handoff", input.syntheticAppointment ? "QA-SIM: interni testni termin je potrjen. Zunanje rezervacije ni; nadaljuj z lokalnim nalogom." : "Termin je ročno potrjen. Pripravi poslovni delovni nalog v Quibiju iz odobrenega predračuna; interna naloga ni obvezna. Zunanja sinhronizacija ni potrjena.");
    case "declined": return step("closed", "Stranka je zavrnila storitev. Primer je zaključen brez termina.");
    default: return step("closed", "Preveri stanje primera in morebitne odprte napake.");
  }
}

export type BusinessStepRecord={kind:string;state:string;quibi_id:string|null;quibi_content_sha256?:string|null;request_body?:string;send_status?:string|null;created_at?:string};
/** UI progress only: never closes a case, confirms receipt or changes Quibi data. */
export function quibiBusinessNextAction(rows:BusinessStepRecord[]):CaseStep|undefined{
 const step=(kind:CaseStepKind,label:string):CaseStep=>({kind,label,externalConfirmed:false});
 if(rows.some(r=>['work_order','invoice','work_order_update','invoice_update'].includes(r.kind)&&['prepared','dispatching','uncertain'].includes(r.state)))return step('review_quibi_mismatch','Preveri obstoječi Quibi dokument in njegov izid. Ponovno ustvarjanje in pošiljanje sta do razrešitve ustavljena.');
 const invoiceCreates=rows.filter(r=>r.kind==='invoice'&&r.state==='verified'&&r.quibi_id);
 if(invoiceCreates.length>1)return step('review_quibi_mismatch','Povezava računa zahteva pregled; ne ustvarjaj novega dokumenta.');
 if(invoiceCreates.length===1){const invoice=[...rows.filter(r=>(r.kind==='invoice'||r.kind==='invoice_update')&&r.state==='verified'&&r.quibi_id===invoiceCreates[0].quibi_id)].sort((a,b)=>(b.created_at??'').localeCompare(a.created_at??''))[0];
  const sends=rows.filter(r=>r.kind==='send'&&r.quibi_id===invoice.quibi_id);
  if(sends.some(r=>['dispatching','uncertain'].includes(r.state)))return step('review_quibi_mismatch','Izid pošiljanja računa #'+invoice.quibi_id+' zahteva READ preverjanje. Ne pošiljaj ponovno.');
  const current=sends.filter(r=>{try{return JSON.parse(r.request_body??'{}').sha===invoice.quibi_content_sha256}catch{return false}});
  if(current.some(r=>r.send_status==='sent'))return step('manual_external_handoff','Račun #'+invoice.quibi_id+' je predan poštnemu strežniku. Prejem, plačilo in prevzem vozila niso potrjeni.');
  if(current.some(r=>r.send_status==='queued'))return step('manual_external_handoff','Račun #'+invoice.quibi_id+' je v Quibijevi čakalni vrsti. Preveri status brez ponovnega pošiljanja.');
  if(current.some(r=>r.send_status==='failed'))return step('review_quibi_mismatch','Pošiljanje računa #'+invoice.quibi_id+' je zavrnjeno. Preveri razlog; ne ponavljaj samodejno.');
  return step('manual_external_handoff','Račun #'+invoice.quibi_id+' je ustvarjen. Preglej dokument in PDF ter potrdi pošiljanje.');
 }
 const orders=rows.filter(r=>r.kind==='work_order'&&r.state==='verified'&&r.quibi_id);
 if(orders.length===1)return step('manual_external_handoff','Dodeli mehaniku');
 return undefined;
}
