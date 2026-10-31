export function inviteEmail(value:unknown){if(typeof value!=="string")throw Error('INVALID_EMAIL');const email=value.trim().toLowerCase();if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('INVALID_EMAIL');return email;}
export function ownerAction(role:string,confirmed:unknown){if(role!=='owner'||confirmed!=='yes')throw Error('FORBIDDEN');}
export async function dispatchTeamInvitation(args:{email:string;prepare:()=>Promise<string>;invite:(email:string)=>Promise<{userId:string|null;rejected:boolean}>;finish:(id:string,user:string|null,state:string)=>Promise<void>}){
 const id=await args.prepare();let reply;try{reply=await args.invite(args.email)}catch{await args.finish(id,null,'uncertain');throw Error('INVITE_UNKNOWN')}
 if(reply.rejected){await args.finish(id,null,'failed');throw Error('INVITE_REJECTED')}
 if(!reply.userId){await args.finish(id,null,'uncertain');throw Error('INVITE_UNKNOWN')}
 await args.finish(id,reply.userId,'sent');return id;
}
