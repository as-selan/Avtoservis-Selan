# Selan P3 — poenostavitev postopka

## Spremembe

Odstranjenih je enajst vrst odvečnih interakcij (ne enajst korakov v vsakem primeru): potrditveno polje sprejema, potrditveno polje pregleda predračuna, potrditveno polje pregleda računa, ponovljeno polje potrditve prevzema, ločeno shranjevanje izbranih fotografij, ročni zagon READ preverjanja že ustvarjenega predračuna, navigacijski klik do aktivnega obrazca dodatni nivo menija za napredek, dodatni checkbox pred pošiljanjem, obvezno prepisovanje prevzema in obvezno prepisovanje stanja plačila.

Glavni poslovni gumb aktivnega opravila se prestavi v dosegljivo glavo primera; obrazec ostane povezan z gumbom. Kratke vrstice na nadzorni plošči ohranijo obstoječe skupine in ločitev testov. Dokumenti, podatki številčenja in daljša tehnična sporočila so pod podrobnostmi.

Mehanik lahko začne in zaključi delo brez obvezne opombe. Kamera in več fotografij iz galerije se shranijo neposredno po izbiri, zasebno, z obstoječim preverjanjem formata in velikosti. Vodja vidi ista dokazila in lahko potrdi delo ali navede en kratek dejanski razlog vrnitve.

## C066482D / Quibi 2176934 — dejanski READ

Obstoječe strežniške DEV poverilnice so bile uporabljene samo za GET v izoliranem Vercel Preview buildu; skrivnosti niso bile prenesene v lokalne datoteke. Dokument ima prazno stanje, stranko 405965, vozilo 2392, številko 283/2026 in pravilen external_id. Postavka: neto 40.97540984, prikazana bruto enota 49.99, DDV 22 %, glava 50.00.

Vzrok blokade je bila stroga primerjava vsote zaokroženih bruto postavk z glavo dokumenta: 49.99 proti 50.00. Quibi lahko najprej zaokroži neto osnovo na 40.98 in DDV na 9.02. Selan sedaj preveri obe natančno izračunani možnosti; ni uvedene poljubne tolerance enega centa. Identiteta, nespremenljiv zahtevek, postavke, enote, DDV, popust, znesek in dve skladni branji ostanejo preverjeni. Ponovno preverjanje potrjenega dokumenta je idempotentno.

READ in povezava lahko tečeta ob odprtju. Pregled oziroma odobritev se nikoli ne zabeležita ob nalaganju strani. Šele izrecen klik preveri svež dokument in zabeleži odločitev v Selanu. Za natančno določen sintetični C066 se shrani samo QA simulacija. Nobena nova strankina odobritev ali Quibi dokument ni bila ustvarjena v okviru tega preverjanja.

## Preverjanje

- Končni lokalni celotni nabor: 642/642 PASS, brez preskočenih testov. TypeScript in ESLint izvorne kode PASS. Za lokalni pregled so izključene samo ignorirane kopije deploymentov iz qa-visual; čisti CI uporablja običajne ukaze. Končni browser CI rezultat je naveden v PR.
- Dodani regresijski primeri: oba načina DDV zaokroževanja, napačen znesek zavrnjen, ponovljeni READ brez podvajanja, spremenjena vsebina zavrnjena, natančna sintetična identiteta, en klik brez potrditvenega polja ter kratek razlog vrnitve.
- Izolirani browser scenarij vključuje zasebno nalaganje dveh fotografij, začetek in zaključek dela, osvežitev, isto dokazilo za vodjo in namizni/mobilni prikaz. Končni CI rezultat je naveden v PR.
- Prijavljeni gostovani E2E ni potrjen; razpoložljivi brskalnik je na prijavi. READ rezultati niso predstavljeni kot opravljen uporabniški E2E.

## Ohranjene omejitve

WRITE/SEND, dovoljenja, RLS, preprečevanje podvajanja in dejanske poslovne odločitve ostajajo. AI brez ključa ni omogočen; opis težave ni obračunska postavka. MyPlanly ostaja ročen. Uporabnik je nato izrecno odobril odstranitev dodatnega checkboxa SEND in obveznih polj prevzema/plačila. Pošiljanje sproži samo izrecni gumb z vidnim naslovom in zneskom; strežniške pravice, pregled, dovoljeni naslovi in dnevnik preprečevanja ponovitve ostanejo. Prevzem zabeleži izrecni klik in svež Quibi READ; neplačano ali neznano plačilo ostane tako shranjeno. Nobenega avtomatskega prevzema ali pošiljanja ob nalaganju ni. Nobenega produkcijskega posega, merge ali zunanjega WRITE/SEND ni bilo.

## Prebrane usmeritve in uporabljene veščine

Aktivni worktree: `C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1`.

- `AGENTS.md`, `CLAUDE.md` v aktivnem worktreeju in globalna navodila uporabnika.
- `C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md`.
- `C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md`.
- `C:/Users/Admin/.agents/skills/superpowers/systematic-debugging/SKILL.md`.
- `C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md`.
- `C:/Users/Admin/.agents/skills/superpowers/brainstorming/SKILL.md` (zasnova določena z uporabnikovo zahtevo).
- `C:/Users/Admin/.agents/skills/security-review/SKILL.md`.
- `C:/Users/Admin/.agents/skills/vercel-react-best-practices/SKILL.md`.
- `C:/Users/Admin/.agents/skills/product-designer/SKILL.md`.
- `C:/Users/Admin/.agents/skills/deploy-to-vercel/SKILL.md`.
- `C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md`.
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`.
