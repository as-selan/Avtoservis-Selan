
import {configuredQuibiReadClient} from '@/lib/quibi/client';
/** Render only after the containing route has confirmed document/customer ownership. */
export async function QuibiDocumentPayments({documentId}:{documentId:string}){
 let rows;try{rows=await configuredQuibiReadClient().documentPayments(documentId)}catch{return <section className="rounded border p-4"><h2 className="font-semibold">Plačila v Quibiju</h2><p role="alert">Plačil dokumenta ni mogoče potrditi ali njihovega formata zanesljivo razložiti. To ne pomeni, da račun ni plačan. Preverite dokument v Quibiju.</p></section>}
 return <section className="space-y-2 rounded border bg-white p-4"><h2 className="font-semibold">Plačila v Quibiju</h2><ul className="space-y-2 text-sm">{rows.map((p,i)=><li key={p.id||i}>{p.amount} EUR · {p.date||'datum ni vrnjen'} · {p.method||'način ni vrnjen'}</li>)}{!rows.length&&<li>Quibi ni vrnil plačil za ta dokument.</li>}</ul><p className="text-sm">Svež READ iz Quibija. Selan ne ustvarja druge evidence plačil in iz tega seznama ne sklepa o zaključku primera.</p></section>;
}
