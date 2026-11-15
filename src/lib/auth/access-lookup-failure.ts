export type AccessLookupFailure = 'reauthenticate' | 'unavailable' | 'denied';
/** Database JWT rejection is an authentication failure, never proof of absent membership. */
export function accessLookupFailure(error: {code?:string}|null, found:boolean): AccessLookupFailure|null {
  if(error?.code === 'PGRST301' || error?.code === 'PGRST302' || error?.code === 'PGRST303') return 'reauthenticate';
  if(error) return 'unavailable';
  return found ? null : 'denied';
}
