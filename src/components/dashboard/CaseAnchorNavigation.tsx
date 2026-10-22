"use client";
import {useEffect,useRef} from 'react';
import {advanceCaseNavigation,installCaseNavigation} from '@/lib/cases/navigation';
export function CaseAnchorNavigation({activeHref,progressKey}:{activeHref:string;progressKey:string}){
 const previous=useRef(progressKey),editing=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  const uninstall=installCaseNavigation();
  const remember=(event:FocusEvent)=>{const target=event.target;editing.current=target instanceof HTMLElement&&(target.isContentEditable||target.matches('input,textarea,select'))?target:null;};
  document.addEventListener('focusin',remember);
  return ()=>{uninstall();document.removeEventListener('focusin',remember);};
 },[]);
 useEffect(()=>{
  if(previous.current===progressKey)return;
  previous.current=progressKey;
  advanceCaseNavigation(activeHref,editing.current);
 },[activeHref,progressKey]);
 return null;
}
