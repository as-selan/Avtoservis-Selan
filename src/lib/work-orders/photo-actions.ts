"use server";
import {randomUUID} from "node:crypto";
import {requirePhase1OperationalAccess} from "@/lib/auth/requireWorkshopAccess";
import {createClient} from "@/lib/supabase/server";
import {revalidatePath} from "next/cache";
import {photoKind} from "./photo-policy";
export async function uploadWorkOrderPhoto(form:FormData):Promise<{ok:true}|{ok:false;message:string}>{
 const access=await requirePhase1OperationalAccess(),id=String(form.get("orderId")??""),caption=String(form.get("caption")??"").trim(),file=form.get("photo");
 if(!/^[0-9a-f-]{36}$/i.test(id)||caption.length<4||caption.length>300||!(file instanceof File)||file.size>786432)return {ok:false,message:"Izberite fotografijo do 768 KB in dodajte opis."};
 const bytes=new Uint8Array(await file.arrayBuffer()),kind=photoKind(bytes);if(!kind)return {ok:false,message:"Dovoljene so samo fotografije JPEG, PNG in WebP."};
 const db=await createClient();const {data:order}=await db.from("work_orders").select("status").eq("organization_id",access.organizationId).eq("id",id).maybeSingle();
 if(!order||order.status==="closed")return {ok:false,message:"Fotografijo lahko dodate samo odprtemu nalogu svoje delavnice."};
 const photoId=randomUUID(),path=`${access.organizationId}/${id}/${photoId}.${kind==="jpeg"?"jpg":kind}`;
 const {error}=await db.storage.from("selan-work-order-photos").upload(path,bytes,{contentType:`image/${kind}`,upsert:false});
 if(error)return {ok:false,message:"Fotografije ni bilo mogoče shraniti. Preverite zasebno shrambo in migracijo za fotografije."};
 const result=await db.rpc("register_work_order_photo",{p_order_id:id,p_photo_id:photoId,p_storage_path:path,p_caption:caption});
 if(result.error||result.data?.ok!==true)return {ok:false,message:"Fotografija je v zasebni shrambi, povezava z nalogom pa ni potrjena. Pred ponovitvijo naj skrbnik preveri shrambo."};
 revalidatePath(`/dashboard/nalogi/${id}`);return {ok:true};
}
