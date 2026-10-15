# Quibi DEV: vprašanje glede občasnega READ 403

Prosimo, preverite zavrnitev API READ iz Vercel Preview dne **2026-10-15 ob 06:21:00.015 UTC**. Selan je zabeležil `QUIBI_HTTP_403` med preverjanjem identitete. Takratni dnevnik ni shranil točnega endpointa ali odzivne vsebine; zato ne trdimo, ali je 403 ustvaril API ali vmesna zaščita. Identitetni korak bere `/api2/stranka/view/:id` in `/api2/vozila/view/:id`.

Zahteve uporabljajo dokumentirani glavi `username` in `password` ter `Content-Type: application/json`, izključno `https://dev.quibi.net`, brez brskalniške seje in brez sledenja preusmeritvam. Poverilnic ne prilagamo. Zavrnjeni 401/403 se samodejno ne ponavljajo.

Ločeno smo 2026-10-15 na `GET /api2/glavadokumenta/view/:id` izmerili uspešen 200 po **8794 ms** in drug odgovor prekinjen po **15003 ms**. To dokazuje počasno branje, ne dokazuje pa vzroka 403. Diagnostika zdaj zajame le redigirano pot, metodo, status, vrsto JSON/HTML, znake zaščitnega izziva ter referenco edge, kadar je vrnjena; ne beleži podatkov dokumentov ali skrivnosti.

**Vprašanje:** Ali lahko po času dogodka ugotovite točen endpoint in razlog 403 ter potrdite, ali obstajajo omejitve IP-jev Vercel, sočasnih zahtev ali pogostosti na API uporabnika? Ali zavrnitev izvira iz API pravic ali WAF/zaščite? Kakšni so podprti strežniški pogoji prijave, priporočena meja sočasnih READ, časovna omejitev in oblika odgovora pri omejevanju? Prosimo za korelacijski ID oziroma navodilo, katero neobčutljivo referenco naj zajamemo ob naslednjem dogodku.

To je pripravljeno vprašanje; ni bilo poslano.


## Ponovni gostovani preizkus po spremembi WAF, 2026-10-15

Andraž je po uporabnikovem sporočilu potrdil novo namestitev WAF in spremembo nastavitev. Preizkus je bil izveden zaporedno iz Selan DEV na Vercel Preview, brez Quibi CREATE/UPDATE/SEND.

- 10:44 UTC: obstoječa stranka/vozilo, artikel ASPCAP1316 in cena/DDV prebrani; predogled 45,99 EUR uspešen, aplikacijski READ pregled HTTP 200, približno 1,66 s.
- 10:45:48 UTC: dejanski račun prebran prek /api2/glavadokumenta/view/:id; aplikacijska stran HTTP 200, 2,71 s.
- 10:45:54.381 UTC: PDF računa HTTP 200 application/pdf, 4,57 s, veljaven %PDF- header.
- 10:46:30 UTC: delovni nalog prikazan z vozilom in postavkami, aplikacijska stran HTTP 200, 2,03 s.
- 10:47:02 UTC: predračun prikazan, aplikacijska stran HTTP 200, 1,87 s.
- 10:47:29.861 UTC: PDF predračuna HTTP 200 application/pdf, 3,77 s, veljaven %PDF- header.
- 10:48:09.318 UTC: Quibi POST /api2/dn ni odgovoril pred 15.003 ms (TimeoutError, prvi poskus). Brez HTTP odgovora zato ni vrste HTML/JSON ali WAF reference. To je časovna prekinitev READ seznama nalogov, ne dokaz novega 403.
- 10:51 UTC: ponovna priprava predogleda iz preverjenih podatkov uspešna, aplikacijski READ pregled HTTP 200, 3,05 s.

Časi strani/obrazcev so meritve celotne gostovane poti, ne samo posameznega Quibi klica. Novega 403 v pregledanih dogodkih ni bilo. Uspešni preizkusi niso jamstvo neprekinjene zanesljivosti. Ostaja vprašanje: zakaj je /api2/dn pri zmernem zaporednem branju presegel 15 sekund in kakšen timeout ter mejo sočasnosti priporoča Quibi? Ne pošiljamo poverilnic ali celotnih dokumentov.

Ločeno odpravljena Selanova napaka: avtomatski pregled je začel READ pred izpolnitvijo obveznega skladišča; zdaj najprej uporabi obstoječo HTML validacijo obrazca. To ne spreminja zaščit CREATE ali SEND.
