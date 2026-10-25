# Popravek: Quibi nalog → dodelitev → popravilo → pregled → račun

## Vzrok in popravek

Po verificiranem Quibi nalogu je `quibiBusinessNextAction` usmeril na račun, `businessFormStart` pa je iz same reference naloga izbral račun. Obrazec je omogočal nadomestitev manjkajočega servisnega postopka s potrditvijo `repairCompleted`. Strežniška kontrola je preverjala samo obstoječo dodelitev; kadar dodelitve ni bilo, je pogoj preskočila.

Sedaj se obstoječi nalog brez dodelitve odpre v obstoječem razdelku `popravilo` z enim primarnim gumbom »Dodeli mehaniku« in izbiro iz obstoječe Ekipe. Dashboard vodi na isto opravilo. Ni novega obrazca, podatkovnega stanja ali dodatne potrditve. Obstoječi RPC `assign_service_case`, preverjanje org/vloge, Quibi stranke/vozila in SHA ostanejo.

Računski obrazec in njegovo samodejno nalaganje ostaneta skrita do zaključka mehanika in veljavnega pregleda vodje. Checkbox za dejanski oziroma simulirani zaključek ne more več nadomestiti tega postopka. Strežnik pri pripravi in dispatchu preveri obstoj dodelitve, `work_completed`, aktualna dokazila in sprejet pregled vodje. Obstoječi povezani računi ostanejo dostopni in ne odprejo nove izdaje; zaključeni primeri niso spremenjeni. Predhodni plačljivi pregled ima svojo obstoječo poslovno pot in ni spremenjen.

## Dejanski DEV READ

C066482D (`c066482d-0002-43c4-9090-b23833928f71`) ima verificiran Quibi nalog 2176935, stranko 405965 in vozilo 2392. Lokalno stanje je awaiting_slot_selection. Ob pregledu: 0 dodelitev, 0 invoice operacij. Opravljena so bila samo SELECT branja; nalog, odobritev, dodelitev in dokumenti niso spreminjani.

## Preverjanje

- Tri nove regresije so najprej reproducirale napačno navigacijo in obvoz brez dodelitve.
- Celoten lokalni nabor po popravku: 650/650 PASS, 0 preskokov.
- Regresije zajemajo scoped dodelitev obstoječega naloga, napačno vlogo/spremenjen SHA, odsotno dodelitev, delo v teku, zaključeno delo brez pregleda, aktualni/stari pregled, ohranjene izdane račune, dashboard in skrit računski obrazec brez QA checkboxa.
- Obstoječi izolirani browser scenarij dodatno preveri nalog na mehanikovem dashboardu, začetek dela, dve zasebni fotografiji, zaključek brez opombe, osvežitev in ista dokazila vodje pri 1440/390/350 px. Končni CI in Preview sta navedena v PR.
- Prijavljeni gostovani E2E C066482D ni potrjen. Izolirani testi dodelitve in pregleda ter browser pot niso predstavljeni kot en celoten gostovani E2E. Po prijavi mora uporabnik sam izbrati mehanika in klikniti Dodeli mehaniku; v tem preizkusu nismo zabeležili navidezne izvedbe dela ali pregleda.

Ni migracij/RLS sprememb, novih odvisnosti, sprememb WRITE/SEND, Quibi CREATE/UPDATE/SEND ali produkcijskih sprememb. PR ostaja Draft, brez merge.

## Prebrane smernice in veščine

Aktivni koren: C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1; prebrana AGENTS.md in CLAUDE.md.
C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md; C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md; C:/Users/Admin/.agents/skills/superpowers/systematic-debugging/SKILL.md; C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md; C:/Users/Admin/.agents/skills/security-review/SKILL.md; C:/Users/Admin/.agents/skills/deploy-to-vercel/SKILL.md; C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md; node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md v aktivnem korenu.
