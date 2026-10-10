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
