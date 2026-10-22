# Tadej: od novega povpraševanja do naloga

**Stanje 22. 10. 2026:** navodila za kodo v tem PR. Popravek še ni objavljen v DEV. Celoten postopek z bazo in Quibijem še ni potrjen. Spodnji posnetki so dejanski Playwright posnetki nove komponente v izoliranem prikazu; niso posnetki prijavljenega primera ali dokaz ustvarjenih dokumentov.

1. Na nadzorni plošči odpri novo povpraševanje. Na vrhu primera je **Kaj je naslednje?**, trenutna faza in en moder gumb. Gumb te odpelje do obstoječega obrazca; sam še ničesar ne pošlje ali ustvari.
2. Če piše **Preveri stranko in vozilo**, preveri povezavo s Quibijem. Primerjaj stranko in pravo vozilo. Če ustvarjanje ali povezava nista dovoljena, upoštevaj prikazani razlog; potreben je lastnik ali skrbnik.
3. Pri **Preveri podatke** preveri opis, kontakt in vozilo. V Tadejevem pregledu označi potrditev in klikni **Sprejmi primer za pripravo ponudbe**. To sprejme primer in pripravi podatke; še ne ustvari predračuna.
4. **Pripravi predračun** odpre obstoječo pripravo s Quibijevimi postavkami. Preglej predlog. Predogled ni dokument. Ustvarjanje potrdi samo, če je omogočeno; aplikacija mora nato pokazati potrjeno povezavo dokumenta.
5. **Preglej in potrdi predračun** odpre dejanske postavke, znesek in pregled. Potrdi **Odobri predračun**. S tem dokument še ni poslan in stranka še ni naročila popravila.
6. **Pošlji predračun** je ločeno dejanje in zahteva omogočen SEND ter preverjeno vsebino in prejemnika. DEV dovoljuje samo odobren testni naslov. Če pošiljanje ni omogočeno, dokument ni poslan. Pri neznanem izidu ne ponavljaj pošiljanja.
7. **Zabeleži odobritev stranke** odpre odločitev za to različico predračuna. Vnesi sledljiv dejanski odgovor, tudi po telefonu, in potrdi odločitev. Status pošiljanja ni odobritev. Pri sintetičnih testih uporabljaj samo označeno simulacijo QA-SIM.
8. Po veljavni odobritvi **Pripravi delovni nalog** oziroma **Ustvari delovni nalog** odpre obstoječi poslovni obrazec. Prevzame podatke preverjenega predračuna. Pred ustvarjanjem preveri pogoje. Če WRITE ni omogočen, nalog ni ustvarjen. Ko nalog že obstaja, gumb vodi na njegov pregled oziroma popravilo.

**Če obstaneš:** rumeno pojasnilo pod glavnim gumbom pove razlog in naslednjo pot. Podatkov, ki so že shranjeni, ne vnašaj v novo povpraševanje. Dnevniki, dokumenti, AI in tehnična aktivacija ostajajo dostopni v podrobnostih. Ročni termini so ločeni; ta popravek ne uvaja novega sistema terminov.

## Posnetki izolirane komponente

Novo povpraševanje, 1440 px:

![Novo povpraševanje, izolirani UI](qa/selan-p0-2026-10-22/new-1440.png)

Novo povpraševanje, 350 px:

![Glavni gumb pri 350 px, izolirani UI](qa/selan-p0-2026-10-22/new-350.png)

Nepotrjena povezava vozila:

![Pojasnilo blokade, izolirani UI](qa/selan-p0-2026-10-22/identity-390.png)

Priprava naloga ob izključenem WRITE:

![Priprava ni ustvarjen nalog, izolirani UI](qa/selan-p0-2026-10-22/order-390.png)

Video celotnega postopka ni priložen: brez izolirane baze in prijavljene testne seje bi prikazoval simulacijo poslovnih dejanj. [Dokazi in omejitve preverjanja](qa/selan-p0-2026-10-22/README.md).
