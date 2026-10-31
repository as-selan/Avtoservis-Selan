# Račun po pregledu vodje — eno naslednje dejanje

C066482D ima po DEV SELECT verificiran delovni nalog 2176935 in zadnji pregled accepted; invoice operacije ni. Ni bilo zapisov v primer, Quibi CREATE/SEND ali izdaje računa.

Vzrok podvojitve: avtomatski READ je že pripravil predogled, vendar sta CaseJourney in stari pregled dela še vedno ponujala navigacijo Pripravi račun. Obrazec ni ločeval samodejnega nalaganja od uporabnikovega pregleda.

Popravek:
- Obstoječi avtomatski READ pripravi podatke računa iz potrjenega naloga po pregledu vodje. Strežniški pogoj zaključka in pregleda ostane.
- Glava primera v tej fazi ne prikazuje dodatnega CTA. Pri računu je eno lokalno dejanje Preglej račun.
- Klik opravi samo obstoječe READ preverjanje. Šele pregled trenutno veljavnega SHA ponudi Izdaj račun, kadar je WRITE dovoljen. Izdaja ostane izrecni klik in uporablja obstoječi dispatch, pravice, fresh podatke in dnevnik preprečevanja ponovitve.
- Pri spremenjenih podatkih se pregled razveljavi. Onemogočena izdaja ne prikaže lažnega gumba. Povezani računi ostanejo povezave na obstoječi dokument brez druge izdaje.
- Postavke, cene, DDV, zneski in obstoječi datumi se ne spreminjajo; potrditve opravljenega dela ni treba ponavljati. Ni novih checkboxov ali obrazcev.

Preverjanje: celoten lokalni nabor pred zadnjima testoma prikaza 652/652 PASS; obe dodatni regresiji PASS; TypeScript in ESLint PASS. Regresije obsegajo samodejni READ brez dispatcha, eno lokalno dejanje, pregled pred izdajo, ponovni pregled ob spremembi, onemogočen WRITE, obstoječe račune, skrito dodatno glavo in sekundarno povezavo brez konkurenčnega primarnega gumba. Končni celotni CI in DEV sta navedena v PR.

Prijavljeni gostovani E2E ni potrjen; prehod je preverjen s komponentnimi in obstoječimi strežniškimi regresijami ter scoped DEV READ. Sintetični browser nabor ostaja ločeno preverjanje. Ni sprememb migracij, RLS, konfiguracije, Quibi pravic ali produkcije.

Prebrane smernice: aktivni koren C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1/AGENTS.md; node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md v tem korenu; C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md; C:/Users/Admin/.agents/skills/superpowers/systematic-debugging/SKILL.md; C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md. Uporabljeni sta tudi že prebrani veščini C:/Users/Admin/.agents/skills/deploy-to-vercel/SKILL.md in C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md za obstoječo DEV objavo in READ.
