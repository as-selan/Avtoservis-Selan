# Prevzem vozila po izdaji računa

## Vzrok in popravek
Povezava je vodila na splošni `#popravilo`. Tam je bil prevzem dodatno pogojen z ločenim ročnim dejanjem `invoice_checked`. Izdani račun zato ni odprl neposrednega prevzema.

Povzetek izdanega računa ima eno povezavo PDF in velik moder gumb **Prevzem vozila**, ki vodi na `#prevzem` istega primera. Vodenje primera odpre obstoječi razdelek popravila in neposreden prikaz prevzema. Zgodovina, fotografije in podrobnosti ostanejo zložene.

Po potrditvi vodje in povezanem izdanem računu se prikaže prevzem. En klik **Vozilo prevzeto** sveže preveri identiteto vozila, račun, nalog, nespremenjene SHA in Quibi plačila. Kadar preverjanje PDF še ni evidentirano, aplikacija v istem uporabniškem dejanju preveri že izdani PDF in shrani tehnični `invoice_checked`, nato obstoječi `closed` dogodek. Ob napaki tehničnega preverjanja ni zaključka. Ponovni klik po že shranjenem zaključku je idempotenten. Obstoječa SQL omejitev ene zaključitve ostaja.

Plačilo je ločeno: odprto/neznano plačilo ne prepreči prevzema in se ne spremeni v plačano. Brez potrjenih plačil je prikaz **Plačilo ni potrjeno**. Sintetična evidenca ohrani `simulated=true`, razvojno okolje in oznako **Testni primer**; produkcijsko shranjevanje takega dogodka je zavrnjeno. Nobena migracija, pravica ali Quibi WRITE/SEND nastavitev ni spremenjena.

## Preverjanje
- Regresije so najprej reproducirale manjkajoči prehod in ročno zahtevo po invoice_checked.
- Celoten lokalni nabor: 684/684 PASS pred dodatno regresijo prepovedi sintetičnega produkcijskega prevzema; končni CI bo naveden v PR.
- TypeScript nad aktualnimi viri in ESLint brez napak. Lokalni webpack je prevedel kodo; njegov celotni TypeScript korak je dosegel pomnilniško omejitev pri vključevanju starih ignoriranih arhivov. Čisti CI build je zato ločeno obvezno preverjanje.
- Izolirani brskalniški prikaz dejanskih komponent in dejanske navigacije: 1440, 390, 350 px, brez horizontalnega prelivanja. Klik odpre zloženi cilj, ga fokusira in ohrani isti primer. Tudi neposredno ponovno odpiranje URL s hashom odpre prevzem. Gumb za prevzem je visok 48 px.
- Posnetki so **izolirane komponente**, ne prijavljena DEV aplikacija. Izolirani prikaz ne shranjuje prevzema.
- Hosted DEV SQL READ: C066482D je povezan z verificiranim nalogom 2176935 in računom 2176936. Obstaja sintetična potrditev vodje; prevzema med QA nismo evidentirali.
- Prijavljeni hosted E2E ni potrjen: Playwright se na URL primera preusmeri na `/login#prevzem`; dostop do uporabnikovega IAB odpove ob inicializaciji (`failed to write kernel assets`).
- Celoten hosted prehod s shranjenim prevzemom in osvežitvijo ostaja za uporabnikov izrecni klik. Poslovnega dogodka nismo sprožili v njegovem imenu.

## Kratek ročni preizkus
Odpri C066482D. Ob računu DELAVNICA-A-26000261 / 50,00 EUR klikni **Prevzem vozila**, nato **Vozilo prevzeto**. Po uspehu osveži stran in dashboard: isti testni primer mora ostati zaključen v ločeni testni skupini. Morebitno nepotrjeno plačilo mora ostati nepotrjeno. Noben nov Quibi dokument ne sme nastati.

## Posnetki izoliranih komponent
- [1440 px](screenshots/pickup-1440.png)
- [390 px](screenshots/pickup-390.png)
- [350 px](screenshots/pickup-350.png)

## Prebrana pravila in veščine
- `C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1/AGENTS.md`
- `C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1/CLAUDE.md`
- `C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md`
- `C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md`
- `C:/Users/Admin/.agents/skills/superpowers/systematic-debugging/SKILL.md`
- `C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md`
- `C:/Users/Admin/.agents/skills/security-review/SKILL.md`
- `C:/Users/Admin/.agents/skills/deploy-to-vercel/SKILL.md`
- `C:/Users/Admin/.agents/skills/vercel-react-best-practices/SKILL.md`
- `C:/Users/Admin/.codex/skills/playwright/SKILL.md`
- `C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md`
- Next guide: `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` v aktivnem worktreeju.

Glavni pregledani viri: `src/lib/case-work/{read,review-actions,review-policy}.ts`, `src/lib/cases/{journey,workspace,navigation}.ts`, `src/components/dashboard/{CaseWorkspace,CaseWorkPanel,CaseReviewPanel,CaseReviewForm,CaseJourney,QuibiCaseBusinessOperations,QuibiDocumentPayments}.tsx`, `supabase/migrations/20261017195305_case_work_manager_review_closure.sql` (samo branje).
