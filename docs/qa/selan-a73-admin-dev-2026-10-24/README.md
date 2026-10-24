# Administratorska potrditev vozila v gostovanem DEV

Administrator lahko v gostovanem Preview (APP_ENV=preproduction, QUIBI_MODE=dev, VERCEL_ENV=preview) izrecno potrdi novo Quibi vozilo. Produkcijski administrator te nove pravice nima; obstoječa pravica lastnika ostaja. Ni sprememb članstva, RLS, migracij, nastavitev WRITE/SEND ali produkcijske objave.

## Naslednji klik

1. Kot administrator odpri [primer #A73DB6BE](https://selan-dev-pr19-azalar7-langs-projects.vercel.app/dashboard/primeri/a73db6be-7216-4677-bc0a-26e97693ad75).
2. Preveri BMW 318d, TEST-2026, VIN TESTSELANBX202602 in klikni **Potrdi in ustvari vozilo v Quibiju**.
3. Selan ponovno preveri identiteto, podvojitve in dnevnik, poveže preverjen rezultat ter sam nadaljuje trajno pripravo osnutka. Ne zahteva dodatnega sprejema ali sinhronizacije. Po osvežitvi mora ostati ista povezava in shranjen osnutek.

Vsi trije zahtevani opisi ostajajo: servis vozila, pregled pred tehničnim pregledom in pregled zavor. Katalog ne zagotavlja vseh cen: pozitivna cena pri »brezplačnem« pregledu zahteva izbiro; neprepoznana storitev ostane prosta brez izmišljene cene. Nastanek predračuna ni samodejna poslovna odobritev ali CREATE dokumenta.

## Dokazi in omejitve

- 45 ciljnih testov: dovoljenja DEV/prod/lokalno/demo, identiteta, podvojitve, priprava treh storitev in potek.
- 5 dodatnih testov dejanske strežniške akcije z izoliranimi adapterji: DEV admin, zavrnitev prod admin/mehanika/nepotrjenega klika, nespremenjena lastniška pravica, zastarel vnos, neuspešna povezava, samodejni začetek priprave po povezavi. Brez omrežja ali dejanskih CREATE operacij.
- 15 hidriranih UI scenarijev pri 1440/390/350 px; DEV admin in lastnik imata neposreden gumb brez checkboxa; produkcijski admin ostane brez CREATE. 42 dodatnih navigacijskih UI scenarijev uspešnih.
- TypeScript in ciljni ESLint uspešna.
- Dejanska DEV baza: aktivni administrator in lastnik oba uspešno prestaneta obstoječi resolve_case_vehicle/ready. Funkcija in RLS že dovoljujeta aktivno članstvo owner/admin v pravilni organizaciji. Spremembe baze niso potrebne.
- Prijavljeni E2E **ni preverjen**: CUA vrne `failed to write kernel assets`, ločeni Playwright pa preusmeri na /login. Odprta uporabnikova seja ne pomeni, da jo ima testno orodje.
- Vozila ali dokumenta nismo ustvarili. Ni pošiljanja e-pošte. Dejanski uspeh uporabnikovega klika in poznejše shranjevanje v prijavljeni aplikaciji mora potrditi ročni preizkus zgoraj.

## Sintetični posnetki dejanskih komponent

![DEV administrator, namizje](../selan-redesign/vehicle-admin-1440.png)
![DEV administrator, telefon](../selan-redesign/vehicle-admin-390.png)
![Produkcijski administrator brez nove pravice](../selan-redesign/vehicle-admin-production-390.png)

## Prebrane smernice in analiza

- C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1/AGENTS.md in CLAUDE.md
- C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md
- C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md
- C:/Users/Admin/.agents/skills/security-review/SKILL.md
- C:/Users/Admin/.agents/skills/deploy-to-vercel/SKILL.md
- C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md
- C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/vercel/0.54.1/skills/deployments-cicd/SKILL.md
- C:/Users/Admin/avtoservis-selan/docs/selan-rea-complete-ux-audit.md
- node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md v aktivnem worktreeju

REA pregled je delno starejši od PR: aktivni obrazec, zložene podrobnosti in nadaljevanje priprave že obstajajo. Teh rešitev nismo ponovno gradili. Nova sprememba je omejena DEV pravica in njena dosledna uporaba v obeh obstoječih strežniških poteh in UI.
