# Tadej: demonstracija prve faze (lokalno)

Uporabite samo izolirani lokalni projekt `avtoservis-selan-manual-pr18` in
sintetične primere. Ne uporabljajte Vercelovega predogleda, ker je povezan s
produkcijskim Supabasom. Prijava v trenutno preverjeno gradnjo:
`http://127.0.0.1:3001/login`; geslo ostane v
lokalni DPAPI datoteki `owner.credential.xml` in se ne kopira v dokumentacijo.

1. **Običajen servis:** oddajte novo spletno povpraševanje z enoličnim oznako
   `QA-SYNTH-*`; v nadzorni plošči ustvarite še ločen telefonski primer.
   Pokažite ponovno uporabo stranke in vozila ter dopolnitev podatkov na istem
   primeru. V lokalni Quibi simulaciji povežite preverjeno stranko in vozilo.
   Predračun povežite samo po ročnem preverjanju stranke, vozila in storitve.
   Pokažite vir predlagane cene, Tadejevo odobritev, dokazilo dejanskega
   ročnega pošiljanja in zabeležen odgovor stranke. Nato ročno preverite tri
   termine, zabeležite ponudbo, izbiro in referenco dejanske rezervacije.
2. **Predhodni pregled:** na novem primeru označite potrebo po pregledu,
   preverite termin ročno, nato vnesite dejanske sintetične ugotovitve. Po
   pregledu praviloma pripravite predračun v simulaciji Quibija. Ločeno
   prikažite naročilo popravila (pregled brezplačen) in zavrnitev popravila
   (pregled plačljiv; znesek, račun in plačilo še niso potrjeni v aplikaciji).
3. **Objavljena končna cena:** migracija `20260929120000_published_fixed_price_path.sql`
   je nameščena samo v izolirani QA bazi, funkcija pa je v predstavitveni
   aplikaciji izklopljena. Lokalni funkcionalni preizkus je odkril PostgreSQL
   napako `2201B` pri izrazu za preverjanje URL (`{4,500}`), zato priprave
   cene ni mogoče shraniti. Pot zahteva ločen, pregledan popravek baze in nov
   funkcionalni preizkus. Tadeju je ne predstavljajte kot delujoč korak.

Lokalni test je potrdil mobilni spletni sprejem, ročni telefonski sprejem,
dopolnitev podatkov na istem primeru ter evidentiranje opravljenega pregleda
in plačljivega izida ob zavrnitvi popravila. Popolnoma izpolnjen nov primer
trenutno ostane v stanju `new`; za prehod v `preparing_offer` manjka potrjen
korak pregleda sprejema. Zato celotnega postopka od novega povpraševanja do
predračuna še ni mogoče pošteno prikazati kot dokončanega.

Pri vseh treh poteh povejte: Quibi dokumenti v demonstraciji izvirajo iz
**lokalne simulacije**; aplikacija jih ne ustvarja in ne pošilja samodejno.
MyPlanly API-ja še ni, zato so termini **ročni**. Interno zabeležen termin ni
dokaz samodejne zunanje sinhronizacije. Predlog cene velja le za ročno
povezan, sveže preverjen dokument; Quibi API še ne dokazuje njegove povezave
s točno določenim delovnim nalogom oziroma storitvijo.
