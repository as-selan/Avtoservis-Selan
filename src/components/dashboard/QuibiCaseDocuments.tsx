import Link from 'next/link';
import {configuredQuibiReadClient} from '@/lib/quibi/client';
import {readIntegrationOverview} from '@/lib/quibi/integration-overview';
import {quibiDocumentStatusLabel} from '@/lib/quibi/contracts';
import {quibiLinkEnvironment} from '@/lib/quibi/workflow-config';

export async function QuibiCaseDocuments({caseId,customerId,link}:{caseId:string;customerId:string;link:{external_id:string;quibi_environment:string;sync_status:string}}) {
  if (link.quibi_environment !== quibiLinkEnvironment(process.env)) {
    return <p role="alert">Povezava stranke pripada drugemu okolju Quibi. Dokumentov ne prikazujemo.</p>;
  }
  let overview;
  try { overview = await readIntegrationOverview(configuredQuibiReadClient(),link.external_id); }
  catch { return <p role="alert">Quibi stranke ni mogoče sveže preveriti. Dokumentov ne prikazujemo; podatki niso spremenjeni.</p>; }
  const groups = [
    {kind:'estimate',label:'Predračuni',result:overview.estimates},
    {kind:'work_order',label:'Poslovni delovni nalogi',result:overview.workOrders},
    {kind:'invoice',label:'Računi',result:overview.invoices},
  ];
  return <section className="space-y-3 rounded-xl border bg-white p-4">
    <h2 className="font-semibold">Dokumenti neposredno iz Quibija</h2>
    <p className="text-sm">{overview.customer.name} · Quibi #{overview.customer.id}. Dokumenti ostajajo v Quibiju. Spodaj so dokumenti te stranke; seznam sam ne dokazuje povezave s tem vozilom ali servisnim primerom.</p>
    {link.sync_status !== 'ok' && <p role="alert" className="text-sm text-amber-800">Lokalna povezava zahteva ponoven pregled pred poslovnimi spremembami.</p>}
    <Link href={`/dashboard/stranke/${customerId}/quibi`} className="inline-block text-blue-700">Preglej in uredi povezavo stranke in vozila →</Link>
    <div className="space-y-2 text-sm">
      <h3 className="font-medium">Vozila te stranke v Quibiju</h3>
      {overview.vehicles.status === 'rejected' ? <p role="alert">Vozil ni mogoče prebrati. Dokumenti so še vedno na voljo.</p> : overview.vehicles.value.length === 0 ? <p>Quibi za to stranko ni vrnil vozil.</p> : <ul className="space-y-1">{overview.vehicles.value.map(vehicle => <li className="break-words" key={vehicle.id}>#{vehicle.id} · {vehicle.registration || 'brez registracije'} · {vehicle.make} {vehicle.model} · VIN: {vehicle.vin || 'ni naveden'}{vehicle.disabled ? ' · neaktivno' : ''}</li>)}</ul>}
    </div>
    <div className="grid gap-4 md:grid-cols-3">{groups.map(({kind,label,result}) => <div key={kind} className="min-w-0">
      <h3 className="font-medium">{label}</h3>
      {result.status === 'rejected' ? <p role="alert" className="text-sm text-amber-800">Branje ni uspelo. To ne pomeni, da dokumentov ni. Ostali seznami so na voljo.</p> : result.value.length === 0 ? <p className="text-sm text-slate-600">Quibi ni vrnil dokumentov te vrste.</p> : <ul className="space-y-2 text-sm">{result.value.map(doc => <li key={doc.id} className="border-t pt-2">
        <Link className="block break-words text-blue-700" href={`/dashboard/stranke/${customerId}/quibi/dokumenti/${kind}/${doc.id}?caseId=${caseId}`}>#{doc.id} · {quibiDocumentStatusLabel(doc.status)} · odpri dokument in PDF</Link>
        {doc.amount && <p>Znesek po Quibiju: {doc.amount}</p>}
      </li>)}</ul>}
    </div>)}</div>
    <p className="text-xs text-slate-500">Sveže branje: {new Intl.DateTimeFormat('sl-SI',{timeZone:'Europe/Ljubljana',dateStyle:'medium',timeStyle:'short'}).format(new Date(overview.checkedAt))}. Prikaz ne ustvarja, spreminja ali pošilja dokumentov.</p>
  </section>;
}
