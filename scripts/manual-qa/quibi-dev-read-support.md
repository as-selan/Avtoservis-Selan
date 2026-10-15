# Quibi DEV: vprašanje glede občasnega READ 403

Prosimo, preverite zavrnitev API READ iz Vercel Preview dne **2026-10-15 ob 06:21:00.015 UTC**. Selan je zabeležil `QUIBI_HTTP_403` med preverjanjem identitete. Takratni dnevnik ni shranil točnega endpointa ali odzivne vsebine; zato ne trdimo, ali je 403 ustvaril API ali vmesna zaščita. Identitetni korak bere `/api2/stranka/view/:id` in `/api2/vozila/view/:id`.

Zahteve uporabljajo dokumentirani glavi `username` in `password` ter `Content-Type: application/json`, izključno `https://dev.quibi.net`, brez brskalniške seje in brez sledenja preusmeritvam. Poverilnic ne prilagamo. Zavrnjeni 401/403 se samodejno ne ponavljajo.

Ločeno smo 2026-10-15 na `GET /api2/glavadokumenta/view/:id` izmerili uspešen 200 po **8794 ms** in drug odgovor prekinjen po **15003 ms**. To dokazuje počasno branje, ne dokazuje pa vzroka 403. Diagnostika zdaj zajame le redigirano pot, metodo, status, vrsto JSON/HTML, znake zaščitnega izziva ter referenco edge, kadar je vrnjena; ne beleži podatkov dokumentov ali skrivnosti.

**Vprašanje:** Ali lahko po času dogodka ugotovite točen endpoint in razlog 403 ter potrdite, ali obstajajo omejitve IP-jev Vercel, sočasnih zahtev ali pogostosti na API uporabnika? Ali zavrnitev izvira iz API pravic ali WAF/zaščite? Kakšni so podprti strežniški pogoji prijave, priporočena meja sočasnih READ, časovna omejitev in oblika odgovora pri omejevanju? Prosimo za korelacijski ID oziroma navodilo, katero neobčutljivo referenco naj zajamemo ob naslednjem dogodku.

To je pripravljeno vprašanje; ni bilo poslano.
