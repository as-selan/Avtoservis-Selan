# P4 — samodejni datumi in poslovni napisi

## Dejanski DEV READ C066482D

service_case_assignments ima status work_completed in zadnji zapis stanja 2026-10-25T18:11:19.810906Z, tj. 25. 10. 2026 ob 20:11 Europe/Ljubljana. Zapis pregleda vodje accepted je poznejši: 18:14:15 UTC in simulated=true. Datum storitve za ta označeni testni primer zato izhaja iz zabeleženega zaključenega dela, ne iz pregleda vodje.

Pravilo uporablja datum zadnjega zabeleženega stanja zaključenega dela (assignment.updated_at ob potrjenem work_completed), ne splošne zadnje aktivnosti, datuma fotografij, zapiskov ali pregleda. To je obstoječi zapis trenutnega stanja, ne nova nespremenljiva zgodovina prehodov. Stanje assignmenta in prebranega naloga se morata ujemati; pri nekončanem ali neznanem stanju datuma ne sklepamo. Izrecni datum Quibi storitve in uporabnikovi popravki imajo prednost. Pregled vodje še vedno ostaja samostojen strežniški predpogoj izdaje.

Za trenutni dan izdaje 25. 10. 2026 in Quibi rok 5 dni so pričakovani datumi:

- storitev 25. 10. 2026;
- izdaja 25. 10. 2026;
- zapadlost 30. 10. 2026.

Vsa tri polja se samodejno dopolnijo. Shranjene vrednosti ostanejo ISO, prikaz slovenski. Nove samodejne vrednosti se lahko osvežijo na nov dan izdaje; ročno popravljene vrednosti in stare shranjene vrednosti brez provenance se ne prepišejo. To ohrani varnost že obstoječih ročnih vnosov. Neznanega plačilnega roka ne izmišljamo.

## Prikaz in ohranjene varovalke

Poslovni napisi so poenoteni za administratorja, vodjo, mehanika, odobritev, naloge, račune, prevzem in termine. Razvojna pojasnila ostanejo v zaprtih podrobnostih. Opozorila o nepotrjenem vozilu, neizvedeni dostavi, manjkajoči zunanji rezervaciji in neznanem plačilu ostanejo poslovno razumljiva in niso odstranjena.

Testni primeri ostanejo v ločeni skupini dashboarda in imajo oznako Testni primer. Glava primera kaže eno stalno oznako; podrejeni prikazi ohranijo oznako tudi ob samostojnem odprtju. Izvorna besedila in QA-SIM oznake ostanejo v podatkih, auditnih referencah, dokumentih, payloadih ter podrobnostih. V prikazu postavke se izpusti samo znani uvodni tehnični prefiks, izvirnik ostane v podrobnostih cen. Simulated zastavice, produkcijske omejitve, uporabniške pravice in poslovni dogodki niso spremenjeni.

Izdaj račun ostane edino dejanje pri popolni pripravi. Samodejno branje ne nastavi dispatch. Ni dodanih obrazcev, checkboxov ali potrditev. Ni bilo Quibi CREATE/UPDATE/SEND, sprememb cen/dokumentov, produkcijske objave, migracij ali merge.

## Dokazi

- Lokalni celotni nabor: 675/675 PASS; po zadnjih spremembah povratnih sporočil še relevantnih 11/11 PASS.
- Regresije preverijo datum mehanika proti poznejši aktivnosti, slovenski časovni pas/polnoč, 5-dnevni rok, samodejno strežniško pripravo brez WRITE, dan izdaje, ročne popravke, osvežitev, izvorne podatke, poslovne napise zunaj podrobnosti, veljaven HTML in ohranjene interne testne reference.
- TypeScript in ESLint: preverjena lokalno; končni build in izolirani DB/browser rezultat sta navedena v CI istega PR.
- Prijavljeni gostovani E2E ni potrjen. Dejanski DEV zapis zaključka je preverjen z READ; UI in dejanja so pokriti z regresijami. Nobenega računa ne izdamo med preverjanjem.

## Pravila in veščine

C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1/AGENTS.md in CLAUDE.md; C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md; C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md; C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md; C:/Users/Admin/.agents/skills/security-review/SKILL.md; C:/Users/Admin/.agents/skills/deploy-to-vercel/SKILL.md; C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md; node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md.
