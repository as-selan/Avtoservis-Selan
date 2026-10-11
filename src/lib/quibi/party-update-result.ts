export type PartyUpdateResult = {ok:boolean;state:'verified'|'rejected'|'blocked'|'unknown';message:string};
export function partyUpdateFailure(error:unknown):PartyUpdateResult {
 const code=error instanceof Error?error.message:'';
 if(code==='QUIBI_UPDATE_REJECTED')return {ok:false,state:'rejected',message:'Quibi je spremembo dokončno zavrnil. Nova zahteva ni poslana; preverite dnevnik operacije.'};
 if(['QUIBI_INVALID_PARTY_UPDATE','QUIBI_UPDATE_CHANGED','QUIBI_PARTY_CHANGED','IDENTITY_UNVERIFIED','CONTACT_REQUIRED','VEHICLE_UNVERIFIED'].includes(code))return {ok:false,state:'blocked',message:'Priprava je ustavljena: preverite identiteto, spremembe podatkov in morebitno nerešeno operacijo. WRITE ni potrjen.'};
 return {ok:false,state:'unknown',message:'Izid zahteva pregled dnevnika. Ponovno zapisovanje je ustavljeno; uporabite samo READ za razrešitev.'};
}
