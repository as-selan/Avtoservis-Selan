import type {ReactNode} from 'react';
import {caseSectionOrder} from '@/lib/cases/workspace';
import {CaseAnchorNavigation} from './CaseAnchorNavigation';
export type CaseWorkspaceSection={id:string;title:string;content:ReactNode};
export function CaseWorkspace({activeHref,progressKey=activeHref,sections}:{activeHref:string;progressKey?:string;sections:CaseWorkspaceSection[]}){
 const order=caseSectionOrder(activeHref,sections.map(section=>section.id));
 return <div aria-label="Opravila primera" className="divide-y divide-slate-200" data-case-workspace>
  <CaseAnchorNavigation activeHref={activeHref} progressKey={progressKey}/>
  {order.map((id,index)=>{const section=sections.find(item=>item.id===id)!;
   // Stable element types and keys preserve unfinished forms across refreshes.
   return <details key={id} open={index===0||undefined} data-case-active={index===0?id:undefined} data-case-secondary={index===0?undefined:id} className="py-4 [&_section.rounded-xl]:rounded-none [&_section.rounded-xl]:border-0 [&_section.rounded-xl]:p-0">
    <summary className={`cursor-pointer font-medium ${index===0?'text-lg text-slate-950':'text-sm text-slate-600'}`}>{section.title}</summary>
    <div className="mt-4 space-y-4">{section.content}</div>
   </details>;
  })}
 </div>;
}
