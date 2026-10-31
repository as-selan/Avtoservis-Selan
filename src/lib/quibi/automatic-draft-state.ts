import type {AutomaticDraftState} from './automatic-estimate-draft';
export function automaticDraftPresentation(state:AutomaticDraftState|null|undefined){
 if(state==='ready')return {label:'Predračun je pripravljen – Preglej in potrdi.',action:'Preglej in potrdi',href:'#predracun'};
 if(state==='ambiguous')return {label:'Ujemanje ni jasno – Izberi storitev.',action:'Izberi storitve',href:'#predracun'};
 if(state==='missing_price')return {label:'Manjka cena – Vnesi ceno.',action:'Vnesi ceno',href:'#predracun'};
 if(state==='needs_data')return {label:'Izberite storitve za predračun.',action:'Izberi storitve',href:'#predracun'};
 if(state==='blocked'||state==='failed')return {label:'Manjkajo podatki za pripravo predračuna.',action:'Dopolni manjkajoče podatke',href:'#podatki'};
 return {label:'Selan pripravlja predračun.',action:'Poglej pripravo',href:'#predracun'};
}
