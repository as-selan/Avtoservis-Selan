export const quibiCatalogs={numberings:{path:'/api2/stevilcenje?glavadokumenta=1',key:'Stevilcenje',inner:'Stevilcenje',label:'Številčenja dokumentov'},statuses:{path:'/api2/statusi',key:'Statusi',inner:'Statusi',label:'Statusi dokumentov'},units:{path:'/api2/enota',key:'Enote',inner:'Enota',label:'Enote'},vat:{path:'/api2/ddv',key:'DDV',inner:'Ddv',label:'DDV'},saleTypes:{path:'/api2/glavadokumenta/vrstaprodaje',key:'',inner:'',label:'Vrste prodaje'}} as const;
export type QuibiCatalogKind=keyof typeof quibiCatalogs;
export function parseQuibiCatalog(value:unknown,kind:QuibiCatalogKind):{id:string;label:string}[]{
 if(!value||typeof value!=='object'||!Object.hasOwn(quibiCatalogs,kind))throw Error('QUIBI_INVALID_CATALOG');
 const envelope=value as {error:unknown;data:Record<string,unknown>};if(envelope.error!==false||!envelope.data||typeof envelope.data!=='object')throw Error('QUIBI_INVALID_CATALOG');
 const spec=quibiCatalogs[kind];
 const entries:unknown[]=kind==='saleTypes'?Object.entries(envelope.data).map(([id,label])=>({id,naziv:label})):Array.isArray(envelope.data[spec.key])?(envelope.data[spec.key] as Record<string,unknown>[]).map(row=>row[spec.inner]):(()=>{throw Error('QUIBI_INVALID_CATALOG')})();
 if(entries.length>1000)throw Error('QUIBI_INVALID_CATALOG');
 return entries.map(entry=>{if(!entry||typeof entry!=='object')throw Error('QUIBI_INVALID_CATALOG');const item=entry as Record<string,unknown>,id=String(item.id??''),label=String(item.naziv??'').trim();if(!/^\d+$/.test(id)||!label)throw Error('QUIBI_INVALID_CATALOG');return {id,label}});
}
