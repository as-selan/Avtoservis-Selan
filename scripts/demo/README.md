# Izolirani oddaljeni demo – priprava, še brez izvedbe

**Predlagani Supabase projekt:** `avtoservis-selan-demo-phase1`, nova ločena projektna referenca. Projekt še ni ustvarjen; ustvarjanje lahko povzroči stroške in zahteva izrecno odobritev. Obstoječi `verxxsjbewmkgoxwqvxo` je produkcija in ni sprejemljiv. Lokalni `avtoservis-selan-manual-pr18` ostane nedotaknjen.

Po odobritvi: preveriti identiteto novega praznega projekta, vanj uporabiti **vseh 19** migracij iz `supabase/migrations/` v vrstnem redu imen (zadnja `20261004120000_fixed_price_service_match.sql`), preveriti RLS in prepoved neposrednih zapisov, nato enkrat izvesti `seed-remote.mjs`. Skripta pred zapisom zahteva točen ref, URL `https://<ref>.supabase.co`, `DEMO_SEED_CONFIRM=seed:<ref>`, sintetični naslov `@example.test` in geslo iz varne lokalne shrambe. Ne ponastavlja baze in zavrne ponovno seedanje istega organizacijskega sluga.

Seed pripravi pet sintetičnih primerov: Quibi predračun, objavljeno ceno, oba izida predhodnega pregleda in tri nepotrjene možnosti termina. Ustvari samo en Auth račun, vezan na demo organizacijo. Poverilnice ostanejo zunaj repozitorija. Po seedanju preveriti, da ta račun vidi samo demo organizacijo; posebej preveriti RLS z drugim sintetičnim računom brez članstva.

Za obstoječi Vercel projekt uporabiti samo **Preview** okolje na namenski demo veji. Potreben je ločeno odobren push. Ne spreminjati Production env, domen ali projekta. Preview env:

| Ime | Vrednost |
| --- | --- |
| `SELAN_REMOTE_DEMO` | `1` |
| `NEXT_PUBLIC_SELAN_REMOTE_DEMO` | `1` |
| `SELAN_FIXED_PRICE_V1` | `1` |
| `SELAN_DEMO_SUPABASE_PROJECT_REF` | ref novega demo projekta |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable ključ **demo** projekta |
| `SUPABASE_SERVICE_ROLE_KEY` | strežniški ključ **demo** projekta, samo Preview |
| `PUBLIC_APP_ORIGIN` | točen HTTPS origin demo Preview URL |
| `COMPLETION_PUBLIC_ORIGIN` | isti HTTPS origin |

`QUIBI_DEV_USERNAME`, `QUIBI_DEV_PASSWORD`, `QUIBI_E2E_ORIGIN`, MyPlanly ključi in sporočilni transporti v tem okolju **ne smejo biti nastavljeni**. Remote demo uporablja vgrajeno Quibi READ fixture brez omrežnega klica. Strežniški guard zavrne produkcijski Supabase ref, Production Vercel okolje, manjkajoči demo flag, neskladna izvora in Quibi omrežno konfiguracijo. MyPlanly potrditev je strežniško blokirana; komunikacijski koraki zahtevajo `QA-SIM-*`.

Pred objavo preveriti Auth redirect URL samo v **demo** projektu, onemogočen javni signup in zaščito Vercel Preview oziroma varno deljivo povezavo. Po objavi izvesti browser QA na dejanskem HTTPS URL (desktop, mobile, network, konzola, RLS), ne na localhostu. Če kateri pogoj ni izpolnjen, URL ni pripravljen za Tadeja.

**Odstranitev po predstavitvi:** preklicati demo Auth seje in račun, odstraniti Preview env/deployment, nato po ločeni potrditvi izbrisati izključno novi demo Supabase projekt. Ne uporabljati generičnega reset ukaza in ne brisati drugih projektov.
