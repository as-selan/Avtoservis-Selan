# Nadaljevanje P0: dnevno delo, kontekst primera in mehanik

## Rezultat in meja dokaza

To nadaljevanje PR #19 poenostavi obstoječe zaslone in ohrani obstoječa poslovna dejanja. **Celotni prijavljeni poslovni E2E ostaja NEPREVERJEN. P0 še ni potrjeno zaključen.**

Tadej se je izgubil, ker so bili podatki in obrazci raztreseni, naslednji korak ni odpiral vedno pravega razdelka, dnevna nadzorna plošča pa je ponavljala iste primere v več pregledih. Mehaniku je povzetek kazal tudi poslovna navodila, ki ne sodijo v njegovo vlogo.

| Prej | Zdaj |
| --- | --- |
| Stranka, vozilo in želja so lahko v zaprtem razdelku | Kratek povzetek in manjkajoči podatki ostanejo na vrhu |
| Ob osvežitvi ostane star zaznamek; premik obrazca lahko izgubi vnos | Sprememba opravila pokaže naslednji obstoječi obrazec; isti obrazci ohranijo vnos in fokus med tipkanjem |
| Pregled/pošiljanje predračuna vodi na pripravo | Povezava odpre pregled/pošiljanje; objavljena končna cena ima svoj obstoječi cilj |
| Več sočasnih seznamov in nejasen vpliv obdobja | Ena glavna vrsta »Dnevno delo«, zgodovina in obdobje v podrobnostih |
| Mehanik vidi poslovni naslednji korak; fotografija je za dolgo zgodovino | Navodilo temelji na stanju njegove naloge; opomba in fotografija sta skupaj pred zgodovino |

Realtime ostaja v obstoječem layoutu. Quibi READ/PREPARE/CREATE/SEND, identiteta, finančne potrditve, zaščite pred podvajanjem, avtorizacija in strežniška dejanja niso spremenjeni. Novih migracij, odvisnosti ali okoljskih nastavitev ni. WRITE/SEND nista bila omogočena.

## Novo preverjanje

- **26/26 ciljnih testov uspešnih** za vrsto nadzorne plošče, faze in vrstni red opravil. Novi regresijski primeri pokrivajo prave cilje, prioriteto, popravilo in objavljeno končno ceno.
- **Hidrirane dejanske React komponente pri 1440, 390 in 350 px**: viden povzetek in CTA; pet sprememb sintetičnega bralnega stanja na širino (tudi nov korak na istem sidru); ohranjen nedokončan vnos in fokus; vloga mehanika brez poslovnih navodil; brez vodoravnega prelivanja ali napak JavaScript. [Strojni rezultati](browser-results.json).
- Regresijski brskalniški test je pred popravkom dejansko zaznal izbris vnosa in nato izgubo fokusa. Po ohranitvi iste vrste/ključa razdelka in obnovi povezanega urejevalnika so vsi novi pregledi uspešni.
- Ciljni ESLint uspešen; TypeScript preverjen. Neodvisni pregled: napačna pot objavljene cene popravljena, brez preostalih ugotovljenih P1/P2 v pregledanem obsegu.
- Prejšnjih 525 lokalnih testov in 42 izoliranih scenarijev nismo ponovno izvajali. Njihovi rezultati v nadrejenem poročilu veljajo za prejšnji commit `7f19350`, ne predstavljajo novega polnega zagona.

Ponovitev novih pregledov:

```powershell
node --experimental-strip-types --conditions=react-server --import ./scripts/contact-test-register.mjs --test src/lib/dashboard/intake-queue.test.ts src/lib/cases/journey.test.ts src/lib/cases/workspace.test.ts
node scripts/qa-p0-followup.mjs
npx tsc --noEmit --incremental false
```

Skript novega UI preizkusa sestavi dejanske komponente z že nameščenim Webpackom in jih zažene v Chromu. `applySyntheticSnapshot` zamenja samo bralni prikaz; ne predstavlja uspešne poslovne akcije. Ni baze, prijave, ustvarjenega dokumenta, pošiljanja, nalaganja fotografije ali odobritve. Mehanikov posnetek prikazuje povzetek, ne celotne prijavljene strani naloga.

## Gostovane različice in blokada

- Preverjena starejša DEV osnova: `codex/selan-pr18-manual-qa`, `a9bc369`, deployment `dpl_CSfrqtLseD1BXr7wvkbWx3AZeP2q`. Odpiranje `/dashboard` preusmeri na prijavo aplikacije; to je zajeto v obstoječem REA dokazu nadrejenega poročila.
- PR #19 je imel uspešen Vercel deployment pri `7f19350`, v projektu/ekipi **avtoservis-selan**, ne v starejšem projektu **avtoservis-selan-dev**. [Preview veje](https://avtoservis-selan-git-codex-selan-p0-gui-4e4d87-avtoservis-selan.vercel.app).
- Dejansko odpiranje novega Previewa z brskalnikom preusmeri na **Login – Vercel**, še pred aplikacijo. [Posnetek resnične blokade dostopa](preview-access-blocked.png). Vercel MCP za to ekipo vrne 403; obstoječa CLI prijava ekipe ne doseže. Zaščita objave ni bila spreminjana. Nov REA zajem te zaščitene strani se ni zaključil in ni uporabljen kot dokaz; blokada je neposredno opažena s Playwrightom.
- Docker Desktop Linux engine ni dosegljiv; lokalni Supabase ne teče. Povezani Supabase ima en sam projekt in nobene obstoječe izolirane veje; vanj nismo pisali sintetičnih ali poslovnih podatkov.
- Zato **ne moremo zagotoviti javno dostopnega Previewa, posnetkov prijavljenih novih strani, potrditi dejanskih zastavic nove gostovane aplikacije ali izvesti celotnega E2E**. Potreben je dostop upravičenega uporabnika Vercel in izolirana testna seja/baza. Produkcijskih nastavitev in podatkov nismo uporabili za obvoz.

## Poslovni koraki: kaj je dokazano

| Korak | Dokaz tega nadaljevanja |
| --- | --- |
| Spletno povpraševanje → baza → dnevna vrsta | NEPREVERJENO v prijavljeni aplikaciji |
| Odpiranje in prikaz konteksta/aktivnega opravila | Preverjen hidriran UI s sintetičnimi vhodi; prava baza NEPREVERJENA |
| Sprejem, identiteta stranke/vozila, Quibi READ | Obstoječe akcije ohranjene; dejanski novi E2E NEPREVERJEN |
| PREPARE, pregled, CREATE in SEND predračuna | Usmerjanje/formularji ohranjeni; noben dejanski dokument ustvarjen ali poslan |
| Zapis dejanskega odgovora, CREATE naloga, popravilo, račun, zaključek | NEPREVERJENO; WRITE/SEND nista bila omogočena |
| Fotografija/opomba mehanika | Vstopni mesti prestavljeni; dejansko shranjevanje/nalaganje NEPREVERJENO |

Novega videa celotnega postopka ni: brez varnega izoliranega okolja bi prikazoval simulacijo. Obstoječi kratki video ostaja izrecno označen kot ločena sintetična UX stanja.

## Posnetki in navodila

Spodnji posnetki so **dejanske hidrirane komponente s sintetičnimi podatki**, ne prijavljena gostovana aplikacija:

- Primer: [1440 px](case-1440.png), [390 px](case-390.png), [350 px](case-350.png).
- Povzetek naloge mehanika: [1440 px](mechanic-1440.png), [390 px](mechanic-390.png), [350 px](mechanic-350.png).
- [Navodila za Tadeja](../../../tadej-p0-postopek.md).

## Spremenjene in pregledane poti, pravila in veščine

Koren vseh spodnjih projektnih poti je `C:\Users\Admin\.codex\worktrees\selan-p0-guided-case\m3-m4-ci-db-tests-v1`:

- `src\app\dashboard\primeri\[serviceRequestId]\page.tsx`
- `src\components\dashboard\CaseOverview.tsx`, `CaseWorkspace.tsx`, `CaseAnchorNavigation.tsx`, `DashboardPageClient.tsx`, `CaseWorkPanel.tsx`, `CaseWorkSummary.tsx`, `CaseWorkForms.tsx`
- `src\lib\cases\navigation.ts`, `src\lib\dashboard\intake-queue.ts`, `intake-queue.test.ts`, `adapt-dashboard.ts`, `types.ts`
- `scripts\qa-p0-followup.mjs`, `docs\tadej-p0-postopek.md`, ta imenik dokazov.

Dodatno pregledani obstoječi loaderji in pravila v `src\lib\dashboard\load-dashboard-snapshot.ts`, `src\lib\case-work\`, `src\lib\quibi\deployment-policy.ts`, `write-contract.ts`, `workflow-config.ts`, `src\app\dashboard\layout.tsx`, `mehanik\page.tsx`, `mehanik\[orderId]\page.tsx`, obstoječi Quibi obrazci in akcije ter `next.config.ts`. Avtorizacija, migracije in Realtime so bili samo pregledani.

Prebrana pravila: projektna `AGENTS.md` in `CLAUDE.md` v zgornjem korenu ter `C:\Users\Admin\.ai-os\ORCHESTRATION_GUIDE.md`. Lokalni Next vodiči iz `C:\Users\Admin\.codex\worktrees\selan-pr18-manual-qa\m3-m4-ci-db-tests-v1\node_modules\next\dist\docs\`: `01-app\02-guides\forms.md`, `01-app\03-api-reference\02-components\link.md`, `01-app\03-api-reference\01-directives\use-client.md`.

Uporabljene veščine iz `C:\Users\Admin\.agents\skills\`: `ai-orchestrator\SKILL.md`, `superpowers\systematic-debugging\SKILL.md`, `superpowers\dispatching-parallel-agents\SKILL.md`, `superpowers\test-driven-development\SKILL.md`, `superpowers\brainstorming\SKILL.md`, `superpowers\requesting-code-review\SKILL.md`, `superpowers\verification-before-completion\SKILL.md`. Predhodno uporabljene veščine in njihove točne poti so v nadrejenem poročilu. Dodatno prebrani: `C:\Users\Admin\.codex\plugins\cache\openai-curated-remote\vercel\0.54.1\skills\deployments-cicd\SKILL.md` in `C:\Users\Admin\.codex\plugins\cache\openai-curated-remote\supabase\1.0.0\skills\supabase\SKILL.md`.

**Safe to keep:** da kot Draft za pregled; ne kot dokaz zaključenega P0 ali dovoljenje za merge/produkcijsko objavo.
