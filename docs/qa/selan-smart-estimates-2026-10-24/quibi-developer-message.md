# Osnutek sporočila za Quibi – ni poslano

Pozdravljeni,

v Quibi DEV smo prek dokumentiranih READ seznamov POST /api2/predracuni, /api2/dn in /api2/fakture uspešno prebrali 282 predračunov, 271 nalogov in 258 računov. Vsi vrnjeni statusi so prazni. GET /api2/glavadokumenta/view/2176932 in /2176931 vrača Statusi: {id:null,naziv:null}; številka dokumenta, postavke, neto cene, količine in DDV so na voljo.

Za varen cenovni predlog iz zgodovine potrebujemo pojasnilo:

1. Katero dokumentirano polje zanesljivo loči izdan/veljaven dokument od storniranega, preklicanega ali popravljenega? Je Statusi zgolj uporabniški šifrant, ne računovodsko stanje?
2. Kako po READ API-ju povežemo dobropis/popravke z izvirnim računom in upoštevamo delno stornirane postavke? Glava vsebuje glava_id, veza_id, vezapredracun_id in vezaracun_id; potrebujemo potrjeno semantiko teh povezav.
3. Ali seznam dokumentov podpira dokumentirano paginacijo poleg Filtriraj.datod/datdo/stranka, in kakšen je vrstni red?
4. Ali obstaja READ izračun dokumenta pred CREATE, ki vrne končni bruto znesek in davčno zaokroževanje? Takšnega klica v trenutni dokumentaciji nismo našli.

Trenutno statusa ne ugibamo in ne predstavljamo starega predračuna kot dokaza opravljenega ali plačanega dela. Zgodovinski cenovni predlog je ob nezadostnih dokazih izključen. Noben dokument v tem preverjanju ni ustvarjen, popravljen ali poslan.

Hvala.
