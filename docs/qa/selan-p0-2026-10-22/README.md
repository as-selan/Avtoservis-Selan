# P0: vodenje servisnega primera – dokazi 22. 10. 2026

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
| Node regresijski testi | 35/35 uspešnih | Izbor naslednjega koraka, faze, vloge, negotovi izidi, ločena odobritev/SEND |
| TypeScript `tsc --noEmit` | uspešno | Celoten projekt po spremembah |
| ESLint spremenjenih datotek | uspešno | Produkcijske in testne datoteke popravka |
| Playwright izolirane komponente | 33/33 uspešnih | 11 stanj × 1440/390/350 px, ena CTA, sedem faz, ciljni anchor, brez vodoravnega prelivanja; CTA vidna v 900 px visokem izoliranem oknu |
| REA gostovani DEV | uspešno omejeno opazovanje | `/dashboard` → 307 → `/login` 200; vsi opaženi resource odgovori <400, brez zajetih request failures. To ne preveri notranjih poslovnih zahtevkov. |
| REA komponenta | deklarirani dejanski klik | Pri 350 px gumb odpre `#podatki`, omrežje/console brez teles ali vrednosti headerjev |
| Next build – Turbopack | infrastruktura blokira | Ponovno uporabljeni node_modules so junction iz obstoječega worktreeja; Turbopack zavrne pot zunaj korena. Paketov nismo dodajali. |
| Next build – Webpack | compile in TypeScript uspešna; celota neuspešna | Prerender `/dostop-zavrnjen` zahteva manjkajoča `NEXT_PUBLIC_SUPABASE_URL` in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Okoljskih nastavitev nismo spreminjali. |
| Dejanski E2E z bazo in Quibijem | **ni izveden** | Docker/Supabase ne teče, DEV ni prijavljen; poslovnih simulacij ne predstavljamo kot uspeh. |

Ponovljivi ukazi iz worktreeja:

```powershell
node --experimental-strip-types --test src/lib/cases/journey.test.ts src/lib/cases/next-step.test.ts src/components/dashboard/QuibiSendAvailability.test.ts
node node_modules/typescript/bin/tsc --noEmit
node scripts/qa-case-journey.mjs
```

`scripts/qa-case-journey.mjs` uporablja dejansko komponento, React in Tailwind ter začasni loopback HTTP strežnik. Ciljni razdelki so izrecno označeni testni vsebniki, brez poslovnih obrazcev. V rezultatih in posnetkih je ta omejitev vidna. Skripta ne uporablja prijave, baze, Quibija ali skrivnosti. To ni polni E2E.

V `tests/e2e/workflow.spec.ts` je dopolnjen dejanski avtenticirani regresijski test sedmih faz in ciljev pri vseh treh širinah. Njegova izvedba skupaj s celotnim zahtevanim scenarijem čaka na izolirane disposable CI fixtures. Obstoječi varovalni pogoji CI/SELAN_ISOLATED_E2E so ohranjeni.

## REA dokazi

Uporabljen že nameščen `rea-agents@6.7.0` CLI, brez namestitve ali popravka MCP konfiguracije. [Originalni DEV Evidence](rea-hosted-evidence.json) in [komponentni Evidence](rea-component-evidence.json) vsebujejo izrecne korake, digest, metapodatke omrežja in omejitve. Telesa zahtev/odgovorov, vrednosti headerjev, piškotki in prijavni podatki niso zajeti.

[Rezultati brskalnika](browser-results.json), [1440 px](new-1440.png), [390 px](new-390.png), [350 px](new-350.png), [blokada identitete](identity-390.png), [priprava naloga](order-390.png).

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

