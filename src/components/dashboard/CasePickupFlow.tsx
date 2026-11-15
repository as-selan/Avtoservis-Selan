"use client";
import {useEffect,useState,type ReactNode} from 'react';
import {revealCaseSection} from '@/lib/cases/navigation';
/** View navigation only: no business event is recorded until the pickup button is clicked. */
export function CasePickupFlow({summary,children}:{summary:ReactNode;children:ReactNode}){
 const [pickup,setPickup]=useState(false);
 useEffect(()=>{const update=()=>setPickup(window.location.hash==='#prevzem');window.addEventListener('hashchange',update);update();return()=>window.removeEventListener('hashchange',update);},[]);
 useEffect(()=>{if(pickup)revealCaseSection('#prevzem');},[pickup]);
 return <div onClick={event=>{const anchor=event.target instanceof Element?event.target.closest('a[href]'):null;if(anchor instanceof HTMLAnchorElement&&new URL(anchor.href).hash==='#prevzem')setPickup(true);}}>
  <div hidden={pickup}>{summary}</div><div hidden={!pickup}>{children}</div>
 </div>;
}
