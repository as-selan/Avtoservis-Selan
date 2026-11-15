# Selan P5.1 — zakljucni UX popravki

## Sest podrocij
| Podrocje | Rezultat | Dokaz in omejitev |
|---|---|---|
| Razvrscanje mehanika | PASS izolirano | Aktivno delo, nato work_completed, nato poslovno closed/workLocked. Znotraj vsake skupine najnovejsa dodelitev. Regresija vkljucuje ponovno branje in spremembo stanja; Realtime ostane obstojec. |
| Stranka | PASS pravice/prikaz | Obstojeco dovoljeno ime prikazemo. Brez dovoljenja ali imena ni prazne vrstice Stranka. Hosted RLS potrdi customers_select_advisor_plus samo za owner/admin/reception; mehanikov dostop ni razsirjen. |
| Podrobnosti zakljucka | PASS izolirano | Odstranjena podvojena besedilna povezava, ostane obstojeci zlozljiv razdelek. Odpri racun in pot PDF sta nespremenjena. |
| Dashboard skupina | PASS regresija | Obstojeca skupina decision zdruzuje pripravo, manjkajoce podatke in odlocitve. Novo poimenovanje: Caka moje dejanje. Sedem skupin, pripadnost in testna locitev ostanejo. |
| Ime mehanika | PASS regresija | Shrani se nic novega. Ze prebrano ime se za prikaz obreze; prazno ime uporabi obstojeco e-posto. Ni ugibanja, novih profilov ali opozoril. |
| Fotografije | PASS emulacija/izolirano | Kamera capture=environment, galerija multiple, predogled, zasebni upload in neobvezen opis ostanejo. 390/350 brez prelivanja. Fizicna telefonska kamera NI PREVERJENA. |

## Dejanski DEV in omejitve
- Samo hosted SQL READ C066482D: accepted, invoice_checked in closed so simulated=true. Racun 2176936 / DELAVNICA-A-26000261 / 50,00 EUR, shranjena evidenca placil 0,00 / odprto 50,00. Prevzem ostane evidentiran. Ni Quibi CREATE/UPDATE/SEND, novih fotografij, sprememb placil ali dogodkov.
- REA na 127.0.0.1:9222 vidi samo razpolozljivo DEV /login sejo (ev_806cf6497b0e42e118183dfc18849ea83d9fb340af0da42f050f787563bb379c). Prijavljeni hosted E2E ni potrjen. Posnetki niso predstavljeni kot prijavljeni DEV.
- Razvrscanje ne spreminja poslovnih stanj. Vzrok je bila stara dvonivojska skupina completed, ki je zdruzila opravljeno delo in poslovni zakljucek. Novi prikaz ima tri prioritete brez nove poslovne faze ali kontrol.
- Vzrok prazne stranke je obstojeca RLS omejitev, ki ji je sledil brezpogojni nadomestni napis. Ne uporabljamo privilegiranega obvoda ali nove migracije.
- Obstojece ime tece iz profiles.full_name prek enrichWork v dashboard, primer in mehanikov prikaz; ekipa ostane isti dovoljen nacin urejanja.

## Preverjanje
Prvi regresijski test je reproduciral razvrstitev active, closed, pending namesto active, pending, closed. Usmerjeni testi 38/38 PASS; celoten lokalni nabor 701/701 PASS pred dodatno regresijo obrezanega imena, nato testi overview 6/6 PASS. TypeScript in ESLint sta brez napak. Koncni CI, build, DB in browser rezultati so v opisu PR #19.

Dejanske komponente so izolirano prikazane pri 1440/390/350 px brez horizontalnega prelivanja. Seznam vizualno pokaze aktivni nalog pred BMW Delo opravljeno in Golf Zakljuceno. Zakljucena kartica nima podvojene povezave Podrobnosti primera. Vsi posnetki so sinteticne komponente brez zunanjih zapisov. Zasebne fotografije in Realtime se preverijo v obstojecem izoliranem CI, ne z nalaganjem v zakljuceni C066482D.

## Posnetki izoliranih komponent
| Pogled | 1440 | 390 | 350 |
|---|---|---|---|
| Moje delo | [slika](screenshots/p51-mechanic-list-1440.png) | [slika](screenshots/p51-mechanic-list-390.png) | [slika](screenshots/p51-mechanic-list-350.png) |
| Zakljuceno | [slika](screenshots/p51-closed-1440.png) | [slika](screenshots/p51-closed-390.png) | [slika](screenshots/p51-closed-350.png) |
| Fotografiranje | [slika](screenshots/p51-mechanic-1440.png) | [slika](screenshots/p51-mechanic-390.png) | [slika](screenshots/p51-mechanic-350.png) |

## Pravila, viri in ves cine
Aktivni worktree: C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1. Prebrani AGENTS.md in predhodno CLAUDE.md ter Next guide node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md v njem. Uporabljene iste smernice kot pri P5: [natancne absolutne poti](../selan-p5/REPORT.md#pravila-in-vescine), vkljucno z ai-orchestrator, systematic-debugging, verification-before-completion, security-review, reverse-engineer-anything, Playwright in deploy-to-vercel.

Pregledani/spremenjeni viri: src/lib/case-work/overview.ts in overview.test.ts; CaseWorkPanel.tsx; ClosedCaseSummary.tsx; P5Presentation.test.ts; src/lib/dashboard/intake-queue.ts in testi; scripts/qa-repair-panel.test.mjs. Pregledane obstojeca RLS v supabase/migrations/20260928173816_20260913174315_customers.sql in case_work_snapshot v 20261014184946_team_case_work_and_private_evidence.sql, src/lib/case-work/read.ts ter stran mehanika. SQL, pravice, fotografiranje in Quibi dokumenti niso spreminjani.
