export function isDefinitiveQuibiRejection(error: unknown): boolean {
 return error instanceof Error && /^(QUIBI_API_REJECTED|QUIBI_HTTP_(400|401|403|404|405|410|422))$/.test(error.message);
}
export function sendPresentation(op: {state:string;sendId:string|null;sendStatus:string|null}|null) {
 if(!op)return {outcome:null,canSend:true,message:""};
 if(op.sendStatus==="failed")return {outcome:"REJECTED",canSend:false,message:"Quibi je dokončno zavrnil pošiljanje. Ta različica je zaklenjena; samodejne ponovitve ni."};
 if(op.sendId)return {outcome:"ACCEPTED",canSend:false,message:op.sendStatus==="sent"?"Predano poštnemu strežniku. Prejem pri naslovniku ni potrjen.":"Quibi je sprejel zahtevo v čakalno vrsto. Končna predaja še ni potrjena."};
 return {outcome:"UNKNOWN",canSend:false,message:"Izid pošiljanja ni znan. Ne pošiljajte ponovno. Brez send_id statusa ni mogoče preveriti: administrator mora pri Quibi pridobiti dnevnik za dokument, čas, prejemnika in referenco spodaj. Razrešitev zahteva preverljiv odgovor ponudnika."};
}
