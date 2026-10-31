export function quibiCaseProcessStage(status:string,customerApproved=false){
 switch(status){
 case 'preparing_offer':return {businessReady:customerApproved,label:'Pripravite predračun, preglejte dejanske postavke in odobrite ponudbo. Pošiljanje je ločeno poslovno dejanje.'};
 case 'awaiting_customer_approval':return {businessReady:customerApproved,label:'Zabeležite preverljiv odgovor stranke na odobreni predračun. Testni DEV send ne dokazuje dostave stranki.'};
 case 'awaiting_slot_selection':return {businessReady:true,label:'Po potrditvi popravila pripravite nalog v Quibiju. Termin lahko uredite ločeno; ni pogoj za pripravo poslovnega dokumenta.'};
 case 'appointment_confirmed':case 'converted':return {businessReady:true,label:'Pripravite poslovni nalog v Quibiju iz odobrenega predračuna. Po opravljenem popravilu pripravite račun iz preverjenega Quibi naloga.'};
 default:return null;
 }
}
