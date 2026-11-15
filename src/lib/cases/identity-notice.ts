/** Presentation only: never clears stored errors or authorizes a business action. */
export type CaseIdentitySnapshot={
 environment:string|null; customerId:string|null; vehicleId:string|null;
 customerSyncStatus:string|null; vehicleSyncStatus:string|null;
 customerEnvironment:string|null; vehicleEnvironment:string|null; resolvedVehicleNeedsReview:boolean;
};
export function currentCaseIdentity(p:CaseIdentitySnapshot):boolean{
 return (p.environment==='dev'||p.environment==='production')&&!!p.customerId&&!!p.vehicleId&&
  p.customerSyncStatus==='ok'&&p.vehicleSyncStatus==='ok'&&
  p.customerEnvironment===p.environment&&p.vehicleEnvironment===p.environment&&!p.resolvedVehicleNeedsReview;
}
const obsoleteIdentityMessages=new Set([
 'Identiteta ali zahtevek zahteva ročni pregled. Nov zapis ni dovoljen.',
 'Po popravku povpraševanja izberite in potrdite pravo Quibi vozilo v tem primeru. Če ga ni, novo vozilo izrecno potrdi lastnik; samodejni CREATE je ustavljen.',
 'Vozila v Quibiju ni mogoče potrditi. V tem primeru pripravite novo vozilo in pridobite izrecno potrditev lastnika. Samodejni CREATE ni dovoljen.',
 'Stranka je povezana. Za povezavo vozila dopolnite VIN, registracijo, znamko in model.',
]);
/** Only recognized historical automatic-identity messages can be superseded by current links.
 * Unknown outcomes and unrelated errors always remain visible. */
export function visibleIdentityNotice(notice:string|null|undefined,identityConfirmed:boolean):string|null{
 if(!notice)return null;
 if(!identityConfirmed||!notice.startsWith('Quibi povezava: '))return notice;
 const message=notice.slice('Quibi povezava: '.length).trim();
 return obsoleteIdentityMessages.has(message)||message.startsWith('Samodejna povezava še ni omogočena')?null:notice;
}
