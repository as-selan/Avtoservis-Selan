# DEV sintetična stranka — popravek e-poštne politike

Veja codex/selan-pr18-manual-qa; preverjeni lokalni in oddaljeni izhodiščni HEAD f44bf38e465de6f141fc2a9556012c1bb7cd51f2.

Vzrok: workflowRecipient je tudi v DEV klical actualCustomerEmail, ki upravičeno za produkcijo zavrne rezervirano domeno example.test. Prejemnik je bil sicer preusmerjen v testni mailbox, vendar se je postopek ustavil že pred izbiro mailboxa.

Popravek: zasebni matchingCustomerEmail preveri sintakso in ujemanje lokalnega/Quibi naslova po trim in normalizaciji velikosti črk. DEV ga uporabi za identiteto in nato vrne samo QUIBI_DEV_TEST_RECIPIENT. Testni naslov še vedno ne sme biti rezerviran ali enak naslovu stranke. Produkcijski actualCustomerEmail nad istim preverjanjem ohrani prvotni strogi filter rezerviranih domen. Sveža preverjanja stranke, vozila, dokumenta, SHA, odobritve in zneska niso spremenjena. DEV transport dodatno neodvisno zavrne vsak naslov, ki ni konfigurirani testni recipient.

## Datoteke
- src/lib/quibi/workflow-config.ts
- src/lib/quibi/workflow-config.test.ts
- src/lib/quibi/unified-workflow.test.ts
- ta QA zapis

## Preizkusi
RED: 23 ciljnih testov, 3 pričakovane napake QUIBI_CUSTOMER_EMAIL_UNVERIFIED pri sintetični DEV stranki. Po popravku vseh 130 regresijskih testov PASS, nič skipped.
Dodani testi preverijo DEV sintetično ujemanje in normalizacijo, napačno/odsotno ujemanje, napačen ali strankin testni recipient, zavrnitev strankinega naslova na HTTP transportu, produkcijsko zavrnitev sintetičnega naslova in workflow z obstoječimi identifikatorji.
Izolirani workflow primer: case 9d40c42f-b6a8-473b-983f-f9620df97d10, quote ab9f75b2-e6f3-45c7-82de-e36c82faab7b, customer 405956, vehicle 2387, document 2176888, approved_for_send, 122 EUR. Mock dispatch je šel samo v testni mailbox, status polling ni ustvaril dostave stranki, ponovitev je bila zavrnjena. Test uporablja izolirane podatke in nima omrežnih Quibi klicev.
Read-only lokalna poizvedba ni našla tega primera v obstoječi lokalni QA bazi. Hosted stanje ni bilo spreminjano ali preizkušeno; zato to ni hosted E2E PASS.
Ukaz: node --import ./scripts/contact-test-register.mjs --experimental-strip-types --test (seznam vseh src/lib/**/*.test.ts iz rg).
TypeScript npx --no-install tsc --noEmit, npm run lint, next build --webpack in git diff --check: vsi PASS, exit 0. Build je uporabil izolirano kopijo, ki se ujema z vsemi 175 izvornimi datotekami, in samo obstoječo javno lokalno Supabase konfiguracijo v child procesu. Opozorilo o več lockfiles izhaja iz izolirane kopije; Node opozorilo MODULE_TYPELESS_PACKAGE_JSON je že obstoječe.

Brez dejanskega pošiljanja ali Quibi write klica, brez Vercel sprememb, brez novih ali apliciranih migracij, brez mergea. Uporabniški PNG ostanejo nespremenjeni in izven commita.

## Prebrane poti in veščine
Projektna osnova: C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/.
Projektne smernice: AGENTS.md in CLAUDE.md pod to osnovo. Pomembni prebrani viri pod isto osnovo: src/lib/quibi/workflow-config.ts, workflow-config.test.ts, unified-workflow.test.ts in write-contract.ts. Ni sprememb Next API ali UI.
- C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md
- C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/systematic-debugging/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/test-driven-development/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md
- C:/Users/Admin/.agents/skills/security-review/SKILL.md

Naslednji korak ostaja ločeno odobren DEV Preview E2E na istem primeru. Sintetični naslov je dovoljen le za preverjanje identitete, nikoli kot DEV prejemnik. Preveriti sveže Quibi ujemanje in 122 EUR, izrecno potrditi enkratni testni klik ter preveriti send_id/status in testni mailbox. Ni ponovitve že attempted quote.

## Nadaljevanje: strogo lokalno dovoljenje za isti DEV send
Izhodišče 97c6f22005b3e208f3448861c7bea91a3b2fb8ed. Dodan QUIBI_DEV_LOCAL_SEND_ENABLED=1, skupaj z SELAN_APPROVED_LOCAL_DEV=1 in obstoječim write opt-in. Brez Vercel spoofinga: VERCEL_ENV sme manjkati ali biti development. Samo kanonični http://127.0.0.1 origin, isti completion origin, točen Host/Origin/forwarded header pregled v proxyju in unified server actions. Ohranjen pinned obstoječi Supabase projekt. Pooblastilo je vezano na navedeni case/quote/customer/vehicle/document in že odobrenih 122 EUR. Lokalni transport zavrne vse druge POST zapise, tudi ustvarjanje stranke, vozila ali dokumenta. Stare ločene DEV send poti ostanejo Preview-only.
Spremenjeni viri: src/lib/quibi/local-send-policy.ts in .test.ts; workflow-config.ts; unified-actions.ts; unified-workflow.ts in .test.ts; write-http.ts; src/lib/demo/config.ts; src/lib/supabase/proxy.ts.
Preizkusi konfiguracije, Host/Origin, scope, recipient, at-most-once in prepovedi drugih zapisov so izolirani; niso dejansko pošiljanje.
Dejanska operacija je BLOKIRANA pred dispatchom: v Process/User/Machine env in .env datotekah vseh Selan worktrees ni dejanskih Quibi DEV poverilnic ali hosted API konfiguracije. Priložena navodila nimajo credential assignmentov. Obstoječi port 3000 uporablja stari fixture server, lokalna QA baza pa nima navedenega primera. DB credential XML ni nadomestilo za API credentials. Ne razkrivamo vrednosti, ne ponarejamo Preview, ne ustvarimo novega primera. Zahtevana je samo pot do obstoječe lokalne shrambe konfiguracije.
Dispatch: 0. send_id: ni. send_status: ni pridobljen. Quibi acceptance: ni izvedeno. Ni lažne customer-delivery evidence, ker ni izveden noben send ali DB zapis. Brez migracij, Vercel sprememb ali produkcijskih nastavitev.
Dodatno prebrane poti: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/headers.md pod projektno osnovo; C:/Users/Admin/.codex/skills/playwright/SKILL.md; scripts/manual-qa/Start-ManualQa.ps1 (samo pregled, ni zagnan).
Končni rezultati: 136/136 testov PASS, TS/lint/build/diff PASS (exit 0). Izolirana build kopija ustreza vsem 177 izvorom. Neavtenticiran HEAD https://dev.quibi.net/ vrne HTTP 302: TLS/HTTP je dosegljiv, avtenticiran API dostop ni potrjen. Za dejanski zagon mora strežnik biti vezan z next start --hostname 127.0.0.1 --port 3002 in PUBLIC_APP_ORIGIN/COMPLETION_PUBLIC_ORIGIN=http://127.0.0.1:3002; brez obstoječih poverilnic tega pošiljanja nismo omogočili.
