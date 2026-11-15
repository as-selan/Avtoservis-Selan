import {hostedQuibiEnvironment} from './deployment-policy';
/** Existing owner permission is unchanged; administrator extension is hosted DEV only. */
export function canConfirmQuibiVehicleCreate(role:string,env:Record<string,string|undefined>):boolean {
 if(role==='owner')return true;
 if(role!=='admin')return false;
 try{return hostedQuibiEnvironment(env)==='dev'}catch{return false}
}
