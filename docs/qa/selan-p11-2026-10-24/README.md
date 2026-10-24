# P1.1: popravki po ugotovitvah REA

## Ugotovitve in implementacija

Poročilo je prebrano iz `C:/Users/Admin/avtoservis-selan/docs/qa/selan-rea-e2e-a73db6be/E2E-UX-REPORT.md` in kanonični zapis `C:/Users/Admin/avtoservis-selan/docs/selan-rea-e2e-a73db6be-audit.md`. V aktivnem worktreeju ga ni bilo; najden je bil v glavnem lokalnem projektu. To poročilo ne trdi, da je Codex ponovil Cursorjev prijavljeni E2E.

### Iskanje in povezave

Vzrok: dnevna čakalna vrsta je pred iskanjem izločila TEST/QA primere, zloženi testni seznam pa ni uporabljal istega iskanja. Iskanje je bilo tudi omejeno na izbrano skupino; v podatkih ni bilo Quibi ID-ja naloga. Kratka pot se je ustavila pri UUID validaciji.

- Skupni iskalnik primerja kratko oznako, UUID, Quibi nalog, stranko, registracijo, vozilo in opis. Pri iskanju preišče vse skupine.
- Quibi ID pride iz obstoječega preverjenega naloga/dnevnika v istem organizacijskem dashboard snapshotu. Ni novega privileged/global iskalnika.
- Privzeta skupina je prva neprazna skupina rednega dela; testni primeri je ne vplivajo. Pri testnih zadetkih je vidna tudi njihova poslovna faza (npr. Priprava računa), normalni števci pa jih še naprej ne štejejo.
- TEST/QA zadetki ostanejo ločeni od rednega dela in števcev; ob iskanju se njihov razdelek odpre. Odsotnost rednega zadetka ne trdi, da testnega zadetka ni.
- `/dashboard/primeri/A73DB6BE` uporablja točno 8 šestnajstiških znakov, UUID obseg, prijavljeno Supabase povezavo, izrecni `organization_id`, ne-arhivirane primere in največ dva zadetka. Samo en zadetek se preusmeri na polni obstoječi UUID. Dvoumna/nedostopna oznaka ne izbere prvega primera in ne razkrije druge organizacije.

### Ime mehanika

Dejanski READ po dodelitvi A73: aktivni član z vlogo mechanic; `nullif(trim(profiles.full_name),'') is not null = false`. Ime ni bilo izgubljeno pri prikazu: v profilu manjka. Dodatni READ potrdi tudi odsotnost full_name/name/display_name v Auth metapodatkih; ni obstoječega imena za varen samodejni prenos. Pravega imena nimamo in ga nismo ugibali ali zapisali.

`team_members` vrne `profiles.full_name`, delo ga poveže po `mechanic_id`, dashboard ga prenese iz istega branja, prikaz uporablja ime pred e-pošto. Manjkajoče ime v povzetku zdaj izrecno pojasni in usmeri v Nastavitve → Ekipa. Obstoječi pooblaščeni lastnik lahko vnese ime; shranjevanje ostaja omejeno na preverjenega mehanika iste organizacije in stolpec full_name. Dovoljenja admina/produkcije in RLS se ne spreminjajo. Po shranjevanju se dashboard layout ponovno validira.

Povzetek primera zdaj vsebuje mehanika tudi pri pripravi računa. E-pošta je sekundarna oziroma ostane dovoljen nadomestni prikaz na seznamu.

### Navlaka in račun

- Staro izvorno stanje povpraševanja je premaknjeno pod »Več podrobnosti«, da ne tekmuje s trenutno poslovno fazo.
- Vgrajeni prikaz popravila v strani primera ne ponavlja polnega vozila, stranke in povzetka; dodatni kontekst je pod »Podrobnosti popravila«. Samostojna stran naloga še vedno pokaže kontekst na vrhu.
- Povzetek v poznih fazah pokaže povezani nalog in trenutno fazo namesto stare daljše razlage ponudbe.
- Ostali obrazci, AI, Quibi zgodovina in tehnični podatki ostajajo v obstoječem »Več podrobnosti«. Trenutni obrazec je prvi. Ne odstranjujemo nerešenih obveznih podatkov ali dovoljenj.
- Priprava računa še vedno odpira `#poslovni-nalog` istega primera. Pregled dela se ne potrjuje ponovno. CREATE/SEND in zaščita pred podvojitvijo ostajajo nespremenjeni.
- Cene A73 32,94 / 58,97 / 19,96 = 111,87 in dokumenta 2176932/2176933 se ne spreminjajo. V tej nalogi ni bilo Quibi CREATE/SEND ali novih poslovnih zapisov.

### Datumi

Native `input type=date` lahko prikazuje mm/dd/yyyy po nastavitvah brskalnika/OS, tudi na strani z lang=sl. Za datum storitve, izdaje in zapadlosti v pripravi računa je zdaj uporabljen eksplicitni slovenski tekstovni vnos `dd. mm. llll` z validacijo koledarja. Obračun predhodnega pregleda uporablja isto komponento.

Obrazec strežniku pošlje skrito ISO vrednost YYYY-MM-DD. Ne izvaja pretvorbe časovnega pasu in ne spreminja shranjenih datumov. Napačen/neenoumen datum ne more obdržati starega dovoljenja za izdajo. Med tipkanjem delnega datuma ne teče nov READ, postavke pa ostanejo na zaslonu. Ob osvežitvi se datumi ohranijo v isti brskalniški seji, kot prej; med napravami se ne prenašajo.

## Varnost in preverjanje

Dejanski DEV READ metapodatkov potrjuje RLS=true na profiles, service_requests in service_case_assignments ter obstoječe authenticated SELECT politike. Kratka povezava ne uporablja service-role ključa. Regresijski test dejanskega lookup helperja preveri organizacijski filter, arhivski filter, limit 2 in zavrnitev dvoumnosti. To ni prijavljen negativni E2E z drugo organizacijo; tega ne označujemo kot izvedenega.

Regresije vključujejo iskanje po vseh zahtevanih identifikatorjih v ločenem TEST razdelku, kanonično povezavo, ime in e-pošto, slovensko tipkanje datumov in skrite ISO vrednosti po reload, faze, varno navigacijo na račun ter obstoječe zaščite dokumentov. Širine 1440/390/350 px.

Posnetki so izolirane realne komponente, ne prijavljena aplikacija:

- [Račun 390](estimate/invoice-preview-390.png)
- [Račun 1440](estimate/invoice-preview-1440.png)
- [Dashboard 390](shell/dashboard-390.png)

## Ponovitev v Cursor REA

1. Prijavljen administrator odpre DEV. Poišče A73DB6BE, cel UUID, #2176933, TEST SELAN in TEST-2026. Zadetek ostane v ločenem testnem razdelku.
2. Odpre `/dashboard/primeri/A73DB6BE`; rezultat mora biti kanonični UUID istega dostopnega primera. Negativni preizkus druge organizacije mora ostati brez dostopa.
3. Lastnik vnese pravo ime v Ekipa, nato osveži dashboard, nalog in primer. Ne vnašajte izmišljenega imena v obstoječi profil.
4. Pripravi račun brez CREATE: preveri nalog 2176933, tri nespremenjene cene in skupaj 111,87. Brez ponovne potrditve pregleda dela.
5. Vpiše datum npr. 24. 10. 2026 ter izrecno zapadlost; preveri slovenski prikaz, ISO vrednost v zahtevi in reload iste seje. Ne ustvari računa ali pošiljanja.
6. Ponovi mobilni prikaz 390/350 in namizje 1440. Glavni obrazec naj bo viden, vozilo/AI/tehnični razdelki sekundarni.

## Prebrane smernice in veščine

Aktivni projekt `C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1/AGENTS.md` in v tej isti seji prebrani `CLAUDE.md`, lokalni Next vodiči use-client/use-server ter redirects. `C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md`. Veščine: `C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md`, `superpowers/systematic-debugging/SKILL.md`, `superpowers/verification-before-completion/SKILL.md`, `product-designer/SKILL.md`, `security-review/SKILL.md`, `deploy-to-vercel/SKILL.md`. Vercel `C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/vercel/0.54.1/skills/deployments-cicd/SKILL.md`.

Spremenjene so obstoječe komponente dashboarda/povzetka/računa, adapterji snapshotov, skupni iskalni helper, kratek scoped lookup in slovenski datum. Brez migracij, novih odvisnosti, auth/RLS sprememb ali sprememb WRITE/SEND. Končni commit, testni rezultat in READY Preview so zapisani v opisu PR #19.
