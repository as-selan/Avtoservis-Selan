"use client";
import {useSyncExternalStore} from 'react';
const eventName='selan-invoice-dates';
const memory=new Map<string,string>();
type Dates={serviceDate:string;issueDate:string;dueDate:string};
/** Dates only, scoped to this browser session and case. Never document contents or credentials. */
export function useInvoiceDraftDates(caseId:string,customerId:string,today:string){
 const key='selan:invoice-dates:v1:'+caseId+':'+customerId;
 const fallback=JSON.stringify({serviceDate:'',issueDate:today,dueDate:''});
 const snapshot=useSyncExternalStore(callback=>{window.addEventListener(eventName,callback);return()=>window.removeEventListener(eventName,callback)},()=>{try{return memory.get(key)||sessionStorage.getItem(key)||fallback}catch{return memory.get(key)||fallback}},()=>fallback);
 let dates:Dates;try{const value=JSON.parse(snapshot);dates={serviceDate:valid(value.serviceDate),issueDate:valid(value.issueDate),dueDate:valid(value.dueDate)}}catch{dates={serviceDate:'',issueDate:today,dueDate:''}}
 const update=(name:string,value:string)=>{if(!['serviceDate','issueDate','dueDate'].includes(name))return;const next=JSON.stringify({...dates,[name]:value});memory.set(key,next);try{sessionStorage.setItem(key,next)}catch{/* In-memory dates still allow editing. */}window.dispatchEvent(new Event(eventName))};
 const prefill=(values:Partial<Dates>)=>{let latest=dates;try{const stored=memory.get(key)||sessionStorage.getItem(key);if(stored)latest=JSON.parse(stored)}catch{}const next={...latest};for(const key of ['serviceDate','issueDate','dueDate'] as const)if(!next[key]&&valid(values[key]))next[key]=valid(values[key]);if(JSON.stringify(next)===JSON.stringify(latest))return;const value=JSON.stringify(next);memory.set(key,value);try{sessionStorage.setItem(key,value)}catch{}window.dispatchEvent(new Event(eventName));};
 return {dates,update,prefill,snapshot};
}
function valid(value:unknown){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:''}
