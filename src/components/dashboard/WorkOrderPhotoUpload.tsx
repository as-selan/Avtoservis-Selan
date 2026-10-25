"use client";
import {useEffect,useRef,useState,useTransition} from 'react';
import Image from 'next/image';
async function compressedPhoto(file:File){
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>20000000)throw Error("Izberite fotografijo JPEG, PNG ali WebP do 20 MB.");
 const image=await createImageBitmap(file);if(image.width*image.height>25000000){image.close();throw Error("Fotografija je prevelika. Izberite manjšo različico.")}
 const scale=Math.min(1,1600/Math.max(image.width,image.height)),canvas=document.createElement("canvas");canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
 const ctx=canvas.getContext("2d");if(!ctx){image.close();throw Error("Fotografije ni mogoče pripraviti.")};ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();
 const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,"image/jpeg",0.75));if(!blob||blob.size>786432)throw Error("Izberite manjšo fotografijo; omejitev po pripravi je 768 KB.");return new File([blob],"photo.jpg",{type:"image/jpeg"});
}

export function WorkOrderPhotoUpload({id}:{id:string}){
 const [pending,start]=useTransition(),[preview,setPreview]=useState<string|null>(null),[message,setMessage]=useState(''),url=useRef<string|null>(null),lock=useRef(false);
 useEffect(()=>()=>{if(url.current)URL.revokeObjectURL(url.current)},[]);
 return <section className="space-y-3 rounded-xl border bg-white p-4" aria-label="Fotografije popravila">
 <h2 className="font-semibold">Fotografije popravila</h2>
 <p className="text-sm">Quibi povezava za fotografije in priloge še ni na voljo. Obstoječe fotografije ostajajo ohranjene. Novih fotografij ne shranjujemo v Selanovo bazo ali Supabase Storage.</p>
 <label className="block text-sm">Mobilno fotografiranje ali izbor za predogled v tej napravi<input disabled={pending} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="mt-1 block w-full text-sm" onChange={e=>{const file=e.target.files?.[0];if(!file||lock.current)return;lock.current=true;setMessage('');start(async()=>{try{const photo=await compressedPhoto(file);if(url.current)URL.revokeObjectURL(url.current);url.current=URL.createObjectURL(photo);setPreview(url.current);setMessage('Fotografija je pripravljena samo v tej napravi. Ni bila naložena ali povezana s Quibijem.')}catch(error){setMessage(error instanceof Error?error.message:'Predogled ni uspel.')}finally{lock.current=false}})}}/></label>
 {preview&&<><Image src={preview} alt="Lokalni predogled fotografije popravila" width={1600} height={1200} unoptimized className="h-auto max-h-96 w-full object-contain"/><a href={preview} download={'selan-'+id+'.jpg'} className="inline-block rounded border px-3 py-2">Prenesi fotografijo v napravo</a></>}
 <p className="text-sm">Povezovanje fotografij s Quibijem še ni na voljo. Zasebne fotografije ostanejo pri nalogu v Selanu.</p>
 {message&&<p role="status">{message}</p>}
 </section>;
}
