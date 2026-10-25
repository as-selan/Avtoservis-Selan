"use client";
import {useEffect} from 'react';import {useRouter} from 'next/navigation';
/** Refresh provider payment evidence in the background, without another operator task. */
export function QuibiPaymentRefresh(){const router=useRouter();useEffect(()=>{let last=Date.now();const refresh=()=>{if(document.visibilityState!=='visible'||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')||Date.now()-last<30000)return;last=Date.now();router.refresh();};const timer=window.setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);};},[router]);return null;}
