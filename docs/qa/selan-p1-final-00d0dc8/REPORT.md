# SELAN P1 FINAL – tehnični pregled pred združitvijo

Datum: 24. 10. 2026. Pregledani head: `00d0dc8026eb25ec2c20862e13b2eb14d21740f4`.
PR #19 ostaja Draft. **Odločitev: NO-GO za merge v trenutnem stanju.** To ni zavrnitev potrjenega UX; razlogi so spodaj navedene tehnične in postopkovne blokade.

## Odločitev po področjih

| Področje | Rezultat | Dokaz / omejitev |
|---|---|---|
| Git veje in odvisnosti | BLOCKED | Odprta veriga PR #3–#18; osnova #19 vsebuje še 158 commitov nad headom #18. Pot integracije ni potrjena. |
| Združljivost z main | PASS | `merge-tree` in dejanska združitev `--no-commit --no-ff` v ločenem detached worktreeju: brez konfliktov; rezultat je identičen drevesu pregledanega heada. |
| Migracije | FAIL | Vse tri nove migracije so na DEV, toda pod drugimi verzijami. Trenutni seznam datotek ni neposredno združljiv z nameščeno zgodovino. |
| RLS in pravice | PASS – pregled DEV | Vseh 25 javnih tabel ima RLS; tenant/role kontrole, RPC ACL in zasebni bucket pregledani. Dinamični DB testi niso bili ponovljeni; produkcijska shema ni pregledana. |
| Vercel konfiguracija | BLOCKED | Naš Preview je READY na pravem projektu in commitu. Drugi GitHub-povezani projekt ni dostopen (403); njegove Production Branch ni mogoče potrditi. |
| Quibi integracija | PASS – DEV obseg | Pregled kode in obstoječih dokazov; identiteta, ceniki, DDV, journal in neponavljanje negotovih zapisov ohranjeni. Brez novega zunanjega API klica v tem pregledu. Produkcijski WO/invoice journal še ni pripravljen. |
| Testi in build | FAIL | Build, TypeScript, ESLint PASS; širši nabor 576/594 PASS, 18 FAIL; dodatni action/render testi 15/15 PASS. |
| UX P1 | PASS | Prebrano poročilo Cursor REA P1.2: prijavljeni DEV 8/8 PASS na 00d0dc8. Ni lastna nova E2E izvedba. |
| Produkcijska pripravljenost | BLOCKED | Nepreverjena ciljna produkcijska DB/migracije, okolje in deployment sprožilec; DEV uspeh ni produkcijsko dovoljenje. |

## Kritične ugotovitve in potrebne spremembe

### 1. Širši testni nabor ni zelen

Ukaz: vsi `*.test.ts` v `src/lib` in `src/components`, Node strip-types, `react-server` condition, obstoječi `scripts/contact-test-register.mjs`, concurrency 2. Rezultat **594 testov: 576 PASS, 18 FAIL, 0 skipped**. Celoten izpis: `tests.log`.

| Datoteka | Število FAIL | Ugotovljen vzrok |
|---|---:|---|
| `src/components/dashboard/AdministrativeFlow.test.ts:30` | 2 | Sintetični scenarij išče star label »Referenca dejanskega odgovora stranke«; UI pravilno uporablja »Referenca simulirane odločitve QA-SIM-« (`ManualEstimateHandoff.tsx:61`). |
| `src/components/dashboard/QuibiBusinessDocumentForm.test.ts:8` | 2 | VM mock vrača splošen objekt za nov import; manjka `useInvoiceDraftDates`. Izvede se TypeError »is not a function«, še preden test preveri obrazec. Nove slovenske date komponente prav tako zahtevajo ustrezen render/mock. |
| `src/components/dashboard/QuibiDevWritePanel.test.ts:22` | 12 | Testi pričakujejo vrhnji legacy `form`, njegove effecte in indekse hookov. `QuibiDevWritePanel.tsx:234` pri prepare/create zdaj vrne `EstimateComposer`. Testi ne izvedejo nove podkomponente in nimajo njenih adapterjev. |
| `src/components/dashboard/QuibiSendAvailability.test.ts:20` | 2 | Test za disabled SEND pričakuje onemogočen gumb; obstoječi `QuibiBusinessSend.tsx` pravilno vrne samo obvestilo, kadar SEND ni omogočen in ni zgodovinskega poskusa. Rezultat je undefined namesto starega `disabled=true`. |

To so v pregledanih primerih zastarele testne predpostavke/missing mocki glede na spremembe PR #19, ne dokaz odpovedi teh poslovnih dejanj v aplikaciji. Vseeno gre za resničen FAIL testne zbirke. Pred merge je treba posodobiti teste na veljavni javni UX in poganjati dejanske podkomponente; ne odstraniti poslovnih/varnostnih preverjanj ali zgolj izključiti testov. Prejšnjih 487 uspešnih testov ni predstavljalo celotnega tega širšega nabora.

### 2. CI tega trenutno ne zazna

`.github/workflows/code-checks.yml:10` ne vključuje push veje `codex/selan-p0-guided-case`; `pull_request.branches` ne vključuje trenutne base `codex/selan-pr18-manual-qa`. Zato Code checks niso del trenutnega PR statusa. Tudi offline testni koraki tega workflowa izvajajo le izbrane starejše skupine, ne celotnega novega Quibi/component nabora. Isolated DB/browser workflowa prav tako nista nastavljena za trenutno head/base kombinacijo.

GitHub pri 00d0dc8 kaže SUCCESS le za Vercel in Vercel Preview Comments. Vercel povezava kaže drugo ekipo/projekt. To ni dokaz uspešnih testov pravilnega DEV. Pred združitvijo vključiti ustrezne branch dogodke in reproducibilen celoten nabor; na voljo morajo biti rezultati za točno pregledani SHA. Pravil CI nisem spreminjal.

### 3. Različne verzije istih migracij

PR #19 doda samo spodnje tri SQL datoteke. Vsebina vseh treh se ujema z zgodovino DEV po odstranitvi komentarjev, presledkov in normalizaciji velikosti črk; primerjava ne nadomešča PostgreSQL replay testa.

| Datoteka v repozitoriju | Že izvedena DEV verzija | Vrstni red |
|---|---|---:|
| `20261024120000_automatic_offer_drafts.sql` | `20261024094647_automatic_offer_drafts` | 1 |
| `20261024123000_save_automatic_offer_edits.sql` | `20261024100001_save_automatic_offer_edits` | 2 |
| `20261024124000_automatic_offer_identity_and_notifications.sql` | `20261024100417_automatic_offer_identity_and_notifications` | 3 |

**Na DEV ni treba ponovno izvajati teh treh vsebin.** Prva vsebuje ne-idempotenten `ADD COLUMN` in `CREATE FUNCTION`; slepo izvajanje pod lokalno oznako bi naletelo na že obstoječe objekte. Varna predlagana rešitev pred merge je po odobritvi uskladiti imena teh treh lokalnih datotek z že izvedenimi DEV verzijami, ohraniti vsebino in nato ponoviti primerjavo/replay. Alternativa zahteva izrecno odobreno uskladitev zgodovine. V tem pregledu nisem preimenoval datotek ali popravljal gostovane zgodovine.

Preostalih 29 lokalnih verzij je v zgodovini DEV. Pri `20261011190311` in `20261017195305` se razlikuje le shranjeno ime (vključuje starejši izvorni timestamp); verzija in normalizirana vsebina se ujemata. Foundation se ujema po upoštevanju tega, da shranjene posamezne izjave nimajo zaključnega podpičja; to ni ugotovljena shematska razlika. Ostalih 28 SQL vsebin se ujema neposredno z uporabljeno normalizacijo. Ni razloga za ponovno izvajanje že nameščenih zgodovinskih migracij.

## Git zgodovina in neposredni merge

- Lokalni `main` in sveže pridobljeni `origin/main`: `ff84c65892f3213f5b3c9a9233784152e0312da4` (invite-only auth).
- PR #19 base `codex/selan-pr18-manual-qa`: `a9bc369`; head `00d0dc8`; 55 commitov in 411 datotek proti base.
- Proti `origin/main` je head **275 commitov naprej, 0 zadaj**, spremeni 843 datotek. Gre za bistveno širši obseg od samega PR diff-a #19.
- PR #18 head je `codex/selan-manual-estimate-v1` / `b7dcb60`; njegov base je `codex/selan-v1-test-release`. PR #19 base je 158 commitov nad tem headom. Zato »najprej merge #18« sam po sebi ne vključi vseh predhodnih sprememb.
- PR #3 ima base main; #4–#18 tvorijo odprto zaporedje odvisnih vej. #1 in #2 sta merged. Brez izbire potrjenega kumulativnega cilja ne spreminjati base-ov ali združevati na slepo.
- **Ali mora biti najprej merged #18? Tehnično ne:** neposreden merge celotnega heada #19 v trenutni main vključuje prednike brez konflikta. Pri ohranitvi zloženih PR pa je treba najprej pregledati/integrirati vso odvisno verigo in dodatno osnovo manual-qa. V tem pregledu ni bilo retargeta ali merge na GitHub.
- Izolirana simulacija: `qa-visual/final-review/merge-main`, detached HEAD na origin/main; `git merge --no-commit --no-ff 00d0dc8` exit 0, brez unmerged poti. `git write-tree` in `00d0dc8^{tree}` sta oba `4d6ccdb8aef9f65d7ac6632ff8c2077694c2a44f`. Build je bil izveden na tem združenem drevesu, ne na drugem branchu. main ni premaknjen. Po gradnji/preverjanjih je bil `merge --abort` uspešen; izolirani detached worktree je čist.

## Obseg in podatkovne odvisnosti

411 datotek: 278 docs/QA dokazov, 109 src, 20 scripts, 3 migracije, 1 browser test. Proti base ni spremembe dependencies, lockfila ali auth/RLS temeljev. V pregledanem diff-u ni potrjene nepovezane funkcionalnosti. Velik del obsega so posnetki QA; deduplikacija dokazov je neobvezna prihodnja higiena, ne razlog za novo UX prenovo.

`EstimateComposer` je običajna priprava; legacy panel ostaja za druge operacije. Podobno legacy local-work-orders migracije ostajajo v arhivu, niso del aktivnega replaya in jih za neposredno case → Quibi pot ne smemo namestiti. Stara pot preko `work_orders` je ohranjena kot združljivostna veja; DEV uporablja service_case_assignments in journal. Nobene arhivske ali pending migracije ne obravnavati kot potrebno samo zato, ker datoteka obstaja.

Na novi shemi so prisotni `offer_preparations.auto_*`, RPC automatic_offer_job/pending_automatic_offers/save_automatic_offer_rows, pripravljeni next_action in timestamp trigger. Novi postopki uporabljajo obstoječa service_request stanja; auto_state opisuje pripravo osnutka, ne odobritve ali plačila.

## RLS, pravice, varnost

READ-only pregled DEV `verxxsjbewmkgoxwqvxo`:

- Vseh **25 public tabel ima RLS**. Offer draft SELECT uporablja org in vloge; save RPC preveri auth.uid(), aktivno owner/admin članstvo, status primera, run in expected updated_at. Service-role automatic job preveri service_role in aktivnega actorja iste organizacije. Funkciji automatic_offer_job/pending_automatic_offers nista izvršljivi za anon/authenticated.
- Quibi journali imajo org-scoped SELECT brez uporabniških INSERT/UPDATE policy. DEV journal ima UNIQUE org/kind/local_entity, unique external_id/send_id, guard trigger in partial unique business-create-per-case. Neznan izid ostane uncertain; nov CREATE/SEND se ne ponovi avtomatsko.
- Mehanikova vidnost je omejena s can_read_case_work. Fotografije: bucket service-case-evidence je privaten, JPEG/PNG/WebP, meja 786432 B. Realtime publikacija vsebuje vseh pet tabel, ki jih posluša aplikacija.
- Administratorski vehicle CREATE je razširjen samo v gostovanem DEV. Produkcijski owner guard ostane, admin ga ne obide. Popravki/link uporabljajo preverjeno identiteto in optimistic concurrency. Ime mehanika piše samo preverjena owner akcija, le full_name, po org/member preverjanju; email/membership se ne prepisujeta.
- Supabase advisor nima ERROR ugotovitev v vrnjenem naboru; opozarja na 2 anon in 25 authenticated SECURITY DEFINER funkcij ter izključeno leaked-password protection. Anon completion funkciji sta namenoma token-based; dostopnost RPC ni sama po sebi RLS obvoz. Role/org/token checks so pomembni in ostajajo. Nastavitve Auth nisem spreminjal. To ni dokaz penetracijskega testa vseh RPC.
- Pregled vzorcev skrivnosti v **2303 zgodovinskih tekstovnih blobih vseh dosegljivih refov: 0 zadetkov** za izbrane OpenAI/GitHub/AWS/Supabase secret/private-key vzorce in service-role JWT. Sken ni jamstvo za poljubno skrivnost, sliko ali personal data. Vrednosti poverilnic niso bile izpisane ali shranjene.

## Vercel in produkcijski sprožilec

Pravilni projekt: team `azalar7-langs-projects`, project `avtoservis-selan-dev`, ID `prj_OSpIMwU9zkrcImKhGxpaq8PnrgUU`.

- Stable alias: https://selan-dev-pr19-azalar7-langs-projects.vercel.app
- READY deployment: `dpl_HKfeyY49p1DRhA7rimrHnSfSBqg6`, SHA `00d0dc8026eb25ec2c20862e13b2eb14d21740f4`, target ni production.
- Immutable: https://avtoservis-selan-k8qpjjmwu-azalar7-langs-projects.vercel.app
- Project API: `link=null`, ni nastavljene Git Production Branch, target je samo preview. **Na tem projektu sam Git merge ne sproži avtomatske objave.**
- 18 projektnih env zapisov je samo za Preview; noben Production/Development zapis ni bil vrnjen. Pregledana so imena/tipi/targeti, ne vrednosti. Credential imena so sensitive (Quibi username/password, service role); ni OPENAI_API_KEY. Imena lokalnih override nastavitev so prisotna, njihove vrednosti niso bile preverjene – prisotnost imena ne pomeni vklopa. Pipeline potrebuje eksplicitno ločeno produkcijsko konfiguracijo.
- GitHub Vercel check pripada ekipi/projektu `avtoservis-selan/avtoservis-selan`, ne zgornjemu projektu. Poskus branja nastavitev drugega projekta s trenutno CLI identiteto vrne **403**. GitHub ima tudi starejši Production deployment na SHA `7822671...`. Njegove trenutne Production Branch, env, hooks in avtomatskega vedenja ob merge ni mogoče potrditi s tem dostopom.
- **Odgovor za celoten repozitorij »ali merge sproži produkcijo« je BLOCKED.** Dokler skrbnik ne preveri druge integracije in morebitnih hooks, ne sklepati, da je merge varen pred samodejno produkcijo. Ne spreminjati povezave ali lastništva v okviru tega pregleda.
- Samodejni approval review je zavrnil zahtevo za `decrypt=true` na celotnem env seznamu zaradi možnosti zajema skrivnosti. Zahteva se ni izvedla; nisem je obšel. Za sklep so uporabljeni samo dovoljeni metapodatki; dešifrirane vrednosti niso potrebne za trenutno NO-GO odločitev.

## Quibi in ohranitev poslovne funkcionalnosti

Pregledane so okoljska politika, transport, journali, party matching, dokumentne akcije, invoice/source verification, SEND reconciliation, katalog, imena in Realtime. Brez novega Quibi READ/CREATE/UPDATE/SEND v tem pregledu; obstoječi DEV dokazi se ohranijo. GET katalog uporablja cursor po, limit do 500, arhivirano=0, preveri vrstni red/podvojitve/envelope in ne predpomni delnega seznama. Strežniški račun/origin scope cache je 900 s. Dejanske postavke/cene/DDV in dokumentna identiteta se pred dispatch ponovno preverijo; proste postavke ne izmišljajo cene.

| Funkcionalnost | Ohranitev v pregledanem drevesu / omejitve |
|---|---|
| Spletni + ročni vnos | Oba kličeta obstoječo server automatic intake pot; persistent claim/finish draft. |
| Identiteta in osnutek | Fingerprint, tenant, customer/vehicle linkage, persistent auto_draft, stale-run zaščita. READ-only nadaljevanje je odvisno tudi od obstoječe write-gated avtomatske sinhronizacije; izklop WRITE lahko blokira tudi novo avtomatsko pripravo, ne pa že shranjenih podatkov. |
| Predračun in odobritev | Osnutek, dejansko ustvarjen dokument, interni pregled in dokaz odločitve ostajajo ločeni. QA-SIM je izrecen DEV tok. |
| Nalog / račun | ID/SHA/reference in source lines vezani na isti primer. Pred računom dejanski zaključek in veljaven pregled vodje; CREATE samo izrecno in z revalidacijo. |
| Mehaniki / opombe / fotografije | Obstoječe service_case_* tabele, privatni bucket, dodelitev/statusi, manager-review lock. |
| Prevzem in plačilo | Closure potrebuje dokaz prevzema in payment-handling reference; branje Quibi payment podatkov ne ponaredi plačila. |
| Realtime, imena, TEST, datumi | Publikacija preverjena; full_name pred email, TEST ločen; SI prikaz, ISO vrednosti. Datumi osnutka so shranjeni v sessionStorage za isto sejo, ne kot univerzalen DB draft med napravami. |
| MyPlanly | Ostaja ročen; ni nove integracije. |

**Produkcijski Quibi WRITE ni pripravljen za celotni tok:** aktivna migracija `20261011190311` razširi samo DEV journal. `quibi_production_operation_journal` na pregledani DEV shemi še dovoljuje le customer/vehicle/estimate/estimate_update/send; ne work_order/invoice ali novih UPDATE vrst. Tudi archived broad production migracije niso dovoljenje za uporabo. Pred ločeno produkcijsko aktivacijo je potrebna namenska, pregledana migracija in dokaz ločene produkcijske DB. Te ugotovitve ne popravljati z odstranitvijo omejitev ali ponovnim izvajanjem DEV migracij.

Produkcijska politika zahteva APP_ENV/QUIBI_MODE/VERCEL_ENV production, ločeni DEV/PROD Supabase ref in pravilen URL ter ločene READ/WRITE/SEND zastavice. DEV pošta, ki je Quibi DEV ne dostavlja, ni blokada UX ali merge kode. Pošiljanja nisem ponovil.

## Tveganje podatkov

Sam Git merge ne izvaja SQL; v repozitoriju ni CI db-push koraka. PR #19 doda stolpce/funkcije, ne briše poslovnih podatkov. Neposredne izgube pri teh treh aditivnih migracijah nisem ugotovil. Ne morem potrditi odsotnosti vseh tveganj na nepreverjeni produkcijski shemi.

V predhodni M4 migraciji je `DROP COLUMN IF EXISTS intake_material` (po komentarju zgodnja prep-only javna kopija); na DEV ni več tega stolpca. Na neznanem starejšem cilju z dejanskimi podatki v tem stolpcu je pred replay nujen pregled/backup. Ne ponavljati vseh 31 migracij na že razviti bazi. Prepis neznane zgodovine ali uporaba DEV baze kot produkcije bi bila dodatno tveganje.

## Preverjanja tega pregleda

- Fetch origin in GitHub stanje, pregled odvisnih PR, konfliktna simulacija na dveh načinih: PASS.
- Lokalni produkcijski Next build na izoliranem združenem drevesu: PASS, exit 0; to ni Vercel produkcijska objava. Node 24, zaklenjene obstoječe odvisnosti prek junctiona; brez npm install in brez kopiranja okolij. Za compile uporabljeni obstoječi izrecno CI-only dummy Supabase podatki.
- TypeScript scoped pregled: PASS; root `npx tsc --noEmit` in `npm run lint` v čistem združenem drevesu prav tako PASS, oba exit 0 (izpisa v prilogah).
- ESLint src/scripts/tests/.github/next.config: PASS, 0 izhoda napak.
- 594 source testi: 576 PASS / 18 FAIL. 15 dodatnih dejanskih action/render regresij: PASS (vsi adapterji sintetični, brez zunanjih zapisov).
- Docker DB replay/RLS runtime suite: BLOCKED. Docker daemon npipe dockerDesktopLinuxEngine ne obstaja. Namesto tega READ-only pg_catalog/schema_migrations/policies/grants/indexes pregled; noben db push ali repair.
- Prijavljeni UX: upoštevano obstoječe Cursor poročilo P1.2 8/8 PASS; ni novega lastnega prijavljenega E2E ali finančnega WRITE scenarija.

## Priporočen varen vrstni red

1. Ohraniti Draft in obstoječi DEV. Potrditi pot integracije celotne osnove (PR #3–#18 plus 158 commitov manual-qa), ali izrecno pregledati kumulativni PR proti main; ničesar ne retargetati avtomatsko.
2. Uskladiti tri lokalne migration verzije z že izvedenimi DEV; še enkrat preveriti vsebino in odvisnosti. Migracijske zgodovine ne popravljati na slepo.
3. Popraviti 18 testnih napak, dodati ustrezno CI pokritost za head/base in ponoviti celoten nabor ter isolated DB replay/RLS suite v delujočem Docker okolju. Build in UX zeleno ne nadomestita tega koraka.
4. Skrbnik druge Vercel integracije naj potrdi Production Branch, hooks ter ali merge v main sproži produkcijo. Pred merge mora biti posledica merge izrecno znana in produkcijska objava ločeno odobrena.
5. Po odpravi merge blokad ponoviti zaključni pregled točnega SHA; šele nato ločeno odločiti o merge kode. Ta pregled merge ne izvaja.
6. Produkcijsko namestitev načrtovati ločeno: inventar ciljne DB, backup, kontroliran replay manjkajočih migracij v timestamp vrstnem redu, ločena okolja, smoke najprej READ. Ne predpostavljati, da ima produkcija le stanje main.
7. Quibi produkcijski WRITE/SEND sta še tretja ločena odločitev: namenska production journal podpora, revalidacija identitete/cen/approval in izrecno odobren preizkus. Ne omogočiti zastavic v tem pregledu.

**Varno obdržati kot Draft/DEV: da. Priporočilo za commit/push kode: ne pred odpravo blokad. Poročilo je edina sprememba; commit/push/merge/deploy/db-push/history repair/Quibi WRITE/SEND niso bili izvedeni.**

## Prebrane smernice in viri

- `C:/Users/Admin/.codex/attachments/c0aef8e7-5fa2-4541-bf6e-774d0a3e7ee5/Prilepljeno besedilo.txt`.
- `C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1/AGENTS.md`, `CLAUDE.md`.
- `C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md`.
- Uporabljene veščine: `C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md`, `C:/Users/Admin/.agents/skills/security-review/SKILL.md`, `C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md`, `C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md`.
- `C:/Users/Admin/avtoservis-selan/docs/qa/selan-rea-e2e-p12-00d0dc8/REPORT.md`; prejšnji P1.1 in P1.2 dokazi.
- Pregledani repo viri: vse aktivne SQL migracije in njihov manifest, archived/pending manifest, .github/workflows, .vercelignore, package/lock, auth gate, team/name-actions, case reference lookup, dashboard/client case workspace, automatic-intake-sync/workflow/draft actions, Quibi deployment-policy/workflow-config/write-contract/write-http/write-journal/write-workflow/business-document-actions/business-document-workflow/business-send-actions/catalog-cache/article-pages, case-work read/review in realtime-refresh; zgoraj navedeni padajoči testi.
- Supabase READ: schema_migrations, pg_class, pg_policies, pg_proc, pg_constraint, pg_indexes, role_table_grants, triggers, Realtime publikacija, storage bucket metadata; security advisor.
- Vercel READ: projekt/link/targets, env imena/tipi/targeti, alias in deployment metadata; GitHub PR/check/deployment metadata. Brez razkritja skrivnosti.
