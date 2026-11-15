"use client";
import {useState} from 'react';
import {isoFromSlovenianDate,slovenianDate} from '@/lib/cases/slovenian-date';
/** Visible Slovenian text; the server receives the unchanged ISO date-only value. */
export function SlovenianDateInput({name,value,required=false,onIsoChange}:{name:string;value?:string;required?:boolean;onIsoChange?:(iso:string)=>void}){
 const [draft,setDraft]=useState({iso:value??'',text:slovenianDate(value??'')});
 if(value!==undefined&&value!==draft.iso)setDraft({iso:value,text:slovenianDate(value)});
 return <><input type="hidden" name={name} value={draft.iso}/><input data-date-display type="text" inputMode="decimal" placeholder="dd. mm. llll" required={required} value={draft.text} className="mt-1 w-full rounded border p-2" onChange={event=>{const text=event.target.value,iso=isoFromSlovenianDate(text);event.target.setCustomValidity(text&&!iso?'Vnesite veljaven datum: dd. mm. llll.':'');setDraft({iso:iso??'',text});onIsoChange?.(iso??'')}} onBlur={()=>{if(draft.iso)setDraft({...draft,text:slovenianDate(draft.iso)})}}/></>;
}
