
/** Program features are not evidence that an API exists. No guessed routes. */
export const missingQuibiApis=[
 {name:'Fotografije in priloge',program:'Dostopnost v programu ni neodvisno potrjena',operations:['Upload binarne fotografije z MIME/velikostjo in idempotency ključem','Seznam prilog poslovnega naloga in vozila s pripadnostjo podjetju','Varen download ali časovno omejen predogled','Povezava priloge z ID-jem vozila in poslovnega naloga ter revizijska sled']},
 {name:'Servisna zgodovina in intervali',program:'Funkcija je dokumentirana v programu Quibi',operations:['Branje servisne zgodovine vozila in postavk naloga','Branje servisnih predlog, intervalov in zapadlosti','Evidentiranje opravljene servisne postavke z datumom, kilometri in opombo']},
 {name:'Zaposleni in dodelitve',program:'Ustrezna programska funkcija za to integracijo ni potrjena',operations:['Seznam dovoljenih zaposlenih in pravic podjetja','Branje in sprememba dodelitve servisnega naloga','Dovoljenja mehanika za pripadajoči nalog in dokumente']},
 {name:'Hranjenje pnevmatik',program:'Funkcija je dokumentirana v programu Quibi',operations:['Seznam in detajl potrdil sprejema/izdaje za vozilo','Ustvarjanje potrdila s pnevmatikami, lokacijo in loti','PDF in status potrdila z dokumentiranim tipom/številčenjem']},
] as const;
