export function mechanicName(value:unknown){if(typeof value!=='string')throw Error('INVALID_NAME');const name=value.trim().replace(/\s+/g,' ');if(name.length>120||/[\p{Cc}\p{Cf}]/u.test(name))throw Error('INVALID_NAME');return name;}
export async function saveMechanicName(args:{role:string;organizationId:string;target:string;name:unknown;isMechanic:(org:string,id:string)=>Promise<boolean>;save:(id:string,name:string)=>Promise<void>}){
 if(args.role!=='owner')throw Error('FORBIDDEN');
 if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(args.target))throw Error('INVALID_TARGET');
 const name=mechanicName(args.name);if(!await args.isMechanic(args.organizationId,args.target))throw Error('FORBIDDEN');await args.save(args.target,name);
}
export function memberLabel(member:{name?:string|null;email?:string|null}){return member.name?.trim()||member.email||'Mehanik';}
