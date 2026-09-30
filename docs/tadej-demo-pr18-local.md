# Tadejev prikaz prve faze (lokalna demonstracija)

Odprite `http://127.0.0.1:3001/login` in se prijavite s sintetičnim lastnikom. Uporabite samo lokalni projekt `avtoservis-selan-manual-pr18`. Vsi spodnji primeri so sintetični; Quibi je lokalna simulacija. Ne uporabljajte Vercelovega predogleda, ki je povezan s produkcijsko bazo.

## Običajen servis

1. Na strani za spletno povpraševanje oddajte novo povpraševanje. V nadzorni plošči odprite nov primer. Za telefonski sprejem ustvarite drugi, ločen primer in po potrebi ponovno uporabite obstoječo stranko in vozilo.
2. Dopolnite manjkajoče podatke na istem primeru. Tadej nato v razdelku **Tadejev pregled sprejema** preveri stranko, vozilo in storitev ter izrecno klikne **Sprejmi primer za pripravo ponudbe**.
3. Pri običajnem predračunu odprite Quibi stranko, preverite povezavo stranke in vozila ter dokument. Ročno povežite ID predračuna s primerom. Aplikacija pokaže predlagano ceno samo, če se ujemajo ID-ji in sveži odtisi stranke, vozila ter dokumenta. Tadej odpre postavke in potrdi ceno; to še ni končna cena računa.
4. Prikažite ročno evidentiranje pošiljanja in odgovora stranke. V predstavitvi uporabite izključno reference `QA-SIM-*`; nič se dejansko ne pošlje. Po sprejemu pokažite tri predlagane termine, evidentiranje izbire in jasno opozorilo, da termin še ni rezerviran v MyPlanlyju.

## Predhodni pregled

1. V ločenem novem primeru označite potrebo po pregledu in ročno preverite termin. Po pregledu vnesite ugotovitve in nadaljujte s predračunom, kjer je potreben.
2. Pokažite dva ločena sintetična izida: **naročeno popravilo** pomeni brezplačen pregled; **zavrnjeno popravilo** pomeni plačljiv pregled. Cena pregleda, izdaja računa in prejem plačila niso določeni oziroma izvedeni v Selanu.

## Storitev z objavljeno končno ceno

V tretjem ločenem primeru po Tadejevem pregledu sprejema izberite pot z objavljeno končno ceno. Vnesite dejansko objavljeno storitev, ceno in HTTPS povezavo, nato pokažite Tadejevo odobritev, ročno komunikacijo, odločitev stranke in tri ročne termine. Ta pot ne ustvari Quibijevega predračuna in ne zahteva predhodnega pregleda. V lokalnem QA primeru uporabite samo sintetično objavo in reference `QA-SIM-*`.

Lokalna migracija `20260930120000_review_intake_and_fix_published_url.sql` odpravi napako URL `2201B` in zagotovi izrecen pregled pred prehodom `new → preparing_offer`. Noben korak ne uporablja dejanskega Quibija ali MyPlanly API-ja. Pred uporabo z resničnimi strankami je treba potrditi Quibijevo zapisovalno pogodbo, identiteto dokumenta glede na delo in vozilo, dejansko dostavo ter rezervacijo v MyPlanlyju.
