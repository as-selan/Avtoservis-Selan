export function caseReferenceRange(reference:string){
 const value=reference.replace(/^#/,'').toLowerCase();
 if(!/^[a-f0-9]{8}$/.test(value))return null;
 return {lower:value+'-0000-0000-0000-000000000000',upper:value+'-ffff-ffff-ffff-ffffffffffff'};
}
export function uniqueCaseReference(ids:string[]){const unique=[...new Set(ids)];return unique.length===1?unique[0]:null;}
export async function resolveShortCaseReference(reference:string,organizationId:string,find:(org:string,range:{lower:string;upper:string})=>Promise<string[]>){
 const range=caseReferenceRange(reference);if(!range)return null;
 return uniqueCaseReference(await find(organizationId,range));
}
