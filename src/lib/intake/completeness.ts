import type { IntakeCompleteness, IntakeMissingField } from "./types";
import { blankToNull } from "./normalize";

/**
 * V1 completeness — mirrored from private.compute_manual_intake_completeness.
 * RPC remains authoritative at write time. Adjust here + SQL together when
 * Quibi required fields are known.
 *
 * Manual intake requires phone OR email, plus VIN, make and model.
 * Website intake keeps phone AND email via computeIntakeCompleteness.
 */
export function computeManualIntakeCompleteness(input: {
  phone: string | null;
  email: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
}, contactPolicy: "manual" | "web" = "manual"): IntakeCompleteness {
  const missing: IntakeMissingField[] = [];
  const noContact = !blankToNull(input.phone) && !blankToNull(input.email);
  if ((contactPolicy === "web" || noContact) && !blankToNull(input.phone)) missing.push("phone");
  if ((contactPolicy === "web" || noContact) && !blankToNull(input.email)) missing.push("email");
  if (!blankToNull(input.vin)) missing.push("vin");
  if (!blankToNull(input.make)) missing.push("make");
  if (!blankToNull(input.model)) missing.push("model");

  if (missing.length === 0) {
    return {
      status: "new",
      missing_fields: [],
      next_action: "Preveri podatke pred pripravo ponudbe.",
    };
  }

  return {
    status: "needs_data",
    missing_fields: missing,
    next_action: "Pridobi manjkajoče podatke stranke ali vozila.",
  };
}

/** Website callers cannot supply a weaker policy. */
export function computeIntakeCompleteness(input: Parameters<typeof computeManualIntakeCompleteness>[0]): IntakeCompleteness {
  return computeManualIntakeCompleteness(input, "web");
}

/** Use current linked data, while preserving unknown requirements from the saved snapshot. */
export function currentIntakeCompleteness(input:Parameters<typeof computeManualIntakeCompleteness>[0]&{registration?:string|null},origin:{source:string;channel:string|null;intakeRequestId?:string|null;identityConfirmed?:boolean},recordedMissing:string[]=[]){
 const manual=origin.source==='manual'&&['manual','phone','sms'].includes(origin.channel??'');
 const linkedEmail=origin.identityConfirmed===true&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email?.trim()??'');
 const computed=computeManualIntakeCompleteness(input,manual||linkedEmail?'manual':'web');
 const known=new Set(['phone','email','vin','make','model']);
 const preserved=recordedMissing.filter(field=>!known.has(field)&&!(field==='registration'&&blankToNull(input.registration??null)));
 const missing_fields=[...new Set([...computed.missing_fields,...preserved])];
 return {missing_fields,status:missing_fields.length?'needs_data' as const:'new' as const,next_action:missing_fields.length?'Pridobi manjkajoče podatke stranke ali vozila.':'Preveri podatke pred pripravo ponudbe.'};
}
