type AccessRole='owner'|'admin'|'reception'|'mechanic';
export type OnboardingDependencies={identity:()=>Promise<string|null>;updatePassword:(password:string)=>Promise<boolean>;acceptInvitation:()=>Promise<boolean>;activeWorkshopRole:(userId:string)=>Promise<string|null>};
/** Runs only on the authenticated password submission; route guards never create membership. */
export async function completePasswordOnboarding(password:string,confirm:string,d:OnboardingDependencies):Promise<{destination:string}|{error:string}>{
 if(password.length<10||password.length>256)return {error:'Geslo mora imeti med 10 in 256 znakov.'};if(password!==confirm)return {error:'Gesli se ne ujemata.'};
 const userId=await d.identity();if(!userId)return {error:'Povezava ali seja ni več veljavna. Zahtevajte novo povabilo oziroma obnovitev gesla.'};
 if(!await d.updatePassword(password))return {error:'Gesla ni bilo mogoče nastaviti. Poskusite znova.'};
 // Existing members may be recovering a password before the team migration exists.
 // Failure or no match never grants access: the scoped active membership is authoritative.
 let accepted=false;try{accepted=await d.acceptInvitation()}catch{/* membership lookup still fails closed */}
 const role=await d.activeWorkshopRole(userId);
 if(!role||!(['owner','admin','reception','mechanic'] as AccessRole[]).includes(role as AccessRole))return {error:'Geslo je shranjeno, dostop pa ni potrjen. Povabilo je lahko preklicano, poteklo ali ni za Avtoservis Selan. Obrnite se na lastnika; namestitev migracije mora biti potrjena.'};
 if(accepted&&role!=='mechanic')return {error:'Članstva povabila ni mogoče varno potrditi. Obrnite se na lastnika.'};
 return {destination:role==='mechanic'?'/dashboard/mehanik':'/dashboard'};
}
