"use server";
import {requireWorkshopAccess} from '@/lib/auth/requireWorkshopAccess';
export async function uploadWorkOrderPhoto(form:FormData):Promise<{ok:false;message:string}>{
 await requireWorkshopAccess();
 if(!/^[0-9a-f-]{36}$/i.test(String(form.get('orderId')??'')))return {ok:false,message:'Neveljavna interna naloga.'};
 return {ok:false,message:'Quibi API za fotografije in priloge še ni dokumentiran. Prenos je ustavljen; v Supabase ne ustvarjamo nove shrambe. Obstoječe fotografije so ohranjene.'};
}
