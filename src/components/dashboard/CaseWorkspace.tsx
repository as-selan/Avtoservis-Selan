import type {ReactNode} from 'react';
import {caseSectionOrder} from '@/lib/cases/workspace';
import {CaseAnchorNavigation} from './CaseAnchorNavigation';
export type CaseWorkspaceSection={id:string;title:string;content:ReactNode};
export function CaseWorkspace({activeHref,progressKey=activeHref,sections}:{activeHref:string;progressKey?:string;sections:CaseWorkspaceSection[]}){
 const order=caseSectionOrder(activeHref,sections.map(section=>section.id));
 return <div aria-label="Opravila primera" className="space-y-4" data-case-workspace>
  <CaseAnchorNavigation activeHref={activeHref} progressKey={progressKey}/>
  {order.map((id,index)=>{const section=sections.find(item=>item.id===id)!;
   // Keep the same element type and key across refreshes: an unfinished form must not remount.
   return <details key={id} open={index===0||undefined} data-case-active={index===0?id:undefined} data-case-secondary={index===0?undefined:id} className="rounded-xl border border-slate-200 bg-white p-4">
    <summary className={`cursor-pointer font-medium ${index===0?'text-lg text-slate-950':'text-slate-700'}`}>{index===0?'Nadaljujte tukaj · ':''}{section.title}</summary>
    <div className="mt-3 space-y-3">{section.content}</div>
   </details>;
  })}
 </div>;
}
