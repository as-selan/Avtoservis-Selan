# Osnutek sporočila razvijalcu Quibi – DEV API

Zadeva: DEV seznam artiklov vrača prazen HTTP 500; send_id 277127 failed

Pozdravljeni,

v integraciji Avtoservis Selan na `https://dev.quibi.net` pravilno avtenticiran `GET /api2/sifranti` vrača **HTTP 500 s praznim telesom**. Klic ustreza [vaši dokumentaciji](https://navodila.quibi.net/za-razvijalce/): glave `username`, `password`, `Content-Type: application/json`, brez telesa, brez preusmeritev. Enak rezultat je tudi z `Accept: application/json`.

Ponovitev **22. 10. 2026 ob 18:06:21 UTC** iz Vercel Preview, odziv po 894/1100 ms: `Content-Type: text/html; charset=UTF-8`, `Server: nginx/1.14.0 (Ubuntu)`, 0 bajtov, brez request/correlation ID. SHA-256 praznega telesa: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

Kontrolni klici z istimi poverilnicami ob 18:06:20 UTC: `/api2/cenik`, `/api2/sifranti/view/116731` in `/api2/kategorije` vsi HTTP 200. Cenik 189 VULAKNIZERSTVO vsebuje eno postavko. Zaloga za skladišči 49 in 626 vrne HTTP 403. Druge dokumentirane poti za celoten katalog servisnih storitev nismo našli.

Prosimo preverite aplikacijski/PHP in nginx error log za `GET /api2/sifranti`, pravice oziroma funkcionalne zastavice tega DEV računa ter morebitni neveljaven zapis ali join pri seznamu artiklov. Ali obstaja druga podprta dokumentirana pot za celoten katalog, tudi nezalogovne storitve, s šiframi, enotami, DDV in aktualnimi cenami? Ne želimo ugibati ID-jev ali cen.

Dodatno pri prostih postavkah: 22. 10. 2026 ob 19:02 UTC je CREATE sintetičnega predračuna 2176927 sprejel `opis`, `enota_id`, `ddv_id`, `kolicina`, `popust` in dokumentirano `cenaZDDV` (cena enote brez DDV), vendar je ponovno branje vrnilo vse cene 0 in znesek 0. Dodano polje `cena` ni pomagalo. Ob 19:09 UTC je UPDATE istega znanega dokumenta z izrecnim `cenaBrezDDV` shranil prave neto cene 24.59016393 / 16.39344262 / 12.29508197 in znesek 65,00 EUR. Ali lahko uskladite dokumentacijo/obdelavo prostih vrstic? Selan po popravku pošlje oba enaka neto podatka in ponovno preveri dokument; ne šteje ničelnega dokumenta kot uspeha.

Pošiljanje 277127 ostaja failed (Connection timed out), brez ponovnega pošiljanja. Uporabnik je pojasnil, da DEV e-pošte ne pošilja. To zato ni blokada priprave dokumentov in ne zahteva testiranja resničnih prejemnikov.

Poverilnic, naslovov prejemnikov ali osebnih podatkov ne prilagamo. Gre samo za DEV in sintetično testno stranko. To sporočilo je pripravljeno za posredovanje in **ni bilo poslano**.
