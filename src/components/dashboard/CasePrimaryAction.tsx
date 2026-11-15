"use client";
import {useEffect,useRef,useState,cloneElement,isValidElement,type ReactElement,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
/** Move the active business button, not a duplicate navigation link, into the case header. */
export function CasePrimaryAction({children,inline=false}:{children:ReactNode;inline?:boolean}){
 const marker=useRef<HTMLSpanElement>(null),[slot,setSlot]=useState<HTMLElement|null>(null);
 useEffect(()=>{
  const node=marker.current;
  if(inline||!node||!node.closest('[data-case-active]')||node.closest('details'))return;
  let target:HTMLElement|null=null,timer:ReturnType<typeof setTimeout>|undefined;
  const attach=()=>{const candidate=document.getElementById('case-primary-action');if(!candidate)return;observer?.disconnect();if(candidate.childElementCount||candidate.dataset.primaryReserved)return;target=candidate;target.dataset.primaryReserved='yes';timer=setTimeout(()=>setSlot(candidate),0);};
  const observer=typeof MutationObserver==='undefined'?null:new MutationObserver(attach);
  attach();if(!target&&!document.getElementById('case-primary-action'))observer?.observe(document.body,{childList:true,subtree:true});
  return()=>{observer?.disconnect();if(timer)clearTimeout(timer);if(target)delete target.dataset.primaryReserved;};
 },[inline]);
 return <><span ref={marker} hidden aria-hidden="true"/>{slot&&!inline?createPortal(isValidElement(children)?cloneElement(children as ReactElement<Record<string,unknown>>,{'data-case-primary':true}):children,slot):children}</>;
}
