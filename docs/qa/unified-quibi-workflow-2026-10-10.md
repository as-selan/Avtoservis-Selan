# Enoten Quibi workflow — QA 2026-10-10

## Izhodišče in rezultat
Repo as-selan/Avtoservis-Selan, veja codex/selan-pr18-manual-qa. Lokalni in sveže pridobljeni oddaljeni izhodiščni HEAD: b6f4d3955af94e3974dabcbe64020c02d6943e57.

Vzrok razdrobljenega postopka: ustvarjanje, ročno povezovanje, DEV test send in ročna evidenca so imeli ločene uporabniške poti. Quibi status ni samodejno napredoval v lokalno evidenco. Produkcijski transport, ločen journal in vezava povezav na okolje niso obstajali.

Selan zdaj prikazuje postavke/znesek/prejemnika in enoten potrditveni obrazec. Neodobren dokument uporablja »Odobri in pošlji stranki«, odobren dokument »Pošlji stranki«. Pošiljanje ne ustvari novega dokumenta. Backend pred dispatchom ponovno preveri pravice, zadnjo različico, odobritev, primer, stranko, vozilo, dejanski email in content SHA. Manjkajoča API identifikacija vozila/primera zahteva evidentiran ročni dokaz. Napačna API identifikacija se zavrne.

En immutable send journal na quote, atomski claim, brez avtomatskega resend ob timeoutu. Status-only polling shrani send_id/status; production sent samodejno ustvari dokaz predaje poštnemu strežniku. DEV pošlje samo na konfiguriran testni naslov in ne ustvari dostave stranki. Zunanja ročna dostava je ločena razširljiva možnost, nikoli simulacija API dostave.

## Spremenjene datoteke
- UI: src/app/dashboard/primeri/[serviceRequestId]/page.tsx; src/app/dashboard/stranke/[customerId]/quibi/page.tsx; src/components/dashboard/QuibiEstimateWorkflowPanel.tsx; ManualEstimateHandoff.tsx; QuibiDevWritePanel.tsx; src/lib/cases/next-step.ts.
- Backend: src/lib/quibi/unified-actions.ts; unified-workflow.ts; workflow-context.ts; workflow-config.ts; actions.ts; client.ts; dev-write-actions.ts; manual-estimate-action.ts; party-write-actions.ts; write-client.ts; write-http.ts; write-journal.ts; write-options.ts.
- Testi: src/lib/quibi/unified-workflow.test.ts; workflow-config.test.ts; supabase/tests/unified_quibi_workflow_regression.sql; scripts/qa-unified-ui-fixture.mjs; scripts/qa-unified-ui-check.mjs.
- Migracija: supabase/migrations/20261010120000_unified_quibi_workflow.sql.
- Dokumentacija: ta zapis in docs/superpowers/plans/2026-10-10-unified-quibi-workflow.md.

## Verifikacija
- RED pred implementacijo: novi testi niso mogli uvoziti še neobstoječega workflow modula.
- Unit/regresije: 124/124 PASS, nič skipped. Ukaz: node --import ./scripts/contact-test-register.mjs --experimental-strip-types --test (vse src/lib/**/*.test.ts, seznam iz rg).
- TypeScript: npx --no-install tsc --noEmit — PASS.
- Lint: npm run lint — PASS.
- Produkcijski build: next build --webpack v izolirani kopiji dejanske kode — PASS (exit 0), tudi po zadnjem popravku produkcijske opombe. Vseh 175 izvornih datotek kopije se ujema z delovnim drevesom; brez UI mockov. Opozorilo o več lockfile datotekah izhaja iz izolirane kopije. Uporabljena samo obstoječa javna lokalna Supabase URL/anon konfiguracija v child procesu, brez spremembe okolja/projektov.
- SQL: nova migracija in regresija PASS v začasni lokalni bazi selan_unified_qa_20261010. Kopirana samo schema, brez podatkov obstoječih primerov. Test preveri RLS/pravice, immutable journal/proof, queued/unknown brez dostave, idempotentno automatic acceptance, stanje primera in odsotnost izmišljenega prejema/odločitve. Obstoječa QA baza postgres ni resetirana ali migrirana. Začasna baza je po preverjanju točnega imena in nič primerov odstranjena.
- Brskalnik: dejanski komponentni obrazec v izolirani kopiji aplikacije, mock server actions, Chrome/Playwright. Dva submit dogodka -> en dispatch; queued -> sent prek avtomatskega status pollinga; ponovni status ne pošlje znova; že odobren quote ima ustrezen gumb; mobilni viewport PASS. Brez dejanskega API/SMTP. Ponovitev: node scripts/qa-unified-ui-fixture.mjs; v izpisani kopiji next dev --webpack --hostname 127.0.0.1 --port 47865; node scripts/qa-unified-ui-check.mjs.
- git diff --check — PASS.
- Hosted E2E in dejanski Quibi send: NI IZVEDENO; ni označeno PASS.

## Migracija in omejitve
Forward-only migracija doda ločen production journal, service-role RPC za samodejno evidenco SMTP predaje, provenance in nespremenljivo okolje povezav/quote. Stari podatki ostanejo DEV. Obstoječih DEV numeričnih ID se nikoli samodejno ne reinterpretira kot production ID. Migracija ni aplicirana na hosted Supabase. Pred uporabo nove kode mora biti preverjena in posebej odobrena njena aplikacija. Obstoječa DEV povezava se ob preklopu konfiguracije ne more uporabiti kot production povezava: produkcijski prehod zahteva posebej pregledano ureditev pravih production povezav; koda napačno okolje zavrne.

Obstoječi DB delivery_status=delivered je zgodovinski transportni status; delivery_proof_kind=quibi_mail_server_acceptance izrecno pomeni le predajo strežniku. viewed_at in customer_decision ostaneta prazna do dejanskega dogodka. sent ni dokaz prejema ali branja.

Polling teče omejeno ob odprtem primeru in ob ponovnem odprtju; stalni ozadni worker za zaprto stran ni dodan. Za timeout brez send_id je potrebna preiskava pri Quibiju, ne nov klik/resend. Tudi terminal failed ne omogoča drugega dispatcha iste različice. Če lokalna evidenca odpove po sent, status-only preverjanje jo lahko popravi brez novega pošiljanja.

Javna dokumentacija Quibi (https://navodila.quibi.net/za-razvijalce/) potrjuje dokument send/send_status, PDF, email ter optional subject/body, queued/sent/failed in produkcijsko domeno si.quibi.net. Splošen samostojen API za druga sporočila strankam v pregledani dokumentaciji ni potrjen. Te funkcije ostanejo jasno označeni osnutki/zunanji ročni postopki, ne simulirane dostave.

## Točen naslednji varen E2E korak
1. Pregledati migracijo in posebej odobriti aplikacijo na obstoječem DEV/Preview Supabase. Ne ustvarjati projekta ali prepisati podatkov. Preveriti deploy nove veje in environment-bound povezave.
2. Po ločeni odobritvi konfiguracije uporabiti APP_ENV=preproduction, QUIBI_MODE=dev, VERCEL_ENV=preview, obstoječe QUIBI_DEV_USERNAME/PASSWORD, QUIBI_DEV_WRITE_ENABLED=1 in QUIBI_DEV_TEST_RECIPIENT=online.gold100@gmail.com. Dejanski testni naslov mora biti različen od sveže preverjene e-pošte stranke; preveriti dostop do testnega mailboxa. V tej nalogi noben flag ni vklopljen.
3. Po NOVI izrecni odobritvi dejanskega send preizkusa odpreti ISTI primer 9d40c42f-b6a8-473b-983f-f9620df97d10, quote ab9f75b2-e6f3-45c7-82de-e36c82faab7b, Quibi customer 405956/vehicle 2387/document 2176888. Sveže preveriti identiteto in 122 EUR; če je quote že attempted, ga ne pošiljati ponovno. Ne ustvarjati dokumenta ali izmišljati telefona.
4. Potrditi postavke/identiteto/prikazani testni naslov in enkrat klikniti »Pošlji stranki«. Preveriti en journal/send_id, queued/sent/failed, UI osvežitev brez F5 in dejanski testni mailbox ločeno. DEV ne sme ustvariti evidence dostave stranki. Ob timeoutu brez send_id ustaviti; nikoli resend.
5. Produkcija zahteva ločeno prihodnjo odobritev, production povezave/credentials in APP_ENV/QUIBI_MODE/VERCEL_ENV=production ter QUIBI_PRODUCTION_READ_ENABLED/WRITE_ENABLED/SEND_ENABLED=1. V tej nalogi produkcijski zapisi/pošiljanje niso omogočeni. Najprej DEV E2E in pregled rezultatov.

## Prebrane poti in uporabljene veščine
Osnovna pot delovnega drevesa: C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/.
Prebrane projektne smernice: AGENTS.md, CLAUDE.md in node_modules/next/dist/docs/01-app/02-guides/forms.md pod to osnovno potjo; pri predhodnem delu tudi vodič revalidatePath.
- C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md
- C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/using-superpowers/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/brainstorming/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/writing-plans/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/test-driven-development/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/systematic-debugging/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md
- C:/Users/Admin/.agents/skills/security-review/SKILL.md
- C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md
- C:/Users/Admin/.agents/skills/vercel-react-best-practices/SKILL.md
- C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/vercel/0.54.1/skills/react-best-practices/SKILL.md
- C:/Users/Admin/.codex/skills/playwright/SKILL.md

Brez novih odvisnosti, brez izvajanja skript tretjih skillov, brez sprememb MCP/env, brez dejanskih Quibi write/send klicev, brez hosted migracij, brez mergea. Uporabniških osmih PNG datotek v scripts/manual-qa ne vključujemo v commit.
