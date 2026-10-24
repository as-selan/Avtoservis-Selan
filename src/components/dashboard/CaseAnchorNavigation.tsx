"use client";
import {useEffect} from 'react';
import {installCaseNavigation} from '@/lib/cases/navigation';
/** Background server refresh preserves scroll/focus. Only explicit links navigate. */
export function CaseAnchorNavigation(props:{activeHref:string;progressKey:string}){
 void props;
 useEffect(()=>installCaseNavigation(),[]);
 return null;
}
