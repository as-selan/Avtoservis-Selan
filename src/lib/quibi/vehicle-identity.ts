export function assertSamePhysicalVehicle(local:{vin:string|null},remote:{vin:string;disabled:boolean}){const vin=local.vin?.trim().toUpperCase();if(!vin||vin!==remote.vin.trim().toUpperCase()||remote.disabled)throw Error('VEHICLE_IDENTITY_MISMATCH');}

/** A reviewed correction is not authorization for another automatic party CREATE. */
export function requiresResolvedVehicleConfirmation(hasResolution:boolean,syncStatus:string|undefined){return hasResolution&&syncStatus!=='ok';}
