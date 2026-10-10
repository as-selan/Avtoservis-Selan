import Link from 'next/link';
import {requirePhase1OperationalAccess} from '@/lib/auth/requireWorkshopAccess';
import {configuredQuibiReadClient} from '@/lib/quibi/client';
import {quibiCatalogs,type QuibiCatalogKind} from '@/lib/quibi/catalog-read';
import {quibiLinkEnvironment} from '@/lib/quibi/workflow-config';
export const dynamic='force-dynamic';
export default async function QuibiIntegration(){
 await requirePhase1OperationalAccess();let client;try{client=configuredQuibiReadClient()}catch{return <p role="alert">Quibi branje ni konfigurirano v tem okolju. Poverilnice nastavi skrbnik; nikoli jih ne vnašajte v ta obrazec.</p>}
 const kinds=Object.keys(quibiCatalogs) as QuibiCatalogKind[],results=await Promise.allSettled(kinds.map(kind=>client.catalog(kind)));
 return <div className="space-y-5"><header><h1 className="text-2xl font-semibold">Quibi v Selanu</h1><p>Okolje: {quibiLinkEnvironment(process.env)==='dev'?'Quibi DEV':'Quibi produkcija'}. Ta stran izvaja samo branje.</p></header>
 <section className="space-y-2 rounded-xl border bg-white p-4"><h2 className="font-semibold">Poslovni podatki in dokumenti</h2><p>Stranke, vozila, predračuni, poslovni nalogi in računi ostajajo v Quibiju. V Selanu jih pregledujete prek potrjene povezave stranke. Lokalni nalog spremlja delo, opombe in fotografije; ni nov Quibi dokument.</p><Link className="block text-blue-700" href="/dashboard/stranke">Odpri stranke in njihove Quibi dokumente →</Link><Link className="block text-blue-700" href="/dashboard/nalogi">Odpri servisne naloge in povezave dokumentov →</Link></section>
 <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Komunikacija in varovalke</h2><p className="text-sm">Pošiljanje dokumentov po e-pošti uporablja obstoječi Quibi API in njegov send_id. Status sent pomeni predajo poštnemu strežniku, ne prejema pri stranki. Dejanska pošiljanja in Quibi zapisi ostajajo omejeni z obstoječimi dovoljenji.</p><p className="mt-2 text-sm">Samostojen Quibi API za SMS in splošna sporočila ni potrjen. AI ponudnik za obdelavo podatkov strank ni povezan; samodejnih odgovorov ali zunanjih dostav ne simuliramo.</p></section>
 <h2 className="font-semibold">Sveži šifranti Quibi</h2><div className="grid gap-4 md:grid-cols-2">{results.map((result,index)=><section key={kinds[index]} className="rounded-xl border bg-white p-4"><h3 className="font-semibold">{quibiCatalogs[kinds[index]].label}</h3>{result.status==='rejected'?<p role="alert">Branje ni uspelo. Preverite dostop in povezljivost; seznam ni potrjeno prazen.</p>:<ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">{result.value.map(item=><li key={item.id}>#{item.id} · {item.label}</li>)}{!result.value.length&&<li>Quibi je vrnil prazen seznam.</li>}</ul>}</section>)}</div>
 </div>;
}
