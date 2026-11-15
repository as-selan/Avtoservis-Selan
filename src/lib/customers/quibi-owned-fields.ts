/** Intake contacts remain editable until linked. Quibi-linked business identity uses Quibi operations. */
 export function changesQuibiIdentity(linked:boolean,current:Record<string,unknown>,proposed:Record<string,unknown>,keys:readonly string[]):boolean{
  const comparable=(key:string,value:unknown)=>typeof value==='string'&&['email','vin'].includes(key)?value.trim().toLowerCase():value??null;
  return linked&&keys.some(key=>comparable(key,current[key])!==comparable(key,proposed[key]));
 }
 export const QUIBI_IDENTITY_EDIT_MESSAGE='Poslovni podatki so povezani s Quibijem. Spremembo stranke ali vozila izvedite prek potrjene Quibi operacije; lokalno lahko urejate opombe.';
