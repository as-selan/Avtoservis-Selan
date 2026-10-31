# Enoten Quibi workflow — izvedbeni načrt

Cilj in potrjene zahteve so uporabnikov devet-točkovni opis. Delo poteka na obstoječi veji, brez zunanjih mutacij.

1. Izolirani regresijski testi za konfiguracijo DEV/production, recipient, approval/send, SHA/znesek/identiteto, dvojni klik, timeout in status-only retry.
2. Skupna konfiguracija in API transport. DEV Preview ima izključno testni recipient; production uporablja izključno si.quibi.net in ločene opt-in flags/credentials. Privzeto zaprto.
3. Enoten workflow engine za ustvarjene in povezane dokumente; reuse istega send journala na quote, approval pred dispatchom, svež ponovni pregled. Nikoli create pri pošiljanju.
4. Strežniška avtorizacija, quote pregled in status actions. Production sent se samodejno zapiše kot mail-server acceptance, DEV ne ustvari dostave stranki.
5. Forward-only migracija za ločen production journal in strežniški RPC za avtomatsko evidenco. Samo priprava; hosted apply prepovedan.
6. En UI s prikazom postavk/zneska, approve+send ali send, samodejnim omejenim status pollingom in ločeno zunanjo ročno dostavo.
7. Prilagoditev obstoječih link/create površin za isti okoljski adapter; brez izmišljanja API funkcij za druga sporočila.
8. TS/lint/build/testi/diff, QA omejitve/E2E runbook, commit/push iste veje.

Dokumentiran transport: https://navodila.quibi.net/za-razvijalce/. Produkcijsko omogočanje in dejanski E2E zahtevata ločeno potrditev.
