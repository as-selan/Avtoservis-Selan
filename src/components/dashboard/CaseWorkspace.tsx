import type {ReactNode} from 'react';
import {caseSectionOrder} from '@/lib/cases/workspace';
import {CaseAnchorNavigation} from './CaseAnchorNavigation';
export type CaseWorkspaceSection={id:string;title:string;content:ReactNode};
export function CaseWorkspace({activeHref,sections}:{activeHref:string;sections:CaseWorkspaceSection[]}){
 const order=caseSectionOrder(activeHref,sections.map(section=>section.id));
 return <div aria-label="Opravila primera" className="space-y-4" data-case-workspace>
  <CaseAnchorNavigation/>
  {order.map((id,index)=>{const section=sections.find(item=>item.id===id)!;
   return index===0?<div key={id} data-case-active={id} className="space-y-3"><h2 className="text-lg font-semibold text-slate-950">Nadaljujte tukaj · {section.title}</h2>{section.content}</div>
    :<details key={id} className="rounded-xl border border-slate-200 bg-white p-4" data-case-secondary={id}><summary className="cursor-pointer font-medium text-slate-700">{section.title}</summary><div className="mt-3 space-y-3">{section.content}</div></details>;
  })}
 </div>;
}
