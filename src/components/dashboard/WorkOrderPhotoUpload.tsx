"use client";
import {useRef,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {uploadWorkOrderPhoto} from "@/lib/work-orders/photo-actions";
async function compressedPhoto(file:File){
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>20000000)throw Error("Izberite fotografijo JPEG, PNG ali WebP do 20 MB.");
 const image=await createImageBitmap(file);if(image.width*image.height>25000000){image.close();throw Error("Fotografija je prevelika. Izberite manjšo različico.")}
 const scale=Math.min(1,1600/Math.max(image.width,image.height)),canvas=document.createElement("canvas");canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
 const ctx=canvas.getContext("2d");if(!ctx){image.close();throw Error("Fotografije ni mogoče pripraviti.")};ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();
 const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,"image/jpeg",0.75));if(!blob||blob.size>786432)throw Error("Izberite manjšo fotografijo; omejitev po pripravi je 768 KB.");return new File([blob],"photo.jpg",{type:"image/jpeg"});
}
export function WorkOrderPhotoUpload({id}:{id:string}){
 const [pending,start]=useTransition(),[message,setMessage]=useState(""),lock=useRef(false),router=useRouter();
 return <form className="space-y-3 rounded-xl border bg-white p-4" onSubmit={e=>{e.preventDefault();if(lock.current)return;lock.current=true;const f=new FormData(e.currentTarget);start(async()=>{try{const file=f.get("photo");if(!(file instanceof File))throw Error("Izberite fotografijo.");f.set("photo",await compressedPhoto(file));f.set("orderId",id);const r=await uploadWorkOrderPhoto(f);setMessage(r.ok?"Fotografija je varno shranjena v nalogu.":r.message);if(r.ok)router.refresh()}catch(error){setMessage(error instanceof Error?error.message:"Prenos ni potrjen.")}finally{lock.current=false}})}}>
 <h2 className="font-semibold">Fotografija popravila</h2><p className="text-sm text-slate-600">Fotografija se pred nalaganjem zmanjša. Shranjena je zasebno in dostopna samo pooblaščenim zaposlenim.</p><label className="block text-sm">Fotografija<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="mt-1 block w-full text-sm"/></label><label className="block text-sm">Opis fotografije<input name="caption" required minLength={4} maxLength={300} className="mt-1 w-full rounded border p-2"/></label><button disabled={pending} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{pending?"Pripravljam in nalagam…":"Shrani fotografijo"}</button>{message&&<p role="status">{message}</p>}
 </form>;
}
