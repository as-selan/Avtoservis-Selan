# Tadej: od novega povpraševanja do naloga

**Stanje 22. 10. 2026:** navodila za kodo v tem PR. Popravek še ni objavljen v DEV. Celoten postopek z bazo in Quibijem še ni potrjen. Spodnji posnetki so dejanski Playwright posnetki delovnega prostora in obstoječih komponent obrazcev v izoliranem prikazu; niso posnetki prijavljenega primera ali dokaz ustvarjenih dokumentov.

1. Na nadzorni plošči v **Dnevno delo** poišči primer in klikni njegovo naslednje opravilo. Čakalna vrsta prikazuje vse odprte primere; filtriraj jih po vrsti dela ali išči po stranki, registraciji, številki oziroma storitvi. **Osveži dnevno delo** ponovno prebere trenutno stanje. Spodnji pregled po obdobju je dodatni pregled, tudi za zaključene primere. Na vrhu primera je **Kaj je naslednje?**, trenutna faza in en moder gumb. Nad opravili je vedno viden povzetek: stranka, vozilo, želja stranke in seznam manjkajočih osnovnih podatkov. Trenutni obrazec je takoj pod koraki, označen z **Nadaljujte tukaj**. Ko se po shranjevanju osveži stanje primera, se naslednje opravilo preračuna iz tega stanja; sam klik gumba še ne potrdi uspeha. Ostala opravila so zložena in jih lahko odpreš. Gumb te odpelje do ustreznega obrazca; sam še ničesar ne pošlje ali ustvari.
2. Če piše **Preveri stranko in vozilo**, preveri povezavo s Quibijem. Primerjaj stranko in pravo vozilo. Če ustvarjanje ali povezava nista dovoljena, upoštevaj prikazani razlog; potreben je lastnik ali skrbnik.
3. Pri **Preveri podatke** preveri opis, kontakt in vozilo. V Tadejevem pregledu označi potrditev in klikni **Sprejmi primer za pripravo ponudbe**. To sprejme primer in pripravi podatke; še ne ustvari predračuna.
4. **Pripravi predračun** odpre obstoječo pripravo s Quibijevimi postavkami. Preglej predlog. Predogled ni dokument. Ustvarjanje potrdi samo, če je omogočeno; aplikacija mora nato pokazati potrjeno povezavo dokumenta.
5. **Preglej in potrdi predračun** odpre dejanske postavke, znesek in pregled. Potrdi **Odobri predračun**. S tem dokument še ni poslan in stranka še ni naročila popravila.
6. **Pošlji predračun** je ločeno dejanje in zahteva omogočen SEND ter preverjeno vsebino in prejemnika. DEV dovoljuje samo odobren testni naslov. Če pošiljanje ni omogočeno, dokument ni poslan. Pri neznanem izidu ne ponavljaj pošiljanja.
7. **Zabeleži odobritev stranke** odpre odločitev za to različico predračuna. Vnesi sledljiv dejanski odgovor, tudi po telefonu, in potrdi odločitev. Status pošiljanja ni odobritev. Pri sintetičnih testih uporabljaj samo označeno simulacijo QA-SIM.
8. Po veljavni odobritvi **Pripravi delovni nalog** oziroma **Ustvari delovni nalog** odpre obstoječi poslovni obrazec. Prevzame podatke preverjenega predračuna. Pred ustvarjanjem preveri pogoje. Če WRITE ni omogočen, nalog ni ustvarjen. Ko nalog že obstaja, gumb vodi na njegov pregled oziroma popravilo.

**Če obstaneš:** rumeno pojasnilo pod glavnim gumbom pove razlog in naslednjo pot. Podatkov, ki so že shranjeni, ne vnašaj v novo povpraševanje. Dnevniki, dokumenti, AI in tehnična aktivacija ostajajo dostopni v podrobnostih. Ročni termini so ločeni; ta popravek ne uvaja novega sistema terminov.

## Mehanik: dodeljeno delo

Mehanik v **Moje dodeljeno delo** odpre svoj dodeljeni primer. Povzetek pokaže vozilo in registracijo, stanje dela ter naslednje opravilo za mehanika. Pod njim sta **Težava** in, če je v primeru vneseno, **Zahtevano delo in navodila**. Postavke dela in materiala se berejo iz preverjenega Quibijevega naloga; če sveže branje ni mogoče, to prikaz pove. Tak prikaz ni potrditev razpoložljivosti delov.

V **Zabeleži opravljeno delo** izberi napredek, dodaj opombo in klikni **Shrani napredek in opombo**. Fotografiranje oziroma izbira iz galerije je takoj za tem, pred zgodovino zapiskov. Dodaj opis in klikni **Shrani fotografijo**; za več fotografij ponovi. Fotografije so zasebne. Če nalaganje ni potrjeno, preveri obstoječo datoteko v prikazanem seznamu nedokončanih nalaganj, preden jo nalagaš znova.

Ko je delo opravljeno, izberi **Delo opravljeno** in shrani napredek. To preda delo vodji; ne izda računa, ne potrdi plačila ali prevzema in ne pošlje sporočila. Naslednje navodilo mehaniku ostaja vezano na njegovo delo; poslovni pregled in zaključek ureja vodja. Pri zaključenem primeru sta običajna obrazca za napredek in novo fotografijo skrita; ponovno obravnavo lahko odpre vodja.

## Novi predogledi primera in mehanika

Naslednja posnetka sta **hidrirana sintetična predogleda komponent** pri širini 390 px. Prikazujeta povzetek primera oziroma mehanikov povzetek z navodilom za naslednje opravilo. **Nista posnetka prijavljene dejanske aplikacije. Celoten E2E z dejansko aplikacijo, zaledjem, bazo in Quibijem ostaja nepreverjen.**

![Povzetek primera, sintetični predogled 390 px](qa/selan-p0-2026-10-22/followup/case-390.png)

![Mehanikovo delo, sintetični predogled 390 px](qa/selan-p0-2026-10-22/followup/mechanic-390.png)

## Posnetki izolirane komponente

Novo povpraševanje, 1440 px:

![Novo povpraševanje, izolirani UI](qa/selan-p0-2026-10-22/new-1440.png)

Novo povpraševanje, 350 px:

![Glavni gumb pri 350 px, izolirani UI](qa/selan-p0-2026-10-22/new-350.png)

Nepotrjena povezava vozila:

![Pojasnilo blokade, izolirani UI](qa/selan-p0-2026-10-22/identity-390.png)

Priprava naloga ob izključenem WRITE:

![Priprava ni ustvarjen nalog, izolirani UI](qa/selan-p0-2026-10-22/order-390.png)

Priložen je [kratek video UX navigacije](qa/selan-p0-2026-10-22/ui-navigation.webm). Prikazuje štiri ločena sintetična stanja in odpiranje obrazcev; poslovni gumbi so v prikazu izključeni. **To ni video dokončanega postopka ali E2E.** [Dokazi in omejitve preverjanja](qa/selan-p0-2026-10-22/README.md).

## Trenutni obrazci po kliku glavnega gumba

![Sprejem istega primera, 350 px](qa/selan-p0-2026-10-22/new-form-350.png)

![Priprava predračuna, sintetični vhodi](qa/selan-p0-2026-10-22/prepare-form-1440.png)

![Obstoječi obrazec Quibi naloga, WRITE izključen](qa/selan-p0-2026-10-22/order-form-390.png)

Lokalni UX predogled brez poslovnih zapisov: `node scripts/qa-case-journey.mjs --serve`, nato `http://127.0.0.1:47866/?case=new`. Prikaz ni prijavljena DEV aplikacija.
