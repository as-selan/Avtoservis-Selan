export function workOrdersReadError(error:{code?:string}|null):string|null {
 if(!error)return null;
 if(error.code==='PGRST205'||error.code==='42P01')return 'Servisni nalogi v tej bazi še niso omogočeni. Hosted namestitev pripravljene migracije zahteva odobritev in preverjeno varnostno kopijo. Obstoječi primeri ostanejo na nadzorni plošči.';
 if(error.code==='42501')return 'Dostop do servisnih nalogov je zavrnjen. Skrbnik mora preveriti uporabniško vlogo in dovoljenja baze.';
 return 'Servisnih nalogov ni bilo mogoče prebrati. Preverite povezljivost in konfiguracijo baze. Napaka ne pomeni praznega seznama nalogov.';
}
