# P4 — uporabniško sprožena izdaja računa v Quibi DEV

## Obseg in dejanski rezultat

Nadaljevanje PR #19 iz 0c514a4. Noben Quibi CREATE/UPDATE/SEND ni bil izveden. Račun C066482D še ni izdan; dejanska številka in PDF novega računa zato še ne obstajata. Integracija je pripravljena za uporabnikov klik po vnosu manjkajočega testnega datuma storitve. Produkcijske nastavitve in dovoljenja niso spremenjeni.

Izdaja v gostovanem DEV je omejena na obstoječi projekt prj_OSpIMwU9zkrcImKhGxpaq8PnrgUU, primer c066482d-0002-43c4-9090-b23833928f71, stranko 405965, vozilo 2392, nalog 2176935, predračun 2176934 in znesek 50 EUR. Identiteta, odobritev stranke, dejanski zaključek in pregled vodje, vsebinski SHA, cene ter dnevnik operacij ostanejo strežniški predpogoji. Obstoječe druge vrste dokumentov in produkcijske pravice ostanejo nespremenjene.

## Dejanski strežniški DEV READ in priprava payloada

Skrivnosti so ostale izključno v že konfiguriranem Vercel Preview procesu. Sanitiziran READ preflight na avtoservis-selan-dev je potrdil:

- WRITE je že konfiguriran; SEND je izključen. Nobenega preklopa zastavic.
- Številčenje Račun 2060, edini poslovni prostor DELAVNICA 67, enota 1, DDV 5.
- Povezani nalog 2176935, št. 273/2026; predračun 2176934, št. 283/2026; oba verified v dnevniku C066482D, brez invoice vrstice.
- Dejanski nalog nima načina plačila (prazna vrednost); space_id=0 ni veljaven prostor, zato se uporabi edini sveže preverjeni #67.
- Isti aplikacijski parserji in gradnik iz dejanskega Quibi vira pripravijo prosto postavko QA-SIM E2E menjava olja 20261025, količina 1, neto cena 40.97540984, popust 0, DDV 5. Preverjeni znesek je 50,00 EUR, davčna osnova 40,98 EUR in prikazani DDV 9,02 EUR.
- Plačilni rok 5 dni: za izrecno sintetični payload datum 25. 10. 2026 je zapadlost 30. 10. 2026. Ta testni datum ni bil shranjen kot dejanski datum storitve.
- Payload ne vsebuje nacinPlacila, ker stranka načina še ni določila. To ni zapis ali potrditev plačila.

Dokumentacija: https://navodila.quibi.net/za-razvijalce/ — POST /api2/glavadokumenta/form določi vrsto po stevilcenje_id; datum storitve je za račun izrecno obvezen, nacinPlacila ni izrecno označen kot obvezen. PDF uporablja obstoječi dokumentirani adapter POST /api2/glavadokumenta/pdf. GET /api2/glavadokumenta/view/ID potrdi končni dokument.

**Pomembna meja dokaza:** brez uporabniško sproženega CREATE ni dokazano, ali konkretna Quibi DEV namestitev sprejme račun brez načina plačila. Selan ga v omejenem DEV ne zahteva vnaprej in ga ne ugiba. Ob izrecni Quibi zavrnitvi zaradi tega polja ponudi obstoječo izbiro neposredno pri računu. Produkcijska pravila za obveznost tega podatka niso bila sproščena.

## Implementacija

- En Izdaj račun; samodejni READ nikoli ne nastavi dispatch. Ni dodatne potrditve ali checkboxa.
- Povezani izvor prenese stranko, vozilo, postavke, neto cene, količine, DDV, popuste, skladišče in znane datume. Veljavne nastavitve vira se preverijo v svežih šifrantih; enoličen poslovni prostor se izbere sam.
- CREATE uporablja obstoječi atomarni dnevnik in zaklep, nato ponovno preveri dokument, obstoječi PDF adapter in končni SHA/številko. Številke ne izmišljamo; Osnutek se ne prikaže kot izdan račun.
- Pred CREATE se išče obstoječi račun z natančno zunanjo referenco. En preverjen zadetek se poveže brez CREATE; več zadetkov se ne izbira na pamet.
- Pri nejasnem odgovoru se ob nalaganju samo bere. Identiteta, vsebina, datumi in zneski morajo ustrezati shranjenemu zahtevku. Ne kliče se CREATE ali PDF. Nezaključen osnutek oziroma nejasnost ostaneta negotova, brez ponovne izdaje.
- Po uspehu se prikaže Račun izdan – št. [Quibi številka], odpiranje dokumenta/PDF in povezava na obstoječi prevzem. Stanje je določeno z verificirano povezavo v dnevniku, brez novega poslovnega stanja.
- Neobvezni dejanski način pri prevzemu se shrani ločeno kot podatek uporabnika. Plačanost izhaja iz svežega Quibi READ; izbira načina ne ustvari plačila. Odprto in neznano ostaneta odprto/neznano.

## Preverjanje

Ciljne regresije: payload/identiteta/DDV/datumi, izpuščen neznani način plačila, produkcijsko pravilo nespremenjeno, omejitev DEV obsega, izgubljeni odgovor, dvoumnost, napačno vozilo/znesek/datum, Osnutek, številka/PDF, ponovljen klik in obstoječi račun. Dodana regresija prevzema potrdi, da izbira Kartica pri neplačanem računu ohrani paid=0.

Lokalni celotni nabor pred zadnjima dodatnima regresijama: 667/667 PASS; končni rezultat celotnega nabora, TypeScript, ESLint, build ter izolirani browser/DB je naveden v CI istega PR. Prijavljeni gostovani E2E in dejanski CREATE nista potrjena. Viden je prijavni zaslon; prijavljenega uspeha ne trdimo.

## Kratek uporabniški preizkus (CREATE samo vaš klik)

1. Prijava na stalni DEV; odprite C066482D → Račun.
2. Preverite stranko, Golf TE-REA25, nalog 2176935 in 40,98 + 9,02 = 50,00 EUR.
3. Vnesite izrecni sintetični datum storitve; ostali znani datumi se dopolnijo. Ne izbirajte plačila na pamet.
4. Kliknite Izdaj račun enkrat. Ob uspehu preverite dejansko številko in PDF; po osvežitvi mora ostati isti račun. Pri nejasnem izidu ne ustvarjajte novega dokumenta.
5. Nadaljujte v obstoječi prevzem. Morebitni vnos načina plačila ne pomeni, da je plačilo prejeto.

## Pravila in veščine

Prebrano: C:/Users/Admin/.codex/worktrees/selan-p0-guided-case/m3-m4-ci-db-tests-v1/AGENTS.md in CLAUDE.md; C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md; C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md; C:/Users/Admin/.agents/skills/security-review/SKILL.md; C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md; C:/Users/Admin/.agents/skills/deploy-to-vercel/SKILL.md; C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md; node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md. Brez novih odvisnosti, migracij, RLS sprememb, produkcijske objave ali merge.
