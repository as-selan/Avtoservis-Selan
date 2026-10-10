"use server";
import {requirePhase1OperationalAccess} from "@/lib/auth/requireWorkshopAccess";
import {createClient} from "@/lib/supabase/server";
import {revalidatePath} from "next/cache";
import {canTransitionWorkOrder} from "./policy";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const errors:Record<string,string>={forbidden:"Za to dejanje nimate dovoljenja.",confirmed_appointment_required:"Najprej potrdite dejansko rezerviran servisni termin.",vehicle_contact_required:"Dopolnite kontakt, VIN, registracijo, znamko in model.",intake_review_required:"Najprej je potreben Tadejev pregled sprejema.",customer_approval_required:"Potrebna je dejanska odobritev stranke za zadnjo ponudbo ali objavljeno ceno.",inspection_decision_required:"Najprej zaključite pregled in zabeležite naročilo popravila.",stale_status:"Stanje se je spremenilo. Osvežite nalog; ne ponavljajte prejšnjega koraka.",invalid_transition:"Ta prehod stanja ni dovoljen.",invoice_handover_required:"Zaključek zahteva skrbniško potrditev dejanskega računa v Quibiju in prevzema.",idempotency_conflict:"Ta zahteva je že uporabljena z drugo vsebino. Preverite dnevnik naloga."};
export async function createWorkOrder(caseId:string):Promise<{ok:true;id:string}|{ok:false;message:string}>{
 await requirePhase1OperationalAccess();if(!uuid.test(caseId))return {ok:false,message:"Neveljaven primer."};
 const db=await createClient();const {data,error}=await db.rpc("create_work_order",{p_service_request_id:caseId});
 if(error||data?.ok!==true)return {ok:false,message:errors[data?.error_code]??"Naloga ni mogoče ustvariti. Preverite, da je migracija za delovne naloge nameščena."};
 revalidatePath("/dashboard");revalidatePath(`/dashboard/primeri/${caseId}`);revalidatePath("/dashboard/nalogi");return {ok:true,id:data.id};
}
export async function recordWorkOrder(form:FormData):Promise<{ok:true}|{ok:false;message:string}>{
 const access=await requirePhase1OperationalAccess();const id=String(form.get("orderId")??""),command=String(form.get("commandId")??""),expected=String(form.get("expectedStatus")??""),next=String(form.get("nextStatus")??"")||null,note=String(form.get("note")??"").trim();
 if(!uuid.test(id)||!uuid.test(command)||note.length<4||note.length>4000||(next&&!canTransitionWorkOrder(expected,next)))return {ok:false,message:"Vnesite veljavno opombo in dovoljeno spremembo stanja."};
 if(next==="closed"&&!["owner","admin"].includes(access.role))return {ok:false,message:errors.forbidden};
 const db=await createClient();const {data,error}=await db.rpc("record_work_order",{p_order_id:id,p_expected_status:expected,p_next_status:next,p_note:note,p_command_id:command,p_invoice_reference:form.get("invoiceReference")||null,p_handover_reference:form.get("handoverReference")||null,p_close_confirmed:form.get("closeConfirmed")==="yes"});
 if(error||data?.ok!==true)return {ok:false,message:errors[data?.error_code]??"Sprememba ni potrjena. Osvežite nalog in preverite dnevnik."};
 revalidatePath(`/dashboard/nalogi/${id}`);revalidatePath("/dashboard/nalogi");revalidatePath("/dashboard");return {ok:true};
}
