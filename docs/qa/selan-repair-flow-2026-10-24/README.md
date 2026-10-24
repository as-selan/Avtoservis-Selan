# Popravilo → pregled vodje → račun (24. 10. 2026)

## Sprememba

Isti PR #19, veja `codex/selan-p0-guided-case`. Poslovna pravila, vloge, Quibi CREATE/SEND, migracije in zasebna shramba so nespremenjeni.

- Aktivno delo: glavno dejanje »Začni delo« oziroma »Zaključi delo«. Opomba, sprememba stanja, fotografije in zamenjava mehanika so sekundarne možnosti.
- Zaključeno delo: ni več obrazcev za ponovno dodelitev ali napredek. Vodja pregleda zapiske z avtorjem in časom ter zasebne fotografije, nato izbere »Potrdi opravljeno delo«. Neobvezna opomba je zložena; vračilo zahteva razlog.
- Potrjeno delo: »Pripravi račun« odpre `#poslovni-nalog` istega primera. Tudi glavna navigacija primera upošteva pregled dela. Obstoječi račun ima povezavo za pregled; ne ponuja novega ustvarjanja.
- Fotografije: kamera, več slik iz galerije, predogled in zaporedno stiskanje/nalaganje prek obstoječega strežniškega dejanja. Ob nepotrjenem izidu ni samodejnega ponavljanja. Uspešni prenosi se ne ponavljajo v isti seriji.
- Ime mehanika je primarno, e-pošta sekundarna. Obstoječe urejanje imen ostane v Nastavitve → Ekipa z obstoječimi pravicami lastnika. Imen ne ugibamo.
- Quibi postavke in daljša navodila ostanejo dostopni v podrobnostih; med izvajanjem so navodila odprta. Fotografije so manjši predogledi s povezavo za povečavo. Podpisane povezave ostanejo kratkotrajne in zasebne.

## Dokazila in meje

- 80 testov obstoječih pravil/dejanj za delo, pregled, ekipo in navigacijo je uspelo; dodatni test ločevanja priprave od obstoječega računa je uspel (skupaj 81).
- 3 testi dejanske strežniške komponente preverjajo skrivanje obrazcev po zaključku, aktivno delo ter nedodeljen nalog in vloge.
- 24 brskalniških prikazov resničnih komponent s sintetičnimi podatki pri 1440, 390 in 350 px: brez vodoravnega preliva in napak strani. Preverjeni začetek/zaključek, dve fotografiji s predogledom in dvema klicema obstoječega dejanja, pregled in neposredna povezava na račun istega primera. Dejanja so nadomeščena s testnimi odzivi; to ni prijavljeni E2E.
- Posnetki: [mehanik 390](../selan-redesign/mechanic-390.png), [fotografije 390](../selan-redesign/photos-preview-390.png), [pregled 1440](../selan-redesign/review-1440.png), [po potrditvi 390](../selan-redesign/review-accepted-390.png). Vsi so izolirane komponente, ne posnetki prijavljene aplikacije.
- Prijavljeni E2E NI preverjen: orodje CUA odpove z `failed to write kernel assets`; ločeni Playwright se preusmeri na `/login`. Uporabnikov odprti zavihek obstaja, vendar ga orodje ne more prevzeti. Gesel/sej nismo kopirali.
- Pred spremembo je READ preverjanje QA primera A73DB6BE potrdilo `work_completed`, 2 zapiska, 1 pripravljeno fotografijo in 1 potrjen pregled. Nismo ustvarjali novega vozila, dokumenta, opombe, fotografije ali pošiljanja v DEV/Quibi.
- Osnutek, ustvarjen račun, pošiljanje, plačilo in prevzem ostajajo ločene potrditve. Naslednji klik sam ne ustvari računa. Nobenih pravic ali konfiguracij WRITE/SEND nismo omogočili.

## Kratek ročni preizkus v DEV

1. Odpri A73DB6BE ali njegov dodeljeni nalog: preveri dva zapiska in fotografijo. Ponovna dodelitev in zaključevanje ne smeta biti prikazana.
2. Ker je pregled že potrjen, izberi »Pripravi račun«. Odpre se priprava istega primera, stranke, vozila in naloga #2176933. Preveri zneske; v tem preizkusu ne potrdi ustvarjanja ali pošiljanja.
3. Na ločenem sintetičnem nalogu preveri dodelitev, začetek, opombo, dve fotografiji, osvežitev in drugo prijavljeno sejo mehanika/vodje (Realtime).
4. Zaključi delo, preveri dokazila kot vodja; preizkusi vračilo z razlogom, ponovni zaključek in pregled. To so dejanski lokalni poslovni zapisi, zato uporabi samo odobren sintetični nalog.

## Prebrana navodila in uporabljene veščine

- Projekt: `C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1/AGENTS.md`, `CLAUDE.md`.
- `C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md`.
- `C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md`, `product-designer/SKILL.md`, `security-review/SKILL.md`, `superpowers/systematic-debugging/SKILL.md`, `superpowers/verification-before-completion/SKILL.md`, `deploy-to-vercel/SKILL.md`.
- `C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/vercel/0.54.1/skills/deployments-cicd/SKILL.md`.
- Lokalne smernice Next: `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` in `use-server.md` v istem worktreeju.

## Build in objava DEV

- Runtime commit: `bbcd4fd` (isti PR #19, brez merge).
- Vercel projekt `prj_OSpIMwU9zkrcImKhGxpaq8PnrgUU`, ekipa `azalar7-langs-projects`.
- Deployment `dpl_B3CfRKX1eq5sWNGieHkJcSfxznUz`: **READY**, Preview. `npm run build -- --webpack` je uspel, TypeScript 7,5 s, celoten Vercel build 44 s.
- [Obstoječi DEV naslov](https://selan-dev-pr19-azalar7-langs-projects.vercel.app/dashboard).
- [Nespremenljivi Preview](https://avtoservis-selan-itbko67wd-azalar7-langs-projects.vercel.app).
- Lokalni scoped TypeScript in ESLint sta uspela. Lokalni build se je prevedel, vendar je root TypeScript vključil stare ignorirane arhive v `qa-visual`; ustavljen je bil samo ta lokalni build. Celoten čist build istega commita je preverjen na Vercelu. Nastavitev tsconfig nismo spreminjali.
- Dodatno 42 navigacijskih UI scenarijev pri vseh treh širinah: vidnost CTA, fokus tipkovnice, odpiranje podrobnosti iz zaznamka in brez preliva.
- Končno kontrolno READ branje DEV potrjuje isto stanje A73: `work_completed`, 2 zapiska, 1 fotografija, 1 potrjen pregled. Brez zapisov v ta primer ali Quibi v okviru naloge.

