"use client";
import {useEffect} from 'react';
import {installCaseNavigation} from '@/lib/cases/navigation';
/** Background server refresh preserves scroll/focus. Only explicit links navigate. */
export function CaseAnchorNavigation(props:{activeHref:string;progressKey:string;closed?:boolean}){
 useEffect(()=>{if(props.closed&&['#prevzem','#naslednji-korak'].includes(window.location.hash)){const url=new URL(window.location.href);url.hash='';window.history.replaceState(window.history.state,'',url);}return installCaseNavigation();},[props.closed]);
 return null;
}
