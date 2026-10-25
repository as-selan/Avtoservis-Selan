# Selan P1 – odpravljanje NO-GO blokad

Izhodišče: `00d0dc8`, PR #19, base `codex/selan-pr18-manual-qa`. Omejen popravek dostopnosti neobveznega predhodnega pregleda; brez sprememb RLS, Quibi zastavic, gostovane migracijske zgodovine ali dokumentov.

## Implementirani popravki

- Popravljenih vseh 18 prvotno neuspešnih testov. 2 AdministrativeFlow uporabljata izrecni QA-SIM label in še naprej zavračata navidezno pravo odobritev; 2 invoice testa dobita omejene mocke novih date odvisnosti, preverjata ISO payload, READ brez dispatcha in zaščito že izdanega računa; 12 testov realno izvede `EstimateComposer` preko javnega wrapperja, brez indeksov hookov, ter preveri locked CREATE, pregled pred enkratnim CREATE, ohranitev vrstic, READ retry, izrecno zgodovino, edit invalidation in neznano AI količino; 2 SEND testa preverita odsotnost dispatch obrazca ob izključenem SEND in ohranjen status-only pregled starega poskusa.
- Širša avtomatska testna discovery vključuje vse `src/**/*.test.ts`, `scripts/**/*.test.mjs` in root `next.config.test.ts`: `npm run test:unit`. Ni izključenega starega testa. Nov zagon je odkril še starejše pričakovanje samodejnega demo fallbacka v next config testu; test zdaj preverja dejanski fail-closed način brez demo podatkov. Produkcijskega configa nisem spreminjal.
- Code checks, isolated DB in browser CI zdaj pokrivajo trenutni head/base in predlagani main target. Code checks uporablja celoten offline nabor in Node 24, build webpack kot preverjena lokalna pot. V isolated full-chain manifest so dodane štiri prej manjkajoče aktivne migracije; regresija primerja manifest z vsemi aktivnimi SQL datotekami. Varnostni loopback/Docker/credential guardi ostanejo.

## Kanonične migracije

| Prejšnja lokalna oznaka | Kanonična že izvedena DEV oznaka |
|---|---|
| 20261024120000 | 20261024094647 |
| 20261024123000 | 20261024100001 |
| 20261024124000 | 20261024100417 |

`supabase/migration-version-map.json` vsebuje imena, SHA-256 Git/LF vsebine in normalizirani SHA-256 primerjave z gostovano zgodovino. Vse tri se ujemajo s svežim READ na DEV. Git zazna 100% rename; SQL blob ni spremenjen. Nov test preveri tako bajtno vsebino po normalizaciji Git koncev vrstic kot neodvisne DEV fingerprints in odsotnost dvojne izvršljive verzije. Zadnja migracija nadgradi prvi dve: identitetni input/next_action in NULL validacija ostanejo.

READ-only pg_catalog preverjanje: auto_* stolpci obstajajo, automatic_offer_job/pending_automatic_offers sta service-role-only, save_automatic_offer_rows je authenticated z obstoječo notranjo owner/admin kontrolo. Vseh 25 public tabel ima RLS. Photo bucket je privaten, meja 786432 B. Gostovana baza in zgodovina se nista spremenili.

Na DEV **ne izvajati SQL ponovno** in ne izvajati db push/repair. Pred uporabo na drugem okolju primerjati njegovo zgodovino in vsebino s kanonično preslikavo; če ima stare lokalne oznake že označene kot izvedene, je potreben posebej odobren načrt uskladitve, ne replay. Trenutno ni dokaza, da je katerakoli druga gostovana baza uporabljala stare tri oznake; zato ne trdim univerzalne skladnosti nepreverjenih okolij.

## Git izvor in predlog integracije

158 commitov med PR #18 head `b7dcb60` in trenutno #19 base `a9bc369`: vsi avtor Ales Zalar, 0 merge commitov. Seznam vseh je v `git-base-158-commits.txt`, vse spremenjene poti v `git-base-158-files.txt`.

Obseg: objavljene cene/predhodni pregled, zaščita spletnega vnosa, Quibi READ in okolja, journal CREATE/UPDATE/SEND in reconciliation, avtomatska sinhronizacija identitete, zgodovina/ceniki, team/repair/private photos, pregled vodje/račun/prevzem/plačilo, password recovery/session proxy, Realtime in migracijska uskladitev (`dbd7585`). To so funkcionalne odvisnosti sedanjega Selana, ne dodatni nepovezani projekt. Med potmi ni novega produkta ali MyPlanly integracije. Demo/legacy poti so zgodovinske združljivostne poti in niso razlog za odstranitev varnostnih kontrol. Auth/recovery spremembe so del širšega kumulativnega obsega, ne samo kozmetični del PR #19.

Origin main ostaja ff84c65; noben od teh 158 commitov ni njegov prednik. Main je prednik trenutnega heada. PR #18 sam ne vključuje dodatne osnove manual-qa. Cherry-pick samo 55 commitov #19 na main bi izgubil potrebno osnovo.

**Najčistejši predlog:** po izrecni odobritvi retargetati isti PR #19 na main in ga obravnavati kot kumulativni integracijski PR. S tem ni novega PR ali prepisovanja zgodovine; obseg main→head mora biti jasno naveden, odvisne PR pa kasneje usklajene. Alternativa je zaporedna integracija celotne zložene verige z dodatno manual-qa osnovo, kar zahteva več koordinacije. Ciljne veje nisem spremenil. Linearna zgodovina in konfliktna združljivost sta tehnično primerni; odobritev kumulativnega obsega še ni podana.

## Vercel – nespremenjena zunanja blokada

Sveži dovoljeni metapodatki: naš projekt avtoservis-selan-dev / prj_OSpIMwU9zkrcImKhGxpaq8PnrgUU v azalar7-langs-projects ima `link=null` in nima Git Production Branch. Njegov obstoječi DEV Preview je ročna objava; sam Git merge na tem projektu ne sproži produkcije.

Drugi projekt avtoservis-selan v ekipi avtoservis-selan s trenutno prijavo še vedno vrne **403**. Najden GitHub Production deployment 6446742673 je zgodovinski **failure**, ne dokaz trenutno delujoče produkcije. Zato dejanskega današnjega produkcijskega projekta ni mogoče zanesljivo določiti iz teh metapodatkov. Pregled repository webhookov vrne 404 z izrecno informacijo, da manjka `admin:repo_hook`; to ni dokaz, da webhookov ni. Pravice niso obite, nobena vrednost skrivnosti ni zahtevana.

Pooblaščeni uporabnik naj preveri in posreduje samo neskrivne podatke:

1. V Vercel odpre ekipo avtoservis-selan, projekt avtoservis-selan → Settings → Git. Preveri povezani repository `as-selan/Avtoservis-Selan` in **Production Branch**. Zabeleži team/project ID ter ime veje.
2. V istem projektu pregleda Deploy Hooks: imena, ciljne veje in aktivnost. Ne kopira celotnih hook URL-jev, ker vsebujejo poverilnice. Pregleda tudi druge projekte, povezane z istim repozitorijem, in avtomatske production deployment nastavitve.
3. Kot GitHub repo admin odpre Settings → Webhooks in GitHub Apps/Vercel povezavo. Preveri aktivne push/deployment povezave in morebitne workflowe, ki kličejo deployment. Deli samo stanje/ime integracije in ciljno vejo, brez URL-tokenov ali secrets.
4. Potrdi izrecen odgovor: kateri projekt je dejanska produkcija in ali push/merge v main avtomatsko sproži produkcijo. Nastavitev v tej nalogi ne spreminja.

Dokler tega ni, ostaja **NO-GO za merge**. Ne povezovati našega DEV z Gitom in ne spreminjati drugega projekta kot obvoz.

## Preverjanje in omejitve

Offline nabor: **622/622 PASS, 0 FAIL, 0 skipped**; vključuje prvotnih 594 testov in širšo discovery ter štiri nove migracijske regresije. `npm run lint`, root `npx tsc --noEmit` v čistem izvozu in lokalni `npm run build -- --webpack` so PASS (exit 0). Dodaten TypeScript pregled aktivnega drevesa je v prilogah. Build ima opozorilo o več lockfilih zaradi lokalnega izvoza pod QA mapo, ne napake aplikacije. Rezultati so v `verification.json` in logih. CI na novem SHA po pushu se spremlja posebej; lokalni PASS ne pomeni, da so DB/browser CI jobi že uspešni. Lokalni Docker daemon še ni na voljo; ni lokalnega hosted DB replaya. Na novo vključeni isolated DB/browser workflowi tečejo samo z disposable Docker/loopback podatki in brez hosted secrets. Njihovega rezultata ne enačiti z offline unit testi; morebitni FAIL/BLOCKED se poroča posebej.

Prvi popravek ni spremenil UX P1. Naknadni browser CI je odkril in popravil omejeno vidnost neobveznega predhodnega pregleda (spodaj); cene in dokumenti ostajajo nespremenjeni. REA 8/8 na 00d0dc8 je predhodni dokaz, ne nov prijavljeni E2E te spremembe. Quibi CREATE/UPDATE/SEND, produkcijska objava, merge, history repair in retarget niso izvedeni.

## Pravila in veščine

Prebrano: aktivni AGENTS.md in CLAUDE.md, `docs/qa/selan-p1-final-00d0dc8/REPORT.md`, `C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md`, lokalni Next `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`.
Uporabljeno: `C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md`, `C:/Users/Admin/.agents/skills/superpowers/systematic-debugging/SKILL.md`, `C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md`, `C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md`.

## Nadaljevanje 25. 10. 2026

Na `2fe0a06` sta dejansko uspešna GitHub Code checks (run 40118409435: 622/622, lint/TS/build) in Isolated DB tests (40118409368: M3/M4, owner race/concurrency, vse aktivne migracije, Quibi customer/vehicle RLS, predhodni pregled in web budget). Browser run 40118409316 je pred zagonom brskalnika zavrnil zastarel seed z `public intake RPC: validation_failed`: seed ni vseboval obvezne e-pošte.

Seed zdaj vsebuje popolno sintetično spletno povpraševanje. Nov test izvrši dejansko web validacijo nad dejanskim seed objektom in preveri, da manjkajoča e-pošta ostane zavrnjena; anon RPC kontrola ostane. Spletni browser scenarij izpolni nove obvezne podatke. Dve stari browser pričakovanji sta usklajeni z že potrjenim UI: Naslednje opravilo namesto odstranjenega seznama faz in mehanikov lastni dashboard namesto prepovedi vseh dashboardov. Imenik strank ostaja nedostopen mehaniku.

Bootstrap obeh disposable Supabase CI skript ne izpisuje več izhoda `supabase start`, ki lahko vsebuje ključe začasnega sklada; izhod ostane samo v začasni CI mapi in ni del artefaktov. Noben hosted ključ ni bil pridobljen. Lokalni offline nabor po popravku: **623/623 PASS, 0 FAIL, 0 skipped**. Ponovljeni browser CI je treba oceniti na novem SHA; ta dodatek ga še ne označuje kot uspešnega.

## Nadaljevanje browser CI (25. 10.)

Na d69874a Code checks in izolirana DB preverjanja uspejo. Browser CI 40143974596 je dejansko izvedel 34 scenarijev: 9 PASS, 17 FAIL, 8 že obstoječih preskokov. To ni potrjen E2E. Preostali popravki: aktualni poslovni lokatorji in odpiranje zloženih podrobnosti; popolni spletni podatki; ločeni nepovezani stranki za preizkus urejanja; preverjanje internih statusov z READ izključno na disposable loopback DB; pravilna pot sintetičnega Quibi vozila /api2/vozila/index/2001. Dodan samostojen regresijski test dejanskega fixture strežnika.

Odkrita je tudi omejena napaka produkcijske kode: začetek neobveznega predhodnega pregleda je bil filtriran iz podrobnosti. Zdaj je dostopen v new/preparing_offer pred predračunom oziroma nalogom; ne dodaja opravila v fazi računa. Regresija preverja vse izključitvene pogoje. Nobena cena, dovoljenje ali Quibi dokument ni spremenjen. Predhodni REA 8/8 ne pomeni ponovljenega prijavljenega E2E te spremembe.

Lokalno: celotni offline nabor 624/624 PASS (0 preskokov), nato nov samostojni READ fixture test 1/1 PASS. Skupaj 625 uspešnih preverjanj; celotno novo discovery mora potrditi še CI. Aktualne rezultate CI je treba preveriti po pushu. Produkcijski sprožilec ostaja nepreverjen zaradi 403, ciljna veja ni spremenjena: NO-GO ostaja.

## Končna browser regresija

Na 192c244: celoten CI offline nabor **625/625 PASS, 0 FAIL, 0 skipped**, ESLint, TypeScript in produkcijski build PASS. Izolirana DB suite PASS. Browser: **25 PASS, 1 FAIL, 8 obstoječih preskokov**. Zadnji neuspeh je vidnost zgodovine termina: po potrjeni rezervaciji se primer pravilno premakne na delovni nalog, zato je referenca termina pod zloženimi podrobnostmi. 22f6af3 zdaj najprej počaka na shranjeno referenco, uporabniško odpre ustrezni razdelek in preveri vidnost. Novi CI mora potrditi končni rezultat; aktualne Actions povezave so v PR.

Predhodna dva testa dopolnitve ne zahtevata več sprejema brez Quibi identitete: po ponovni osvežitvi preverita pravilni isti primer, VIN in stanje new ter odsotnost nedovoljenega sprejema. Predračun fixture vsebuje dejansko zahtevano service_wanted; strežniška poslovna validacija ni oslabljena. 8 preskokov ni dodanih s temi popravki (mobilne ponovitve enkratnih skupnih mutacij in obstoječi Auth scenariji). Gostovani prijavljeni REA ni ponovljen.

Nedestruktivni merge-tree na 192c244: exit 0, 2035260f6e1b63aa2d745f2dcf70d99c253b6d99. Base PR ostaja codex/selan-pr18-manual-qa, Draft, brez retarget/merge. Pooblaščen uporabnik mora še vedno preveriti produkcijski Vercel sprožilec po zgornjem seznamu; 403 ni obit. **NO-GO** do te potrditve in odobritve kumulativnega integracijskega obsega.
