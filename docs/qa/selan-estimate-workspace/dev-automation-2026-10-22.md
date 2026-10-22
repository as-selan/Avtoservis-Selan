> Zgodovinska faza preverjanja. [Aktualna resnična veriga predračun → nalog → račun in Quibi blokade](quibi-business-2026-10-22.md).

# PR #19 – dejanska Quibi DEV avtomatizacija

## Dejanski rezultat

- **CREATE izveden v Quibi DEV:** dokument **2176924**, stanje integracijskega dnevnika `verified`.
- **Samodejna povezava izvedena:** sintetični primer `d726b5b3-8a49-4c6f-a857-202610220019`, lokalni predračun `de58d894-532f-409e-aefe-486c377e974e`. Quibi ID je vrnil API in je bil ponovno prebran, ne ročno vnesen.
- **Testni SEND:** vrnjen `send_id=277127`, začetno stanje `queued`, poznejši Quibi status **`failed`**. Quibi je vrnil razlog **Connection timed out**. Dostava ni potrjena in ni bilo ponovnega SEND. Končno preverjanje je v [JSON poročilu](dev-create-result.json).
- Preizkus je uporabil že obstoječo sintetično stranko `TEST-AUTOSERVIS-SELAN-153D7E1` in sintetično vozilo. Pravi primer F93CFB37 ni bil spremenjen.
- Uporabljena je resnična obstoječa Quibi cenikovna postavka za premontažo pnevmatik, s svežo ceno iz Quibija. Ta postavka je samo predmet sintetičnega integracijskega testa in **ni nadomestilo za zahtevane storitve F93CFB37**.
- Preizkus je tekel kot izrecno odobren strežniški korak v Vercel Preview projektu `prj_OSpIMwU9zkrcImKhGxpaq8PnrgUU`, ekipa `azalar7-langs-projects`. Uporablja obstoječe poslovne funkcije, trajni dnevnik, preverjanje vsebine in registracijski RPC. To ni prijavljeni brskalniški E2E in ne dokazuje klika po celotnem uporabniškem postopku.

## Kaj zdaj dela urejevalnik

Vsaka zahteva ostane vidna. Obstoječi AI provider prejme posamezne zahteve in Quibi identitete brez cen. Rezultat se preveri glede na izvirno zahtevo in dovoljene ključe. Jasno ujemanje se izpolni, pri negotovem so v isti vrstici največ trije predlogi za izbiro z enim klikom. Vse cene, DDV in popusti ostajajo v preverjanju Quibija. Uporabnik pregleda en predračun in nato izvede glavno dejanje »Ustvari predračun«; AI nikoli ne odobri ustvarjanja ali pošiljanja.

Brez AI ostanejo točna ujemanja, omejene sopomenke (npr. kontrola/pregled) in jasno enolično ujemanje tipkarske napake (npr. PREGELD ZAVOR). Splošni servis se ne razširi v izmišljeno menjavo delov. Nejasna količina časovne storitve ostane za dopolnitev.

## Dejanski blokadi za F93CFB37

1. **Quibi DEV `GET /api2/sifranti` vrača HTTP 500.** Dostopni `GET /api2/cenik` vsebuje samo postavko `189:116731` za premontažo pnevmatik. Zato nobene od treh zahtevanih storitev ni mogoče potrjeno povezati z dostopnim katalogom. Vse tri ostanejo vidne, brez izmišljene storitve ali cene. Potrebna je odprava Quibi DEV napake oziroma dostopen ustrezen katalog.
2. **V projektu manjka `OPENAI_API_KEY`.** Obstaja le `SELAN_AI_MODEL` za Preview. AI povezava je implementirana in preverjena s sintetičnimi odgovori, dejanski model pa ni bil klican. Ključ naj se nastavi kot občutljiva strežniška spremenljivka za Preview; ne v klepet ali repozitorij.

Quibi dejansko vrne 16 vrst prodaje in dve skladišči. Za integracijski preizkus sta izrecno izbrani in v živem katalogu preverjeni oznaki »Dobava blaga in storitev« in »Delavnica«. To ni nova globalna privzeta nastavitev za uporabniške dokumente. V aplikaciji se enolična izbira uporabi samodejno; dvoumne nastavitve se ne ugibajo.

## Preverjanje in varnost

- 46 testov AI ujemanja, cen in zaščite CREATE/SEND; TypeScript in ESLint brez napak.
- Hidratirani UI s sintetičnimi AI odgovori pri 1440, 390 in 350 px: ohranjene zahteve, jasno izpolnjena postavka, nejasna postavka izbrana z enim klikom, brez ponovljenih checkboxov, brez JS napak ali vodoravnega prelivanja. Posnetki `ai-service-*.png` so **sintetični UI**, ne dejanski prijavljeni zasloni.
- Nadzor uporabnikove prijavljene IAB seje ni deloval: `failed to write kernel assets (os error 3)`. Ločena avtomatizirana seja nima uporabnikove prijave. Prijavljeni brskalniški E2E ostaja nepreverjen.
- Celotne okoljske skrivnosti niso bile prenesene v lokalne datoteke. Posamična občutljiva Quibi nastavitev ni berljiva prek Vercel API-ja; dejanski preizkus zato uporablja že obstoječe skrivnosti izključno znotraj Vercela.
- Samodejni varnostni pregled je zavrnil lokalni zagon skripta s CREATE/SEND. Lokalni zagon ni bil izveden; uporabljeno je samo odobreno Vercel DEV izvajanje. Statično preverjanje sintakse je bilo dovoljeno.
- Produkcijske zastavice ostajajo izključene. Ni merge, produkcijske objave ali pošiljanja dejanskim strankam. Projektni build ukaz ostaja `npm run build -- --webpack`; testni ukaz je bil samo nastavitev posamezne Preview objave.

## Prebrane smernice in pomembne datoteke

Projektna osnova: `C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1/`.

- `AGENTS.md`, `CLAUDE.md`, `node_modules/next/dist/docs/01-app/02-guides/forms.md`
- `C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md`
- `C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md`
- `C:/Users/Admin/.agents/skills/superpowers/brainstorming/SKILL.md` (uporabnik je že določil in odobril smer izvedbe)
- `C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md`
- `C:/Users/Admin/.agents/skills/security-review/SKILL.md`
- `C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/vercel/0.54.1/skills/env-vars/SKILL.md`
- `src/lib/assistance/intake-analysis.ts`, `openai-intake-provider.ts`, `configured-intake-provider.ts`
- `src/lib/quibi/estimate-editor.ts`, `estimate-catalog.ts`, `estimate-catalog-source.ts`, `customer-catalog-pricing.ts`, `workflow-context.ts`, `write-workflow.ts`, `write-contract.ts`, `write-http.ts`, `write-journal.ts`, `manual-estimate-action.ts`, `contracts.ts`
- `src/components/dashboard/EstimateComposer.tsx`, `QuibiDevWritePanel.tsx`, `src/app/dashboard/primeri/[serviceRequestId]/page.tsx`
- `scripts/quibi-dev-approved-smoke.mjs`, `scripts/qa-estimate-workspace.mjs`, `scripts/contact-test-loader.mjs`
- `src/lib/assistance/provider.ts` je bil preverjen, vendar ne obstaja; uporabljena sta obstoječa konfigurirani in OpenAI provider.

Dokumentacija preverjenega Quibi endpointa: [uradna API navodila](https://navodila.quibi.net/za-razvijalce/). Napaka HTTP 500 je meritev odobrenega DEV preizkusa, ne trditev dokumentacije.

## Končni DEV naslov

[Odpri DEV](https://selan-dev-pr19-azalar7-langs-projects.vercel.app/dashboard) · [odpri sintetični primer z dejanskim dokumentom #2176924](https://selan-dev-pr19-azalar7-langs-projects.vercel.app/dashboard/primeri/d726b5b3-8a49-4c6f-a857-202610220019).

Izvedbena koda: `469e851`, Ready Preview `dpl_CUAea5GC1jfRWncakDpsHoaqiixb`. Kasnejša sprememba navodil in dokazil ne spremeni izvedbene kode. DEV WRITE je omogočen, DEV SEND je omejen na obstoječe dovoljene testne naslove. To ne pomeni uspešne dostave: test 277127 je failed. Produkcijski WRITE/SEND in lokalne izjeme ostajajo izključeni.
