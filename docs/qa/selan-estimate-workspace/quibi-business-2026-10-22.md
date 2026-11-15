# Quibi DEV – katalog, delovni nalog in račun, PR #19

## Kaj dejansko deluje

Na obstoječem sintetičnem primeru `d726b5b3-8a49-4c6f-a857-202610220019` je prek pravih Quibi DEV klicev preverjena veriga:

| Dokument | Quibi ID | Številka | Znesek | Dnevnik |
| --- | --- | --- | --- | --- |
| Predračun | 2176924 | 279/2026 | 45,99 EUR | verified |
| Delovni nalog | 2176925 | 269/2026 | 45,99 EUR | verified |
| Račun | 2176926 | DELAVNICA-A-26000259 | 45,99 EUR | verified |

Nalog in račun sta res ustvarjena, ne simulirana odgovora. Postavke, enote, DDV, popust in znesek so preneseni iz preverjenega predračuna oziroma naloga, ponovno prebrani in primerjani. Izvedeni so obstoječi poslovni workflow, dokumentni seznam, branje posameznega dokumenta in PDF korak. Trajni dnevnik povezuje dokumente z istim primerom; zapis vsebuje ID in SHA izvora. Ponovno preverjanje ne ustvari novega dokumenta.

Račun uporablja izrecno testno izbrano negotovinsko možnost **Bančno nakazilo** iz svežega Quibi šifranta in edini poslovni prostor **DELAVNICA, ID 67**. Ta testna izbira ni uvedena kot univerzalna privzeta nastavitev uporabniških računov. Račun ni označen kot plačan in ni poslan.

To je **strežniški DEV integracijski preizkus** obstoječih poslovnih funkcij z izrecno označeno QA simulacijo. Ni dokaz prijavljenega uporabniškega E2E. Ni bila vpisana resnična odobritev stranke ali trditev o dejanskem popravilu; opomba dokumentov izrecno označuje sintetični namen. Poslovna preverjanja za običajne uporabnike ostajajo nespremenjena. Pravi primer F93CFB37 ni spremenjen.

## Katalog – dejansko izolirana napaka

Dokumentacija potrjuje `GET /api2/sifranti`, avtentikacijo z glavama username/password in JSON Content-Type. Klic brez telesa in ista zahteva z dodanim Accept application/json oba vrneta **HTTP 500, 0 bajtov**, brez JSON napake ali korelacijskega ID. Odgovor je vrnil Quibi nginx po približno eni sekundi; to ni Selanov parser ali brskalniški CORS. Kontrolni klici `/api2/cenik`, `/api2/sifranti/view/116731` in `/api2/kategorije` z istimi poverilnicami vrnejo 200.

To kaže na napako oziroma neobravnavano stanje v Quibi DEV namestitvi poti za seznam. Natančne PHP/upstream napake brez Quibijevih dnevnikov ni mogoče določiti. Ne trdimo, da poznamo njihov notranji vzrok.

Preverjene dokumentirane alternative:

- `/api2/cenik`: deluje, vendar vrne samo cenik 189 VULAKNIZERSTVO z eno postavko za premontažo pnevmatik. Aplikacija lahko prebere njeno aktualno ceno.
- `/api2/sifranti/view/:id`: deluje za poznani ID in potrdi posamezni artikel; ne odkrije vseh servisnih postavk.
- `/api2/kategorije`: deluje, vendar kategorije niso popoln seznam artiklov ali cen.
- `/api2/sifranti/trenutnazaloga/:warehouse/0`: za skladišči 49 in 626 vrne 403. Tudi zaloga ne bi bila popoln katalog nezalogovnih storitev.
- Dokumenti in servisna zgodovina so zgodovinski oziroma delni podatki; niso popoln aktualni katalog in niso uporabljeni za izmišljanje trenutnih cen.

V pregledani [uradni dokumentaciji Quibi](https://navodila.quibi.net/za-razvijalce/) ni druge dokumentirane metode za celoten katalog. Za F93CFB37 zato ohranimo tri zahteve brez napačne nadomestne postavke ali izmišljene cene. Odprava seznama oziroma potrjena alternativna metoda je preostali pogoj za polno samodejno polnjenje servisov. Delo se nadaljuje **brez AI ključa**, kot je naročil uporabnik.

[Pripravljeno kratko sporočilo razvijalcu Quibi](quibi-developer-message.md) vsebuje metodo, čase UTC, kontrole, status, dolžino in hash odgovora. Sporočilo ni bilo poslano.

## Obstoječe pošiljanje 277127

Ponovno branje za dokument 2176924 še vedno vrne **failed**, razlog **Connection timed out**. Statusni HTTP klic uspe. To je napaka Quibijevega opravila pošiljanja po sprejemu v vrsto, ne dokaz časovne prekinitve prvotnega HTTP zahtevka Selan → Quibi. Natančen DNS/SMTP/worker vzrok mora potrditi Quibi. Noben nov SEND, ponovitev pošiljanja ali sporočilo dejanski stranki ni bilo izvedeno. Dosegljivost testnega prejemnikovega nabiralnika ni potrjena.

## Tadejev prikaz

V obstoječem obrazcu so vidni pripravljene postavke, cene, skupaj in glavni gumb **Ustvari delovni nalog** oziroma **Izdaj račun**. Operacija, vrsta dokumenta, številčenje, izvor in SHA so v podrobnostih. Ko je priprava preverjena, ni drugega sočasnega gumba za ponovno pripravo. Edini poslovni prostor se prevzame samodejno. Resnična potrditev opravljenega dela, datumi in izbira dvoumnega načina plačila ostanejo poslovni pogoji; niso samodejno izmišljeni ali potrjeni. Ni novih checkboxov ali novih obrazcev.

Posnetki `business-work-order-1440.png`, `business-work-order-390.png`, `business-work-order-350.png` so **hidratirane dejanske komponente s sintetičnim READ/CREATE odgovorom**, ne posnetki uporabnikove prijavljene seje. UI fixture ne ustvarja dokumenta; zgornji resnični dokumenti so ločeno potrjeni v Vercel DEV.

## Preverjanje in omejitve

- 27 ciljnih testov poslovnega prenosa, cen, identitete, DDV, datuma, glave računa in zaščite pred podvajanjem uspešnih.
- TypeScript in ESLint uspešna. Brskalniški preizkus pri 1440/390/350 px: pripravljen nalog, en glavni gumb, tehnične izbire zložene, brez novega checkboxa, brez vodoravnega prelivanja ali JS napak. Fixture dispatch največ enkrat in brez simuliranega uspeha.
- Vsa dejanska Quibi opravila so izvedena samo v obstoječem projektu avtoservis-selan-dev, ekipa azalar7-langs-projects, na dev.quibi.net. Skrivnosti niso lokalno prenesene. Brez novih odvisnosti, auth sprememb, migracij, RLS, merge ali produkcijske objave.
- Dostop do uporabnikove prijavljene IAB seje ostaja neoperativen za agenta; celotni prijavljeni poslovni E2E je nepreverjen. To ni trditev o uporabnikovih pravicah.

## Datoteke in uporabljene smernice

Projektna osnova: `C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1/`.

Spremenjeno: `src/components/dashboard/QuibiBusinessDocumentForm.tsx`, `scripts/quibi-dev-approved-smoke.mjs`, `scripts/qa-estimate-workspace.mjs` ter dokazila in navodila v `docs/`.

Prebrano: `AGENTS.md`, `CLAUDE.md`, `node_modules/next/dist/docs/01-app/02-guides/forms.md`, `src/lib/quibi/business-document-workflow.ts`, `business-source-lines.ts`, `business-document-actions.ts`, `business-form-state.ts`, `invoice-header.ts`, `invoice-review.ts`, `document-read.ts`, `write-http.ts`, `scripts/manual-qa/quibi-dev-read-support.md`.

Uporabljene smernice:

- `C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md`
- `C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md`
- `C:/Users/Admin/.agents/skills/superpowers/systematic-debugging/SKILL.md`
- `C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md`
- `C:/Users/Admin/.agents/skills/security-review/SKILL.md`
- `C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/vercel/0.54.1/skills/deployments-cicd/SKILL.md`
- `C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md`

## Končna objava in dokazi

[DEV aplikacija](https://selan-dev-pr19-azalar7-langs-projects.vercel.app/dashboard) · [sintetični primer](https://selan-dev-pr19-azalar7-langs-projects.vercel.app/dashboard/primeri/d726b5b3-8a49-4c6f-a857-202610220019).

- [Delovni nalog #2176925](https://selan-dev-pr19-azalar7-langs-projects.vercel.app/dashboard/stranke/dfa5f6bf-586d-4dd7-867f-219fd1cef7ad/quibi/dokumenti/work_order/2176925)
- [Račun #2176926](https://selan-dev-pr19-azalar7-langs-projects.vercel.app/dashboard/stranke/dfa5f6bf-586d-4dd7-867f-219fd1cef7ad/quibi/dokumenti/invoice/2176926)
- [Izmerjeni katalog in alternative](quibi-catalog-result.json)
- [Ponovno preverjena veriga in SEND status](quibi-business-result.json)
- [Mobilni prikaz ene glavne akcije](business-work-order-390.png)

Ready Preview: `dpl_5SNfKs15ZZs2KiQkiXGHCSND3Auc`, izvedbena koda `9fba38c`. Končna objava je izvedla samo ponovno branje že ustvarjene verige in statusa. Kasnejši commit dopolni samo dokazila in navodila.
