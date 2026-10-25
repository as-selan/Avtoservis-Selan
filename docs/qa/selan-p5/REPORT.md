# Selan P5 — dnevna uporaba

Zaključen primer ima vozilo, račun, ločeno plačilo in sekundarni povezavi. Aktivni gumb in prejšnji obrazci niso več v glavnem prikazu; zgodovina ostane pod Podrobnosti primera. Stari prevzemni hash se po zaključku odstrani iz navigacije.

Dashboard ohrani skupine, iskanje in ločeno testno skupino. Krajše kartice ne ponavljajo opisa; opis ostane v primeru in iskalnem indeksu. Ročna osvežitev je v podrobnostih, avtomatska ostane. Vrstni red upošteva najnovejši čas primera, popravila, dokumentov in odobritve. Prevzem ni več poimenovan kot plačilo.

Plačilo ima en prikaz: Plačano, Delno plačano ali Plačilo ni potrjeno. Odprti znesek se prikaže samo, kadar je na voljo. Neznano ni dokaz neplačila. Osveževanje poteka v ozadju, brez ročnega gumba in brez spremembe Quibi plačil.

Mehanik ima kamero neposredno, z ohranjenim capture=environment, zasebnim uploadom in večjim območjem za dotik. Galerija in neobvezen opis sta zložena. Obstoječi primarni delovni gumb in razvrščanje po dodelitvi ostaneta. Shranjeno ime ima prednost; brez imena je enkrat prikazana shranjena e-pošta, brez opozoril in novega postopka. Lastnik lahko ime ureja v Ekipi.

Razvojni izrazi v poslovnih sporočilih so zamenjani z razumljivimi napisi. Izvorne reference, revizija, testna identiteta in omejitve ostanejo. Regresijski pregled zajame tudi CREATE/WRITE/READ/SHA/API v običajnem JSX. Pomembna opozorila o spremenjenem dokumentu, neznanem izidu ali nepotrjeni dostavi ostanejo vidna.

## Preverjanje in omejitve
- Hosted SQL READ C066482D potrdi accepted, invoice_checked in closed, vsi simulated=true. Uporabnikov prevzem je shranjen 25. 10. 2026 21:43:32 UTC. Račun 2176936 / DELAVNICA-A-26000261 / 50,00 EUR; shranjena plačila 0,00, odprto 50,00. Med nalogo dogodki niso spreminjani.
- REA na 127.0.0.1:9222 vidi DEV /login, ne prijavljenih zaslonov. Evidence ev_806cf6497b0e42e118183dfc18849ea83d9fb340af0da42f050f787563bb379c in ev_9967ba81a9b582f0a22291a30d39359c8d58e95ddea89dad32c5f5e547494217. Prijavljeni hosted E2E ni potrjen.
- Lokalni celoten nabor 697/697 PASS, končne usmerjene regresije 31/31 PASS, TypeScript PASS. Končni CI, ESLint in čisti build so navedeni v opisu PR #19.
- Slike so izolirane dejanske komponente, ne gostovana prijavljena aplikacija. Širine 1440/390/350 px brez horizontalnega prelivanja. Zaključen prikaz nima poslovnega gumba. Fizična telefonska kamera zahteva ročni preizkus; izolirani CI preveri izbor in zasebno shranjevanje sintetičnih fotografij.
- Ni novih migracij, dovoljenj, odvisnosti, sprememb finančnega obračuna ali Quibi CREATE/UPDATE/SEND. Ni merge ali produkcijske objave.

## Posnetki izoliranih komponent
| Pogled | 1440 | 390 | 350 |
|---|---|---|---|
| Zaključeno | [slika](screenshots/p5-closed-1440.png) | [slika](screenshots/p5-closed-390.png) | [slika](screenshots/p5-closed-350.png) |
| Dashboard | [slika](screenshots/p5-dashboard-1440.png) | [slika](screenshots/p5-dashboard-390.png) | [slika](screenshots/p5-dashboard-350.png) |
| Mehanik | [slika](screenshots/p5-mechanic-1440.png) | [slika](screenshots/p5-mechanic-390.png) | [slika](screenshots/p5-mechanic-350.png) |

## Ročni pregled
Odpri zaključen C066482D: brez primarnega opravila, račun DELAVNICA-A-26000261 in ločeno nepotrjeno plačilo. Odpri račun ter PDF, osveži in preveri ohranjen zaključek v testni skupini. Kot mehanik preveri kamero na obstoječem aktivnem testnem nalogu. Ne dodajaj dogodkov zaključenemu primeru.

## Pravila in veščine
Aktivni worktree: C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1. Prebrana AGENTS.md in CLAUDE.md v njem ter node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md.

Uporabljeno: C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md; C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md; C:/Users/Admin/.agents/skills/superpowers/systematic-debugging/SKILL.md; C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md; C:/Users/Admin/.agents/skills/security-review/SKILL.md; C:/Users/Admin/.agents/skills/deploy-to-vercel/SKILL.md; C:/Users/Admin/.agents/skills/vercel-react-best-practices/SKILL.md; C:/Users/Admin/.agents/skills/reverse-engineer-anything/SKILL.md; C:/Users/Admin/.codex/skills/playwright/SKILL.md; C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md.

Pregledani viri: src/app/dashboard (primeri, dashboard, mehanik, Ekipa, dokumenti); CaseWorkspace, CaseJourney, CaseWorkPanel, CaseWorkForms, CaseOverview, CaseWorkSummary, QuibiDocumentPayments; src/lib/dashboard/{intake-queue,adapt-dashboard,load-dashboard-snapshot}.ts; src/lib/case-work/{read,review-policy,review-actions,review-read}.ts; src/lib/quibi/{invoice-payments,pdf-read}.ts. Strežniški review-actions in SQL niso spreminjani.
