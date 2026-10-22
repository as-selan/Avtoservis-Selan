**Nadaljevanje:** [Dnevno delo, kontekst primera, mehanik, novi ciljni testi in dejanska blokada Previewa](followup/README.md). Prejšnji rezultati 525/42 spodaj veljajo za prejšnji commit; celotni E2E ostaja nepreverjen.

# P0: vodenje servisnega primera – dokazi 22. 10. 2026

## Posodobitev predloga po nadaljevanju razvoja

Aktivni obstoječi obrazec je zdaj neposredno pod vodenjem postopka; ostala opravila so razširljivi razdelki. Priprava, pregled/pošiljanje in odločitev stranke so ločeni. Povezave odprejo zloženi razdelek, prestavijo fokus in delujejo tudi pri neposrednem zaznamku ter uporabi tipkovnice. Faze so pri ozkih zaslonih prikazane v dveh stolpcih. Gumb pove konkreten rezultat dejanja; neuspešno, čakajoče in neznano pošiljanje so jasno označeni.

Na voljo je [kratek video UX navigacije](ui-navigation.webm): prikazuje štiri ločena sintetična stanja, ne opravljenega poslovnega postopka. Obrazci so dejanske obstoječe komponente s sintetičnimi vhodi, prikazane strežniško; poslovne akcije so v predogledu izrecno onemogočene. [Strojno berljivi rezultati preverjanja](validation-results.json).

## Rezultat in meja dokaza

Popravek je pripravljen za pregled, **ni potrjen za merge ali objavo**. Celoten scenarij splet → baza → predračun → odobritev → Quibi nalog ni bil izveden. Lokalni Docker daemon ni dosegljiv; ločena lokalna Supabase baza zato ne teče. Gostovani DEV zahteva prijavo in ni bila na voljo prijavljena testna seja. Podatki strank, migracije, RLS, auth, zunanja dovoljenja in okoljske nastavitve niso spremenjeni. WRITE/SEND nista omogočena. Noben finančni dokument ali sporočilo ni ustvarjeno.

## Zakaj se je Tadej izgubil

Na dejanski osnovi DEV je bil »Naslednji korak« navaden odstavek brez dejanja. Opis celotnega postopka je bil skrit v details in samo v načinu Quibi DEV. Sprejem, povezava stranke/vozila, predračun, odločitev in poslovni nalog so bili ločeni razdelki; blokiran sprejem je napotoval na nedoločen spodnji razdelek. Seznam dokumentov in AI sta prekinjala pot. Komponenta pošiljanja je lahko hkrati prikazovala dovoljen obrazec in trditev, da je DEV pošiljanje izključeno.

To je ugotovitev iz kode, ki ustreza gostovanemu commitu, ne trditev o ponovitvi Tadejeve prijavljene seje. Prijavljeni postopek in njegove morebitne omrežne napake ostajajo nepreverjeni.

## Identiteta različice

- Začetni cwd: `C:\Users\Admin\avtoservis-selan-wt\m3-m4-ci-db-tests-v1`, commit `7ff522b`; obstoječi nenadzorovani `.playwright-mcp/` in `disk-space-report.json` niso spreminjani.
- `git worktree list` in `git log --all` sta pokazala novejšo osnovo `a9bc369411d389292e4d702f43bc5d419dac7d9e`.
- Vercel projekt `avtoservis-selan-dev`, deployment `dpl_CSfrqtLseD1BXr7wvkbWx3AZeP2q`, Ready Preview, 18. 10. 2026 ob 16:54 Europe/Ljubljana.
- [Preverjeni DEV](https://avtoservis-selan-3ovfklagc-azalar7-langs-projects.vercel.app) ima isti commit, vejo `codex/selan-pr18-manual-qa` in oznako gitDirty=1. Lokalni izvorni worktree ima samo nenadzorovane posnetke, brez sprememb sledene kode.
- Nov ločen worktree: `C:\Users\Admin\.codex\worktrees\selan-p0-guided-case\m3-m4-ci-db-tests-v1`.
- Vercel MCP je vrnil 403 za ekipo. Obstoječa prijava CLI je omogočila read-only preverjanje pravega projekta in metapodatkov; konfiguracija ni spremenjena.

## Spremembe

- Sedem vidnih faz, dokazani zaključeni koraki, trenutna faza in en glavni navigacijski gumb na vrhu.
- Gumb odpira obstoječi obrazec ali pregled. Ne izvaja skritega CREATE/SEND in ne podvaja obrazcev. Opis izrecno pove, da sledi ločena potrditev.
- Jasne blokade za podatke, identiteto, vlogo, nedovoljen zapis/pošiljanje in neznan izid. Neznan finančni izid ima prednost tudi ob obstoječem nalogu.
- Tadejeva interna odobritev in pošiljanje uporabljata ločena obstoječa dejanja. Nepregledanega predračuna UI ne ponuja za pošiljanje. Strežniške varovalke ostajajo avtoriteta.
- Preverjen Quibi nalog je zaznan iz dnevnika tudi ob trenutno izključenem WRITE, pred dodelitvijo mehaniku. Priprava se ne prikazuje kot ustvarjen nalog.
- AI, povezani dokumenti in tehnična aktivacija so v details; dostop do podatkov je ohranjen. Ročni termini ostajajo obstoječa ločena pot.
- Neodvisni pregled je našel napačno nadaljevanje sprejete objavljene cene in preglasitev neznanega dokumenta z nalogom. Oboje je popravljeno in pokrito z regresijskima testoma. Pot objavljene cene brez predračuna še nima dokazano povezane poti do neposrednega Quibi naloga; UI to izrecno pove.

## Izvedeno preverjanje

| Preverjanje | Rezultat | Obseg |
| --- | --- | --- |
| Celoten lokalni Node testni nabor | 525/525 uspešnih, brez preskokov | Vsi testi src in lokalni HTTP fixture test; vloge, identiteta, cenovne pogodbe, negotovi izidi, ločena odobritev/SEND, vrstni red obrazcev |
| TypeScript `tsc --noEmit` | uspešno | Celoten projekt po spremembah |
| Celoten projektni ESLint in lint sprememb | uspešno | Začasna lastna mapa qa-visual je izključena; brez novih odvisnosti |
| Playwright izoliranega UX | 42/42 uspešnih | 14 stanj × 1440/390/350 px; aktivni obrazec prvi, vsak razdelek enkrat, ena CTA, sedem faz, tipkovnica/fokus, odpiranje zaznamkov, brez vodoravnega prelivanja. Prikazane so dejanske začetne komponente obrazcev; njihove poslovne akcije so izključene. |
| REA gostovani DEV | uspešno omejeno opazovanje | `/dashboard` → 307 → `/login` 200; vsi opaženi resource odgovori <400, brez zajetih request failures. To ne preveri notranjih poslovnih zahtevkov. |
| REA komponenta in delovni prostor | dejanski kliki | Pri 350 px glavni gumb odpre `#podatki`, klik podrobnosti odpre pregled predračuna; brez poslovnih akcij in brez teles ali vrednosti headerjev |
| Next build – Turbopack | infrastruktura blokira | Ponovno uporabljeni node_modules so junction iz obstoječega worktreeja; Turbopack zavrne pot zunaj korena. Paketov nismo dodajali. |
| Next build – Webpack | compile in TypeScript uspešna; celota neuspešna | Prerender `/dostop-zavrnjen` zahteva manjkajoča `NEXT_PUBLIC_SUPABASE_URL` in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Okoljskih nastavitev nismo spreminjali. |
| Webpack compile build | uspešno | `npm run build -- --webpack --experimental-build-mode compile`; optimizirani build brez prerender/generate faze, brez lokalnih Supabase nastavitev. To ni dokaz polnega produkcijskega builda. |
| Lokalni Quibi HTTP adapter | 1/1 uspešen, vključen v 525 | Sintetični prevzem stranke/vozila, predračuna, naloga, računa, PDF in idempotentnost/persistenca. SEND ostane izključen. Ni dejanski Quibi. |
| Zgodovinske fazne assertion skripte | 5 uspešnih, 4 neuspešne | Iste štiri napake so ponovljene na nespremenjeni DEV osnovi a9bc369; niso regresije tega UX popravka. |
| Dejanski E2E z bazo in Quibijem | **ni izveden** | Docker/Supabase ne teče, DEV ni prijavljen; poslovnih simulacij ne predstavljamo kot uspeh. |

Ponovljivi ukazi iz worktreeja:

```powershell
 $testFiles = @(rg --files src -g "*.test.ts")
node --experimental-strip-types --conditions=react-server --import ./scripts/contact-test-register.mjs --test --test-concurrency=2 $testFiles scripts/e2e/quibi-business-fixture.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node scripts/qa-case-journey.mjs --video
npm run lint -- --ignore-pattern "qa-visual/**"
npm run build -- --webpack --experimental-build-mode compile
```

`scripts/qa-case-journey.mjs` uporablja dejanske komponente CaseJourney, CaseWorkspace, navigacijo in začetne obrazce sprejema, priprave predračuna, pregleda, pošiljanja, odločitve in Quibi naloga. React in Tailwind ustvarita izoliran strežniški prikaz; poslovne akcije in zunanje povezave se ne izvajajo. To ni hidriran prijavljeni Next.js primer in ni polni E2E. Posnetki imajo stalno oznako sintetičnega UI.

Za lokalni pregled uporabite `node scripts/qa-case-journey.mjs --serve` in `http://127.0.0.1:47866/?case=new`; druga ločena stanja so `prepare`, `review`, `approval`, `order`, `sendFailed` in `sendQueued`. Strežnik ustavite s Ctrl+C. Predogled ne ustvarja dokumentov.

Neodvisni pregled nadaljevanja je odkril napačen cilj popravka zavrnjenega predračuna; popravljen je na obstoječi update obrazec v pregledu in pokrit z regresijskim testom. Opozorila primera so pred aktivnim obrazcem.

Starejši lokalni HTTP fixture je vrnil premalo cenovnih polj za današnji preverjeni parser. Usklajen je z obstoječo produkcijsko pogodbo (`cenaBrezDDV`, `Ddv.stopnjaDDV`, neto vrednost vrstice, bruto glava). Test preveri tudi varno QuibiValidationError zavrnitev in nespremenjen VIN. Produkcijski adapterji in cenovna logika niso spremenjeni.

Štiri stare fazne skripte imajo na osnovi in v popravku enak prvi neuspešen pogoj: `phase14b-customers-slice-a.assert.ts` – »Stranke label«; `phase14a-auth-access.assert.ts` – »missing/invalid membership -> redirect(/dostop-zavrnjen)«; `offer-review-customer-approval.assert.ts` – »Phase 8 unconfigured copy remains«; `offer-preparation.assert.ts` – »loader: no Quibi env«. Zgodovinskih varovalk nismo prepisovali, da bi umetno dobili zelen rezultat.

V `tests/e2e/workflow.spec.ts` je dopolnjen dejanski avtenticirani regresijski test sedmih faz in ciljev pri vseh treh širinah. Njegova izvedba skupaj s celotnim zahtevanim scenarijem čaka na izolirane disposable CI fixtures. Obstoječi varovalni pogoji CI/SELAN_ISOLATED_E2E so ohranjeni.

## REA dokazi

Uporabljen že nameščen `rea-agents@6.7.0` CLI, v nadaljevanju tudi razpoložljivi REA MCP za deklarirane klike. Brez namestitve ali popravka MCP konfiguracije. [Originalni DEV Evidence](rea-hosted-evidence.json) , [komponentni Evidence](rea-component-evidence.json) in [novi Evidence delovnega prostora](rea-workspace-evidence.json) vsebujejo izrecne korake, digest, metapodatke omrežja in omejitve. Telesa zahtev/odgovorov, vrednosti headerjev, piškotki in prijavni podatki niso zajeti.

[Rezultati brskalnika](browser-results.json), [1440 px](new-1440.png), [390 px](new-390.png), [350 px](new-350.png), [blokada identitete](identity-390.png), [priprava naloga](order-390.png), [dejanski obrazec sprejema](new-form-350.png), [obrazec predračuna](prepare-form-1440.png), [pregled](review-form-390.png), [obrazec naloga](order-form-390.png).

## Kaj je treba še dokazati pred merge

1. Zagnati izolirano Supabase okolje z odobreno obstoječo shemo oziroma zagotoviti prijavljeno DEV testno sejo z ločeno sintetično organizacijo. Ne uporabljati produkcijskih podatkov.
2. Izvesti novo spletno povpraševanje do nadzorne plošče, sprejema, Quibi READ/povezave, priprave, ustvarjenega dokumenta, ločene interne odobritve, dejanske odobritve stranke in naloga. Zabeležiti točno mejo, kjer dovoljenja WRITE/SEND ustavijo postopek.
3. Na polni strani ponoviti 1440/390/350 px, vključno z dejanskimi obrazci, omrežnimi napakami in vlogami owner/admin/reception/mechanic. Pri 390/350 preveriti vidnost CTA tudi z dejanskim app shellom.
4. Dodati posnetke prijavljenega sintetičnega primera in po možnosti video brez prijave, gesel ali osebnih podatkov. Sedanji komponentni posnetki tega ne nadomeščajo.
5. Ponoviti celoten build z odobreno lokalno testno konfiguracijo. Nobenega omogočanja Quibi WRITE/SEND brez izrecne odobritve.

## Prebrana navodila, dokumenti in veščine

V vseh relevantnih worktreejih prebrana `AGENTS.md` in `CLAUDE.md`, posebej:

- `C:\Users\Admin\avtoservis-selan-wt\m3-m4-ci-db-tests-v1\AGENTS.md` in `CLAUDE.md`
- `C:\Users\Admin\avtoservis-selan\AGENTS.md`
- `C:\Users\Admin\.codex\visualizations\2026\10\19\01a15645-6819-7141-96d0-be8755741639\selan-p0-case-flow\AGENTS.md`
- `C:\Users\Admin\.codex\worktrees\selan-p0-guided-case\m3-m4-ci-db-tests-v1\AGENTS.md` in `CLAUDE.md`
- `C:\Users\Admin\.ai-os\ORCHESTRATION_GUIDE.md`

Prebrane veščine, vse pod `C:\Users\Admin\.agents\skills\` (polna pot = ta koren + spodnja pot):

- `superpowers\using-superpowers\SKILL.md`
- `ai-orchestrator\SKILL.md`
- `find-skills\SKILL.md` (pregled obstoječih veščin; brez dodatnih namestitev)
- `superpowers\systematic-debugging\SKILL.md`
- `superpowers\using-git-worktrees\SKILL.md`
- `superpowers\brainstorming\SKILL.md` (uporabnikov opis je določil zasnovo in dovolil izvedbo)
- `superpowers\writing-plans\SKILL.md` (omejen načrt: dokaz različice → diagnoza → UI → testi → PR)
- `superpowers\test-driven-development\SKILL.md`
- `superpowers\verification-before-completion\SKILL.md`
- `superpowers\requesting-code-review\SKILL.md` in `code-reviewer.md` (neodvisni pregled)
- `vercel-react-best-practices\SKILL.md`
- `playwright-interactive\SKILL.md` (smernice vidnosti/širin; izvedba z obstoječim Playwright Node API)
- `reverse-engineer-anything\SKILL.md`, `references\connection-and-recovery.md`, `references\runtime-observation.md`

Lokalni Next vodiči: `C:\Users\Admin\.codex\worktrees\selan-pr18-manual-qa\m3-m4-ci-db-tests-v1\node_modules\next\dist\docs\01-app\02-guides\forms.md` in `01-app\03-api-reference\02-components\link.md`.

Relevantni izvorni dokumenti v osnovi novega worktreeja: `docs\tadej-remote-demo.md`, `docs\tadej-demo-pr18-local.md`, `scripts\manual-qa\README.md`, `scripts\manual-qa\production-parity.md`, `scripts\manual-qa\Start-ManualQa.ps1`. Skript iz tujih veščin nismo izvajali. REA je izrecno zahteval uporabnik.

Pregledana koda zajema primer `src\app\dashboard\primeri\[serviceRequestId]\page.tsx`, obstoječe komponente in dejanja za sprejem, pripravo, pregled, pošiljanje, odločitev, Quibi poslovne dokumente, dodelitve in končno ceno; politike naslednjega koraka, okolja, dostopa in razpoložljivosti nalogov; `tests\e2e\workflow.spec.ts`, lokalno Playwright konfiguracijo in obstoječe fixture skripte.

**Safe to keep:** da kot osnutek popravka za pregled; **ne kot potrjeno dokončan P0 ali dovoljenje za merge/objavo**.


Dodatno pregledane/spremenjene poti v `C:\Users\Admin\.codex\worktrees\selan-p0-guided-case\m3-m4-ci-db-tests-v1`: `src\components\dashboard\CaseWorkspace.tsx`, `CaseAnchorNavigation.tsx`, `src\lib\cases\workspace.ts`, `workspace.test.ts`, `navigation.ts`, `scripts\e2e\quibi-business-fixture.mjs` in `quibi-business-fixture.test.mjs`. Primerjalne assertion skripte so bile izvedene tudi na začasni arhivski kopiji a9bc369 pod `qa-visual\baseline`, ki je ignorirana in ni del PR.
