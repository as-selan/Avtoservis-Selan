# Tadej: povpraševanje BDD2E22A do predogleda predračuna

1. Na nadzorni plošči v »Prejeta povpraševanja« odpri primer BDD2E22A.
2. V »Povezava s Quibijem« preveri trenutno konfiguracijo. Blokiran gumb ne sproži zapisovanja; prikaz pove točno manjkajočo nastavitev.
3. Odpri »Primerjaj stranko in vozilo s Quibijem (brez zapisovanja)«. Za ta primer je stranka 109578, predlagano vozilo 2143. READ je potrdil stranko, vendar VIN, registracija in model niso enaki povpraševanju. Tadej mora ugotoviti pravo vozilo in vir pravilnih podatkov. Ne prepisuj podatkov le zato, da bi odstranil opozorilo.
4. Šele po dejanskem pregledu označi »Preveril sem podatke tega primera« in »Sprejmi primer za pripravo ponudbe«. To je obvezna poslovna odločitev; ni Quibi CREATE. Selan nato uporabi obstoječo samodejno pripravo ponudbe.
5. Po preverjeni povezavi vozila v pripravi predračuna preglej predizpolnjene Quibi artikle, zgodovino, cenik in DDV. Izberi oziroma dopolni samo storitev, ki ni enolično potrjena.
6. Preglej predogled, postavke in znesek. CREATE in pošiljanje sta ločeni potrditvi; v tem P1 preverjanju ju ne izvajamo.

Trenutna omejitev: status new, priprava še ne obstaja in identiteta vozila ni potrjena. Testi konfiguracije ali uspešen build niso dokaz, da je na tem primeru že mogoče pripraviti varen predogled.

Na objavljenem P1 preverjanju je bila trenutna strežniška konfiguracija veljavna, actor pa aktiven owner pravilne organizacije. Staro opozorilo ne dokazuje trenutno manjkajočega vklopa. Nepreverjena obstoječa povezava vozila sproži INTAKE_IDENTITY_REVIEW pred kakršnimkoli Quibi CREATE; najprej je potreben pregled identitete.
