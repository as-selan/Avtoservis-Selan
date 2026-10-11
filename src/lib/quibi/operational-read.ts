import {parseVehicleDetail} from './contracts.ts';

const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('QUIBI_INVALID_OPERATIONAL_DATA');return v as Record<string,unknown>};
const text=(v:unknown)=>typeof v==='string'||typeof v==='number'?String(v).trim():'';
function rows(v:unknown,key:string){const e=object(v);if(e.error!==false)throw Error('QUIBI_OPERATIONAL_READ_REJECTED');const a=object(e.data)[key];if(!Array.isArray(a)||a.length>50000)throw Error('QUIBI_INVALID_OPERATIONAL_DATA');return a;}
export function parseAddresses(v:unknown,customerId:string){return rows(v,'Addresses').map(v=>{const row=object(v),a=object(row.Address??row);if(text(a.stranka_id)!==customerId)throw Error('QUIBI_ADDRESS_CUSTOMER_MISMATCH');return {id:text(a.id),street:text(a.naslov),town:text(a.posta),postalCode:text(a.postnaSt),countryId:text(a.drzava_id),typeId:text(a.addresstype_id)}})}
export function parseLots(v:unknown){return rows(v,'Loti').map(v=>{const row=object(v),l=object(row.Loti??row);if(!text(l.id)||!text(l.sifra))throw Error('QUIBI_INVALID_OPERATIONAL_DATA');return {id:text(l.id),code:text(l.sifra),expiry:text(l.roktrajanja),active:text(l.aktiven),unitId:text(l.enota_id)}})}
export function parseStock(v:unknown){return rows(v,'TrenutnaZaloga').map(v=>{const r=object(v),a=object(r.s),e=object(r.e),l=object(r.l),q=text(object(r['0']).zaloga);if(!/^[1-9][0-9]*$/.test(text(l.sifranti_id))||!text(a.naziv)||!/^[-+]?\d+(\.\d+)?$/.test(q)||!Number.isFinite(Number(q)))throw Error('QUIBI_INVALID_OPERATIONAL_DATA');return {articleId:text(l.sifranti_id),code:text(a.sifra),name:text(a.naziv),unit:text(e.naziv),quantity:q}})}
export function parsePaymentMethods(v:unknown){return rows(v,'Placila').map(v=>text(object(object(v).Placila).naziv)).filter(Boolean)}

export function parseDocumentPayments(v:unknown,documentId:string){
 const e=object(v);if(e.error!==false)throw Error('QUIBI_OPERATIONAL_READ_REJECTED');const data=object(e.data),arrays=Object.values(data).filter(Array.isArray);
 if(arrays.length!==1||arrays[0].length>10000)throw Error('QUIBI_PAYMENT_FORMAT_UNCONFIRMED');
 return arrays[0].map(v=>{const row=object(v),p=object(row.Delnaplacila??row),amount=text(p.placilo);if(p.model_id!=null&&text(p.model_id)!==documentId)throw Error('QUIBI_PAYMENT_DOCUMENT_MISMATCH');if(!/^-?\d+(\.\d+)?$/.test(amount)||!Number.isFinite(Number(amount)))throw Error('QUIBI_PAYMENT_FORMAT_UNCONFIRMED');return {id:text(p.id),amount,date:text(p.datumplacila),method:text(p.nacinplacila)}});
}

export function parseVehicleInfo(v:unknown,vehicleId:string,customerId:string){
 const vehicle=parseVehicleDetail(v,vehicleId,customerId),details=object(object(object(v).data).Vozilo),header=object(details.Vozila),template=details.ServisnaPredloga==null?null:object(details.ServisnaPredloga),dates=details.Vdata;
 if(dates!=null&&!Array.isArray(dates))throw Error('QUIBI_VEHICLE_DATE_FORMAT_UNCONFIRMED');
 return {vehicle,note:text(header.opomba),warrantyUntil:text(header.garancijado),serviceTemplate:template&&text(template.id)?{id:text(template.id),name:text(template.naziv)}:null,dates:(dates??[]).map((v:unknown)=>{const r=object(v),d=object(r.Vdata??r),kind=object(r.Vdatumi??{});if(!text(d.datum))throw Error('QUIBI_VEHICLE_DATE_FORMAT_UNCONFIRMED');return {date:text(d.datum),name:text(kind.naziv)||'Datum vozila'}})};
}
