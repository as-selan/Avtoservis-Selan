# En delovni prostor za pripravo predračuna

Nadaljevanje Draft PR #19. Običajna pot je zdaj: že potrjena stranka/vozilo → postavke, količine, cene in skupaj → Preglej predračun → Potrdi in ustvari v Quibiju, samo kadar je WRITE dovoljen. Ustvarjanje ne pošlje dokumenta in ne pomeni odobritve stranke.

## Kaj je poenostavljeno

- V običajni pripravi je en obrazec. Obstoječa kanonična priprava ponudbe se ob prvem pregledu zagotovi z obstoječo idempotentno akcijo; ni več ločenega gumba in obrazca zanjo.
- Podatki stranke in vozila ostanejo iz primera, enolična postavka/AI predlog in dodeljeni cenik se prenesejo. Neznanih količin ne ugibamo. Enota, DDV in enolični tehnični šifranti niso ročni ponovni vnos.
- Ročni Quibi ID in njegova nujna izjava o ročnem preverjanju sta zaprta v možnosti »Napredno – poveži obstoječ predračun«. V običajnem urejevalniku ni potrditvenih polj za ponavljanje identitete.
- Pri izključenem WRITE je izrecno zapisano »Samo predogled – ustvarjanje v Quibiju ni omogočeno«. Naslednji korak ne zahteva ročnega povezovanja.
- Razlika osnovne/cenikovne cene in izbira sta pri konkretni postavki. Za isti artikel se uporabi dodeljeni cenik stranke; podvojene izbire istega artikla iz drugih cenikov ne ustvarjajo napačnega predvidenega zneska.
- Ceno je mogoče izrecno urediti za preverjeno nezalogovno postavko. Za zalogovne ali neznane artikle ostaja preverjena omejitev API-ja in strežnik spremembo cene zavrne. Zneski in cena, ki jo je uporabnik uredil, niso predstavljeni kot nespremenjena cena iz cenika.
- Znana stara opozorila samodejne povezave se ob obeh potrjenih povezavah v trenutnem okolju ne prikazujejo kot nova naloga. Trenutna neskladja, neznani izidi CREATE in nepovezane napake ostanejo vidni; shranjenih napak ne brišemo.

## Varnost in poslovne varovalke

Vse obstoječe strežniške kontrole ostajajo: vloga/organizacija, sprejem primera, lokalni in oddaljeni prstni odtis stranke/vozila, okolje Quibi, sveža politika cenika, enote/DDV, količine/popusti, zneski in vsebina dokumenta, expectedSha in expectedSourceSha, WRITE/SEND ter atomarni dnevnik proti dvojnemu ustvarjanju/pošiljanju.

Klik »Potrdi in ustvari« je izrecna potrditev pregledanega zahtevka; v obstoječo akcijo prenese zahtevani potrditvi in nespremenjeni pregledani FormData/SHA. Sprememba postavke prekliče pregled. Neznan izid nikoli ne odklene ponovnega CREATE; osvežitev ponovno naloži dnevnik in omogoči varen pregled obstoječega poskusa. Ročno urejena cena je strogo validirana na strežniku; pri nepričakovani cenovni spremembi ali spremenjenem SHA CREATE ne uspe.

Napredna ročna povezava ohranja obstoječi izrecni gumb priprave, kadar kanonični zapis še ne obstaja. Samodejna varnostna presoja je zavrnila dodatno avtomatsko pripravo ob ročni povezavi zaradi možnosti spremembe poslovnega zapisa. Uporabljen je varnejši obstoječi izrecni korak; običajni urejevalnik zaradi tega nima dodatnega gumba ali potrditve.

Brez novih migracij, auth/RLS sprememb, odvisnosti, produkcijske objave ali omogočanja WRITE/SEND.

## Preverjanje

- 88 ciljnih testov: urejevalnik, dodeljeni ceniki, več postavk, ročne cene, zneski, zavrnitve zalogovnih sprememb, sveži prstni odtisi, potek in obstoječe CREATE/SEND varovalke, konkurenca in neznani izidi. Rezultat končnega zagona je v validation-results.json.
- Hidriran dejanski EstimatePreparationWorkspace pri 1440/390/350 px: en običajni obrazec, nobena ponovljena checkbox potrditev, ročni ID zaprt, izrecen predogled, prenesena cena/količina, sprememba cene in skupnega zneska, enkratna kanonična priprava, ohranitev popravkov med pregledom/urejanjem, izrecna fixture CREATE pot samo enkrat, varna osvežitev po zavrnitvi, brez prelivanja in JS napak. [Rezultati](browser-results.json).
- Sintetični akcijski fixture za CREATE vrne zavrnitev; ne prikazuje izmišljenega uspešnega dokumenta. Noben pravi Quibi ali DB ni uporabljen v tem brskalniškem testu.
- TypeScript in ciljni ESLint; neodvisni pregled. Popravljene najdbe: izračun ob izbiri drugega cenika istega artikla, varna pot po neuspešnem CREATE in obsolete page prop.
- Prejšnji celotni 525/42 nista ponovno izvajana; ciljni nabor je izbran zaradi spremenjenih cen in prikaza.

Ponovljivi ukazi:

```powershell
node scripts/qa-estimate-workspace.mjs
node --experimental-strip-types --conditions=react-server --import ./scripts/contact-test-register.mjs --test src/lib/quibi/estimate-editor.test.ts src/lib/quibi/estimate-catalog-lines.test.ts src/lib/quibi/estimate-catalog.test.ts src/lib/quibi/customer-catalog-pricing.test.ts src/lib/quibi/estimate-preparation.test.ts src/lib/quibi/write-workflow.test.ts src/lib/quibi/write-contract.test.ts src/lib/cases/identity-notice.test.ts src/lib/cases/journey.test.ts src/lib/cases/next-step.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

## Dejanska prijavljena aplikacija: točna meja

Uporabnik je prijavljen v vgrajenem brskalniku na pravilnem DEV Previewu. Krmilnik vgrajenega brskalnika pa pri getState vrne `failed to write kernel assets: The system cannot find the path specified`, tudi po ponastavitvi. Zato ta agent njegove obstoječe prijavljene seje ni mogel odpreti ali upravljati. Ločeni Playwright kontekst nima uporabnikove seje. To ni dokaz manjkajočih pravic uporabnika in ne zahteva novih poverilnic v klepetu.

Prijavljeni gostovani pregled priprave in celoten poslovni E2E ostajata **NEPREVERJENA**. Izoliran test zgoraj ju ne nadomešča. Potreben je delujoč dostop krmilnika do obstoječe prijavljene testne seje oziroma ločena dovoljena testna seja. Za dejanski zapis še vedno veljajo ločena dovoljenja WRITE/SEND, ki niso bila omogočena. Razvoj se zaradi tega ni ustavil in dodatne testne infrastrukture nismo uvajali.

## Posnetki

Posnetki so dejanske hidrirane komponente s sintetičnimi podatki in akcijskimi fixtures, ne fotografije uporabnikove prijavljene seje:

- [Urejevalnik 1440](editor-1440.png), [390](editor-390.png), [350](editor-350.png).
- [Pregled 1440](review-1440.png), [390](review-390.png), [350](review-350.png).

## Poti in uporabljene veščine

Projektni koren: `C:\Users\Admin\.codex\worktrees\selan-p0-guided-case\m3-m4-ci-db-tests-v1`.

Spremenjene poti pod korenom: `src\app\dashboard\primeri\[serviceRequestId]\page.tsx`; `src\components\dashboard\EstimateComposer.tsx`, `EstimatePreparationWorkspace.tsx`, `QuibiDevWritePanel.tsx`, `AutomaticIntakeSync.tsx`; `src\lib\quibi\estimate-editor.ts`, `estimate-editor.test.ts`, `estimate-catalog.ts`, `estimate-catalog.test.ts`, `estimate-catalog-source.ts`, `estimate-catalog-lines.test.ts`, `dev-write-actions.ts`; `src\lib\cases\identity-notice.ts`, `identity-notice.test.ts`, `next-step.ts`; `scripts\qa-estimate-workspace.mjs`; navodila in ta imenik dokazov.

Prebrano: projektni `AGENTS.md`, `CLAUDE.md`, obstoječi obrazci za pripravo/ročno povezavo, `src\lib\offer-preparation\actions.ts`, `constants.ts`, `src\lib\quibi\workflow-context.ts`, `customer-catalog-pricing.ts`, `estimate-preparation.ts`, `write-workflow.ts`, `write-options.ts` in povezani testi. Lokalni Next vodiči v istem korenu `node_modules\next\dist\docs\01-app\02-guides\forms.md`, `index.md`, `01-app\03-api-reference\01-directives\use-client.md`.

Globalna pravila: `C:\Users\Admin\.ai-os\ORCHESTRATION_GUIDE.md`. Uporabljene veščine v `C:\Users\Admin\.agents\skills\`: `ai-orchestrator\SKILL.md`, `superpowers\systematic-debugging\SKILL.md`, `superpowers\brainstorming\SKILL.md` (izrecna uporabnikova zasnova), `superpowers\dispatching-parallel-agents\SKILL.md`, `superpowers\test-driven-development\SKILL.md`, `superpowers\verification-before-completion\SKILL.md`, `security-review\SKILL.md`. Prebrana tudi `playwright-interactive\SKILL.md`; uporabljene smernice QA z že nameščenim Playwrightom, brez spremembe sandboxa ali namestitev. React pregled: `C:\Users\Admin\.codex\plugins\cache\openai-curated-remote\vercel\0.54.1\skills\react-best-practices\SKILL.md`.

**Safe to keep:** da kot Draft z navedenimi omejitvami; ne kot potrjen celoten poslovni E2E ali dovoljenje za merge.

Dodatno pregledan pogoj obstoječe registracije dokumenta: `C:\Users\Admin\.codex\worktrees\selan-p0-guided-case\m3-m4-ci-db-tests-v1\supabase\migrations\20260928175615_20260927085839_manual_quibi_estimate_v1.sql` (samo branje). Za posodobitev istega DEV Previewa uporabljeni že prebrani veščini `C:\Users\Admin\.codex\plugins\cache\openai-curated-remote\vercel\0.54.1\skills\deployments-cicd\SKILL.md` in `C:\Users\Admin\.codex\plugins\cache\openai-curated-remote\vercel\0.54.1\skills\env-vars\SKILL.md`. WRITE/SEND in intake sync ostanejo izrecno izključeni na ravni te objave.
