# PR #19 – poenostavitev delovnega prostora

**Aktualni Preview:** https://selan-dev-pr19-azalar7-langs-projects.vercel.app/dashboard

Runtime commit `df822ac502b988f97f267092e66b17bc33006d0a`; deployment `dpl_9gTZUf4ndNcmVrm5qNChNdVz6UyF`, READY. Preverjena ekipa `team_2OC48hyth331W4Z02Cei2ZTL` / `azalar7-langs-projects`, projekt `prj_OSpIMwU9zkrcImKhGxpaq8PnrgUU` / `avtoservis-selan-dev`. Stabilni DEV alias kaže na ta deployment. Kasnejši commiti vsebujejo le dokazila/teste/navodila.

## Kaj sedaj opravi Selan

Štiri skupine, eno iskanje in en vnos na dashboardu. Primer pokaže zahtevano delo, pripravljene podatke in eno naslednje opravilo; brez velikih sedmih faz. Sekundarni podatki ostajajo zloženi. Mehanik vidi vozilo, delo in neposredna začetek/zaključek.

Predračun ohrani vse zahtevane storitve. Zanesljiva ujemanja uporabijo katalog; ostale postanejo proste storitve z manjkajočo količino/ceno. Ni prepisovanja stranke/vozila ali obveznega ID-ja dokumenta. Potrjen pregled istega zahtevka se po uspešnem CREATE ponovno uporabi. Odločitev stranke ostaja ločena.

## Dejanski Quibi DEV preizkus – 22. 10. 2026, 19:17 UTC

[Strojni rezultat iz Vercel build loga](quibi-dev-free-result.json).

Sintetični primer `c7156f6e-76ca-48b3-8cc0-202610220040`, ista preverjena sintetična stranka/vozilo kot predhodni DEV preizkus. Tri PROSTE vrstice: servis vozila, pregled pred tehničnim, pregled zavor; izrecne operatorske testne bruto cene 30/20/15 EUR, količine 1. To niso ocenjene ali katalogizirane servisne cene.

| Dokument | Dejanski ID | Številka | Znesek | Stanje |
|---|---|---|---|---|
| Predračun | 2176929 | 281/2026 | 65,00 EUR | verified, povezan |
| Delovni nalog | 2176930 | 271/2026 | 65,00 EUR | verified, povezan |
| Račun | 2176931 | DELAVNICA-A-26000260 | 65,00 EUR | verified, povezan |

CREATE, ponovno branje vsebine/cen/enot/DDV/identitete in povezava dokumentov so dejanski API/DB postopki. Interni pregled in **izrecno sintetična QA-SIM odobritev** sta shranjena prek obstoječih RPC. Nobene dostave, dejanskega odgovora stranke, dejanskega popravila ali plačila nismo potrdili. Račun uporablja izrecno sintetično predpostavko zaključenega dela; mehanikova prijavljena pot ni del tega API preizkusa.

### Popravljena integracijska napaka

[Quibijeva dokumentacija](https://navodila.quibi.net/za-razvijalce/) za proste vrstice navaja `cenaZDDV` kot neto ceno enote. Dejanski DEV je to polje prezrl in shranil ničle. `cena` ni pomagala; izrecni `cenaBrezDDV` je popravil isti znani sintetični predračun 2176927 na 65,00 EUR. Skupni gradnik sedaj v nespremenljiv zahtevek vključi **oba enaka neto podatka**, zavrne nasprotujoča podatka in še vedno preveri dejanski rezultat. Nato je NOV CREATE 2176929 uspel brez popravljanja dokumenta.

Prvotni diagnostični sintetični primer `...0030`: predračun 2176927 je po preverjenem popravku verified, začetni neuspeli cenovni UPDATE ostaja uncertain kot revizijska sled; prvotni nalog 2176928 ostaja uncertain zaradi cenovne razlike in ni veljaven dokaz uspeha. Novega CREATE za ta isti nalog nismo ponavljali. Uspešna celotna dokumentna veriga zgoraj pripada ločenemu, jasno označenemu končnemu testnemu primeru `...0040`.

`GET /api2/sifranti` HTTP 500 ostaja težava ponudnika; razpoložljivi cenik ne vsebuje vseh treh zahtevanih storitev. Fallback prostih postavk omogoča nadaljevanje brez ugibanja cen. [Pripravljeno tehnično sporočilo, ni poslano](../selan-estimate-workspace/quibi-developer-message.md).

Quibi DEV po pojasnilu uporabnika ne pošilja e-pošte. SEND je v novem Previewu 0, WRITE DEV 1 po obstoječi odobritvi; produkcijska in lokalna WRITE/SEND sta 0. Pošiljanje 277127 ni ponovljeno. Dokumenti niso označeni kot poslani.

## Preverjanje in posnetki

- 34 testov pogodb, priprave, prenosa vrstic in poslovnih dokumentov: uspešno, tudi cenovni polji, zaokroževanje, zaščita pred dvojnim CREATE, neznani izidi in napačna identiteta.
- 15 testov naslednjega opravila, 11 testov vrste primerov in 10 urejevalnika: uspešno.
- TypeScript trenutnih projektnih izvorov in gostovani Next build: uspešno. Lokalni začasni TS config izključi samo generirane deployment arhive iz preverjanja. ESLint spremenjenih komponent in Quibi poti: uspešno.
- [42 scenarijev primera](../selan-p0-2026-10-22/browser-results.json) pri 1440/390/350: uspešno; en CTA, pravilni obrazci, fokus, zaznamki, brez prelivanja.
- [Nadzorna plošča in mehanik](shell-browser-results.json): 6 prikazov pri 1440/390/350, brez prelivanja/napak strani; začetek ter zaključek z opombo sta preverjena v sintetičnem UI; interakcije uporabljajo sintetične nadomestke strežniških dejanj.
- [Urejevalnik predračuna](../selan-estimate-workspace/browser-results.json): 1440/390/350, ena običajna forma, ohranjene storitve, pregled proste vrstice, brez ponovnih checkboxov, brez prelivanja.
- [Dejanska prijavna stran novega Previewa](preview-login.png): zaščiteni dashboard preusmeri neprijavljeno testno sejo na /login. To ni Vercel zaščitna prijava.

**Celoten prijavljeni uporabniški E2E ostaja NEPREVERJEN.** Uporabnik ima svojo prijavljeno IAB sejo; njene avtomatizacijske povezave ni mogoče uporabiti. Ločen Playwright nima seje. Ni dokazov o dejanski oddaji novega spletnega povpraševanja, mehanikovem shranjevanju opomb/fotografij in zaključku prek prijavljenega brskalnika v tej izvedbi. API dokumentna veriga in izolirane UI interakcije zgoraj so ločena dokaza.

Evoca raziskava je bila 23. 10. najdena in prebrana na `C:/Users/Admin/avtoservis-selan/docs/evoca-rea-ux-audit.md`. Notranji B2B UI ni preverjen; promocijskih zaslonov ne kopiramo. Upoštevani so predlogi za en primarni korak, manj podvojenega vnosa in ločen mobilni pogled. Ni novih odvisnosti, migracij, sprememb RLS/auth, produkcijske objave ali merge.

[Navodila za Tadeja](../../tadej-p0-postopek.md).

## Prebrana pravila in uporabljene veščine

Aktivni worktree: `C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1`.
Prebrano v njem: `AGENTS.md`, `CLAUDE.md`, `node_modules/next/dist/docs/01-app/02-guides/forms.md`, `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`, `docs/dashboard-v1-preservation.md`; globalno `C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md`.
Veščine pod `C:/Users/Admin/.agents/skills/`: `ai-orchestrator/SKILL.md`, `product-designer/SKILL.md`, `security-review/SKILL.md`, `superpowers/dispatching-parallel-agents/SKILL.md`, `superpowers/verification-before-completion/SKILL.md`, `deploy-to-vercel/SKILL.md`.
Vercel: `C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/vercel/0.54.1/skills/deployments-cicd/SKILL.md`, `C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/vercel/0.54.1/skills/env-vars/SKILL.md`, `C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/vercel/0.54.1/skills/vercel-cli/SKILL.md`; Supabase: `C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md`.

## Nadaljevanje 23. 10. 2026

TEST/QA-SIM primeri so ločeni od vseh štirih glavnih števcev in zgodovine dnevnega dela; ostanejo v zaprtem testnem razdelku. Naslednja dejanja na glavnih vrsticah so kratka. Po pregledu predračuna se ne prikazuje več zastarelo navodilo za dopolnitev manjkajočih cen. Quibi logika/WRITE/SEND in že ustvarjeni dokumenti niso ponovno izvedeni.

[Točna ovira in kratek ročni E2E za Tadeja](manual-e2e-2026-10-23.md). 26 dodatnih ciljnih testov uspešno; preverjena Realtime objava vseh petih operativnih tabel, brez sprememb baze. Dejanski prenos dogodkov in shranjevanje v prijavljeni seji sta nepreverjena.

Končni DEV build 23. 10.: `npm run build -- --webpack`, READY, TypeScript uspešen. Stabilni alias je preverjeno prevezan na navedeni deployment. Diagnostični smoke skripti so v tej objavi izključeni; nobene nove Quibi operacije. Spremembe aplikacije so v commitu df822ac, nadaljnji commit posodobi samo dokazila.
