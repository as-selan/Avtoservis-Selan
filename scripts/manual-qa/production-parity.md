# Selan: skupna koda, ločene povezave

Enaki obrazci, server actions in Quibi adapterji se uporabljajo v DEV in produkciji. Poslovni dokumenti ostanejo v Quibiju. Konfiguracija spodaj je pripravljena, ne aktivirana.

| Nastavitev | DEV | Produkcija |
| --- | --- | --- |
| APP_ENV / QUIBI_MODE / VERCEL_ENV | preproduction / dev / preview | production / production / production |
| Quibi origin (določen v kodi) | https://dev.quibi.net | https://si.quibi.net |
| Strežniški račun | QUIBI_DEV_USERNAME / QUIBI_DEV_PASSWORD | QUIBI_PRODUCTION_USERNAME / QUIBI_PRODUCTION_PASSWORD |
| Dovoljenja | QUIBI_DEV_WRITE_ENABLED; QUIBI_DEV_SEND_ENABLED=0 | QUIBI_PRODUCTION_READ_ENABLED, QUIBI_PRODUCTION_WRITE_ENABLED, QUIBI_PRODUCTION_SEND_ENABLED; vsak posebej 1 šele po odobritvi |
| Samodejni prevzem | QUIBI_DEV_INTAKE_SYNC_ENABLED | QUIBI_PRODUCTION_INTAKE_SYNC_ENABLED |
| Journal | quibi_dev_operation_journal | quibi_production_operation_journal |
| Prejemnik | QUIBI_DEV_TEST_RECIPIENT oziroma QUIBI_DEV_TEST_RECIPIENTS, samo odobren seznam | sveže preverjen dejanski naslov stranke |

Vsako okolje ima svoje NEXT_PUBLIC_SUPABASE_URL, javni anon ključ, strežniški SUPABASE_SERVICE_ROLE_KEY, PUBLIC_APP_ORIGIN in dovoljene Auth redirect URL-je. Produkcija dodatno zahteva SELAN_PRODUCTION_SUPABASE_PROJECT_REF in SELAN_DEV_SUPABASE_PROJECT_REF: morata biti različna; produkcijski URL mora kazati na navedeni produkcijski projekt. Obstoječa DEV baza ni produkcijska baza. Ne prenašajte DEV članstev, povezovalnih ID-jev, QA odobritev ali dokumentov.

QUIBI_INTAKE_SYNC_ACTOR_ID mora biti aktiven owner/admin v svoji organizaciji in bazi. Vse občutljive vrednosti ostanejo strežniške. Lokalna QA dovoljenja niso veljavna na gostovanem okolju ali v produkciji. Neznani CREATE/SEND ostanejo zaklenjeni. Odobritev stranke je ločena od dostave; termin ni umetni pogoj za poslovni nalog. Račun zahteva dejansko dokončanje in datum storitve.

## SQL za pregled, brez namestitve

20261015120000_quibi_environment_parity.sql dopolni produkcijski journal z istimi vrstami operacij, enkratnim CREATE in zaklepanjem SEND/UPDATE; skupna RPC za vozilo in dodelitev izbereta okolje iz preverjene povezave. Obstoječi podatki, članstva, politike RLS in zasebni bucket se ne prepisujejo. Zahteva že obstoječe migracije unified_quibi_workflow, quibi_dev_business_journal, team_case_work_and_private_evidence in case_vehicle_resolution. Ne izvajajte vseh starih čakajočih migracij ali db push na slepo. Namestitev zahteva ločeno odobritev. Produkcijski indeks ostaja strožji: zavrnjeni finančni CREATE se ne odklene samodejno.

## Quibi dostava: DEV izključena, produkcija uporablja Quibi

Po novi poslovni odločitvi Gmail/SMTP-ja za Quibi DEV ne nastavljamo. QUIBI_DEV_SEND_ENABLED je privzeto izključen (vrednost 0 oziroma odsotna). Pregled dokumenta, priprava, preverjanje testnega prejemnika in READ starih statusov ostanejo na voljo. Simulirani transport je dovoljen samo v izoliranih testih; njegov rezultat ni dejanska dostava.

Produkcija uporablja obstoječi Quibi SEND/SEND_STATUS na https://si.quibi.net, brez novega SMTP-ja ali ponudnika v Selanu. Produkcijski READ/WRITE/SEND opt-in ostanejo ločeno izključeni do odobritve. Prejemnik mora biti sveže preverjen dejanski naslov stranke. Sent pomeni predajo poštnemu strežniku, ne potrjenega prejema. Neznani izid blokira ponovno pošiljanje.

Nova priložena naloga za prihodnje teste navaja online.gold100@gmail.com in tadejselan@gmail.com. Predlagana Preview nastavitev QUIBI_DEV_TEST_RECIPIENTS je njun seznam, ločen z vejico. Samodejni varnostni pregled je spremembo Vercela zavrnil zaradi starejšega navodila in obravnave priloge kot neodobrene; konfiguracija ni spremenjena. Potrebna je neposredna potrditev uporabnika. Dodajanje naslova ne omogoči dostave in ne spreminja prijavnih računov.

Pregledani dejanski hosted predpogoji migracije: unified_quibi_workflow je zabeležen kot 20261010183422, dev_business_journal kot 20261011190311 (ime 20261011210000_quibi_dev_business_journal), team kot 20261014184946 in vehicle_resolution kot 20261014212032. Potrebne tabele/stolpci, RPC in dispatch guard obstajajo; produkcijski journal ima še stare omejitve vrst operacij, ki jih pripravljena parity migracija razširi. Migracija 20261015120000 ni nameščena. Ne ponavljajte starih migracij zaradi različnih časovnih predpon.

## Supabase Auth povabila: ločena nastavitev

Authentication → Emails → SMTP Settings: lastnik zagotovi sender address/name, host, port, uporabnika, namensko geslo in overjeno domeno. URL Configuration: pravilen Site URL in dovoljena /auth/accept-invite ter /auth/callback. Povabilo pošlje samo owner po izrecnem kliku; klik povezave in nastavitev gesla sprejmeta veljavno povabilo ter preusmerita na /dashboard/mehanik. Preklicana, potekla in tuja povabila ne dajejo članstva. Privzeti SMTP dovoljuje le vnaprej pooblaščene naslove organizacije in ni dokaz zunanje dostave. Vir: https://supabase.com/docs/guides/auth/auth-smtp . Za praktični test potrebujemo odobreno povabilo in prejemnikov sprejem; danes ni poslano.

## Ostale zunanje omejitve

MyPlanly ni potrjen API; termini ostajajo ročni. AI provider ostane brez aktivacije in ne ovira Quibija; OPENAI_API_KEY in SELAN_AI_MODEL se ne nastavljata brez potrditve. Fotografije ostanejo zasebna interna dokazila v service-case-evidence; Quibi je potrdil, da API za priloge še ni na voljo; API za dodelitve ni potrjen. Enake avtorizirane interne funkcije uporabljajo obe okolji.
