/** A full 128-bit UUID in 22 characters: no prefix truncation or collision-prone shortening. */
export function customerRemoteId(uuid:string):string{
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(uuid))throw Error('QUIBI_INVALID_CUSTOMER_INPUT');
 return Buffer.from(uuid.replaceAll('-',''),'hex').toString('base64url');
}
export function validCustomerRemoteId(value:string):boolean{
 return /^[a-f0-9-]{36}$/i.test(value)||(/^[A-Za-z0-9_-]{22}$/.test(value)&&Buffer.from(value,'base64url').length===16&&Buffer.from(value,'base64url').toString('base64url')===value);
}
