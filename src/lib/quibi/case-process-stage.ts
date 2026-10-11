export function quibiCaseProcessStage(status:string){
 switch(status){
 case 'preparing_offer':return {businessReady:false,label:'Pripravite predračun, preglejte dejanske postavke in odobrite ponudbo. Pošiljanje je ločeno poslovno dejanje.'};
 case 'awaiting_customer_approval':return {businessReady:false,label:'Zabeležite preverljiv odgovor stranke na odobreni predračun. Testni DEV send ne dokazuje dostave stranki.'};
 case 'awaiting_slot_selection':return {businessReady:false,label:'Po odobritvi popravila ponudite termine, zabeležite izbiro in dejansko ročno potrditev termina.'};
 case 'appointment_confirmed':case 'converted':return {businessReady:true,label:'Pripravite poslovni nalog v Quibiju iz odobrenega predračuna. Po opravljenem popravilu pripravite račun iz preverjenega Quibi naloga.'};
 default:return null;
 }
}
