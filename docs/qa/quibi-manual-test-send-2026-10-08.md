# Quibi DEV: testno pošiljanje obstoječega predračuna

Izhodiščni lokalni in oddaljeni HEAD: 2138727ea63d5df7b133984fef6b1a888b4fe637.
Veja: codex/selan-pr18-manual-qa. Repo: as-selan/Avtoservis-Selan.

## Vzrok in implementacija

Dosedanji sendQuibiDevTestEstimate dovoljuje samo dokument z verified journalom kind=estimate, ustvarjenim v Selanu. Ročno povezani obstoječi dokument takega create zapisa nima.

Nova ločena pot sendManualQuibiDevTestEstimate/sendManualLinkedEstimate ne ustvarja ali posodablja Quibi dokumenta. Ponovno preveri pooblaščenega owner/admin, organizacijo, servisni primer, sveže lokalne/Quibi povezave stranke in vozila, zadnjo odobreno različico quote in SHA vsebine. Dokument mora biti v sveže prebranem seznamu predračunov iste stranke, njegov detail mora potrditi ID/stranko, postavke in SHA. Izrecno drugačno vozilo ali selan-service-request external_id je zavrnjeno.

Ker Quibi ne zagotavlja identitete storitve in lahko izpusti ID vozila, je vedno potrebna izrecna ročna potrditev z opisom dokaza. Journal pred dispatchom nespremenljivo shrani akterja, čas, stranko, vozilo, dokument, storitev, primer, quote, odobreni SHA in konfiguriranega prejemnika. Ta potrditev ne preglasi izrecnih oddaljenih neskladij. Pred samim dispatchom se avtorizacija in dokument ponovno prebereta.

Za send in send_status velja preproduction + dev + Vercel Preview + eksplicitni write flag + izključno https://dev.quibi.net; lokalna write izjema ne velja za pošiljanje. Prejemnik se jemlje samo iz QUIBI_DEV_TEST_RECIPIENT, brez form override, in ne sme biti naslov lokalne ali oddaljene stranke oziroma example.test. Mailbox ni hardkodiran v produkcijski kodi; online.gold100@gmail.com je predvidena ločeno odobrena konfiguracija.

Obe poti delita unique journal kind=send na quote ID in atomarni prepared->dispatching claim. Največ en dispatch na različico. Timeout pušča uncertain brez samodejne ponovitve. Shranjeni send_id omogoča ločen status-only ukaz. queued, sent in failed so ločeni; sent pomeni predajo poštnemu strežniku, ne potrjenega prejema. Terminalno stanje se ne spremeni nazaj v queued. Napaka shranjevanja po dispatchu prav tako ne dovoljuje ponovitve.

UI zahteva dokaz in dve potrditvi ter zaklene dvojni klik. Po uspehu ali napaki osveži strežniško stanje. Ločen gumb preverja status brez dispatcha. ManualEstimateHandoff in obrazec za dokaz dejanske dostave nista spremenjena; testni send ne vpisuje dostave ali odločitve stranke. Dosedanji ustvarjanje/popravek ostaneta; created send dodatno ponovno preveri avtorizacijo pred dispatchom.

## Verifikacija

- RED: novih 10 testov je pred implementacijo padlo zaradi manjkajoče ločene poti.
- GREEN: vseh 107 enotskih testov src/lib je uspešnih, brez live fetch/write/send.
- Pokrito: dovoljen ročni dokument brez create journala; drugačen zahtevani prejemnik, example.test in naslov stranke; spremenjen SHA pred in po claimu; druga stranka/vozilo/dokument/primer/storitev; prazne postavke; neodobrena/zastarela različica; napačna vloga; manjkajoča ročna ali testna potrditev; dvojni klik; timeout in retry; status-only pot; queued/sent/failed; napačno okolje in lokalna izjema; dosedanji create/update/send testi.
- TypeScript: tsc --noEmit PASS.
- Lint: npm run lint PASS.
- Build: PASS (exit 0), izolirana kopija .next/manual-quibi-send-build, next build --webpack, vseh 15 statičnih strani generiranih. Samo obstoječa javna lokalna Supabase konfiguracija je podana otroškemu build procesu; noben send/write flag ni vklopljen.
- git diff --check: PASS.
- Hosted E2E, dejanski send/send_status in prihod sporočila: NI IZVEDENO.

## Migracije in omejitve

Nova migracija ni potrebna. Obstoječa 20261007120000_quibi_dev_operation_journal.sql že zagotavlja nespremenljiv text zahtevek, unique na organizacija/kind/local_entity_id in ustrezne transitions. Ni bilo hosted apliciranja, Quibi send/write klica, Vercel spremembe, novih okolij, mergea ali spremembe drugega projekta.

Mock testi dokazujejo aplikacijske varovalke in sočasni claim; ne dokazujejo dejanskega Quibi API rezultata ali hosted stanja. Hosted obstoj obstoječe journal sheme, trenutni SHA/odobritev ciljnega quote in Preview konfiguracija niso bili preverjeni v tej nalogi. Če identitete ali dokaza ni mogoče zanesljivo potrditi, se ne pošlje.

## Naslednji ločeno odobreni korak

1. V obstoječem Preview preveriti obstoječo journal shemo in konfiguracijo: APP_ENV=preproduction, QUIBI_MODE=dev, VERCEL_ENV=preview, DEV credentials/origin ter QUIBI_DEV_TEST_RECIPIENT=online.gold100@gmail.com. Vklop QUIBI_DEV_WRITE_ENABLED=1 zahteva ločeno odobritev; v tej nalogi ni izveden.
2. Ponovno prebrati isti primer 9d40c42f-b6a8-473b-983f-f9620df97d10, Quibi stranko 405956, vozilo 2387, predračun 2176888 in zadnji approved_for_send quote ab9f75b2-e6f3-45c7-82de-e36c82faab7b z odobreno ceno 122 EUR. Cena ni hardkodirana; veljata aktualni odobreni SHA in svež dokument.
3. Owner/admin naj pregleda postavke, dokaz vozila/storitve, konfiguriran testni naslov in journal. Šele po ločeni izrecni odobritvi dejanskega testnega pošiljanja opravi en potrjen klik.
4. Shrani/preveri send_id in status ter ločeno potrdi dejanski prihod v testni mailbox. Ob timeoutu ali manjkajočem send_id ne ponavljati; ročno uskladiti dnevnik/Quibi.

## Prebrane smernice in uporabljene veščine

Root worktree: C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1.

Prebrano: C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/AGENTS.md; C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/CLAUDE.md; C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/node_modules/next/dist/docs/01-app/02-guides/forms.md; C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md; C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md.

Uporabljene veščine (točne poti):
- C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/using-superpowers/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/systematic-debugging/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/test-driven-development/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md
- C:/Users/Admin/.agents/skills/security-review/SKILL.md
- C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md
- C:/Users/Admin/.agents/skills/vercel-react-best-practices/SKILL.md
- C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/vercel/0.54.1/skills/react-best-practices/SKILL.md

Pregledane datoteke (v root): src/lib/quibi/dev-write-actions.ts; write-workflow.ts; write-workflow.test.ts; write-journal.ts; write-contract.ts; write-contract.test.ts; write-http.ts; write-client.ts; contracts.ts; client.ts; src/components/dashboard/QuibiDevWritePanel.tsx; ManualEstimateHandoff.tsx; src/app/dashboard/primeri/[serviceRequestId]/page.tsx; supabase/migrations/20261007120000_quibi_dev_operation_journal.sql; package.json.

Spremenjene/dodane datoteke: src/lib/quibi/dev-write-actions.ts; write-workflow.ts; write-contract.ts; write-http.ts; write-contract.test.ts; manual-send-workflow.test.ts; src/components/dashboard/QuibiDevWritePanel.tsx; QuibiManualTestSendPanel.tsx; src/app/dashboard/primeri/[serviceRequestId]/page.tsx; ta QA zapis.
