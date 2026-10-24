"use client";
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
/** Server after() owns processing; this only notices its persisted result. */
export function AutomaticPreparationRefresh({active}:{active:boolean}){const router=useRouter();useEffect(()=>{if(!active)return;let count=0;const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!document.querySelector('[data-unsaved="true"]')&&!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')&&count++<60)router.refresh();if(count>=60)clearInterval(timer)},3000);return()=>clearInterval(timer)},[active,router]);return null;}
