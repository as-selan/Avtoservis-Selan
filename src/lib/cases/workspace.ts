/** Presentation order only; every business form and server permission remains unchanged. */
export function caseSectionOrder(activeHref: string, ids: string[]): string[] {
 const requested=activeHref.startsWith('/dashboard/nalogi/')?'popravilo':activeHref.replace(/^#/, '');
 const active=ids.includes(requested)?requested:ids[0];
 return active?[active,...ids.filter(id=>id!==active)]:[];
}
export function journeyActionDescription(href: string): string {
 const descriptions: Record<string,string>={
  '#podatki':'Preverite opis, kontakt in vozilo ter potrdite sprejem. Sprejem pripravi podatke za ponudbo; še ne ustvari predračuna.',
  '#quibi-povezava':'Primerjajte stranko in pravo vozilo s Quibijem. Razdelek pokaže povezavo, morebitno neskladje in dovoljen način nadaljevanja.',
  '#predracun':'Uporabite že shranjene podatke in Quibijeve postavke. Najprej preglejte predlog; ustvarjanje dokumenta potrdite posebej.',
  '#pregled-predracuna':'Preglejte postavke, znesek in dokument. Tadejeva odobritev in pošiljanje sta ločeni dejanji; ne pomenita odobritve stranke.',
  '#odobritev':'Zabeležite dejanski odgovor stranke in sledljivo referenco. Odobritev po telefonu je ločena od stanja pošiljanja.',
  '#poslovni-nalog':'Nalog prevzame podatke preverjenega predračuna. Preglejte jih in ustvarjanje posebej potrdite; obstoječega naloga ne ustvarjajte znova.',
  '#popravilo':'Odprite obstoječe delo, zabeležite napredek in dokazila. Račun, plačilo in prevzem preverite ločeno.',
  '#termini':'Uporabite obstoječi obrazec za pregled ali ročni dogovor. Pripravljene možnosti še niso rezervacija.',
  '#objavljena-cena':'Preverite objavljeno storitev in ceno. Sporočilo stranki in njen odgovor zabeležite kot ločena dejanska dogodka.',
 };
 return descriptions[href]??'Odprite obstoječi nalog in nadaljujte delo na istem primeru.';
}
