
import Link from 'next/link';
import {requirePhase1OperationalAccess} from '@/lib/auth/requireWorkshopAccess';
import {configuredQuibiReadClient} from '@/lib/quibi/client';
import {assertDirectDevVehicleRead} from '@/lib/quibi/direct-document-read';
export const dynamic='force-dynamic';
export default async function QuibiVehicle({params}:{params:Promise<{customerId:string;vehicleId:string}>}){
 const access=await requirePhase1OperationalAccess(),{customerId,vehicleId}=await params;
 let info;try{assertDirectDevVehicleRead(process.env,access.role,customerId,vehicleId);info=await configuredQuibiReadClient().vehicleInfo(vehicleId,customerId)}catch{return <p role="alert">Vozila in njegove povezave s stranko ni mogoče preverjeno prebrati v Quibi.</p>}
 const v=info.vehicle;
 return <section className="space-y-4"><Link className="text-blue-700" href={'/dashboard/quibi?customerId='+customerId}>← Quibi stranka #{customerId}</Link><h1 className="text-2xl font-semibold">{v.make} {v.model} · {v.registration}</h1><p className="break-all">Quibi vozilo #{v.id} · VIN {v.vin||'ni vrnjen'} · {v.disabled?'neaktivno':'aktivno'}</p><section className="space-y-2 rounded border bg-white p-4"><h2 className="font-semibold">Podatki neposredno iz Quibija</h2><p className="whitespace-pre-wrap break-words">Opomba: {info.note||'ni navedena'}</p><p>Garancija do: {info.warrantyUntil||'ni navedena'}</p><p>Servisna predloga: {info.serviceTemplate?info.serviceTemplate.name+' · #'+info.serviceTemplate.id:'ni dodeljena'}</p><ul className="space-y-2">{info.dates.map((d,i)=><li key={i}>{d.name}: {d.date}</li>)}{!info.dates.length&&<li>Quibi ni vrnil dodatnih datumov vozila.</li>}</ul></section><section className="space-y-2 rounded border p-4"><h2 className="font-semibold">Servisna zgodovina in intervali</h2><p>Servisno zgodovino in intervale vodi Quibi. Tukaj še niso na voljo; interni zapiski jih ne nadomeščajo.</p><a className="text-blue-700 underline" href="https://dev.quibi.net" target="_blank" rel="noreferrer">Odpri Quibi · vozilo #{v.id}</a><p className="text-sm">To je prehod v Quibi; neposredna povezava na zavihek vozila ni potrjena.</p></section></section>;
}
