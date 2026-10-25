"use client";
import {useEffect,useRef,useState,cloneElement,isValidElement,type ReactElement,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
/** Move the active business button, not a duplicate navigation link, into the case header. */
export function CasePrimaryAction({children}:{children:ReactNode}){
 const marker=useRef<HTMLSpanElement>(null),[slot,setSlot]=useState<HTMLElement|null>(null);
 useEffect(()=>{
  const node=marker.current,target=document.getElementById('case-primary-action');
  if(!node||!target||!node.closest('[data-case-active]')||node.closest('details'))return;
  if(target.childElementCount||target.dataset.primaryReserved)return;
  target.dataset.primaryReserved='yes';const timer=setTimeout(()=>setSlot(target),0);
  return()=>{clearTimeout(timer);delete target.dataset.primaryReserved;};
 },[]);
 return <><span ref={marker} hidden aria-hidden="true"/>{slot?createPortal(isValidElement(children)?cloneElement(children as ReactElement<Record<string,unknown>>,{'data-case-primary':true}):children,slot):children}</>;
}
