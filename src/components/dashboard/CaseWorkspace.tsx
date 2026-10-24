import type {ReactNode} from 'react';
import {caseSectionOrder} from '@/lib/cases/workspace';
import {CaseAnchorNavigation} from './CaseAnchorNavigation';
export type CaseWorkspaceSection={id:string;title:string;content:ReactNode};
export function CaseWorkspace({activeHref,progressKey=activeHref,sections,details}:{activeHref:string;progressKey?:string;sections:CaseWorkspaceSection[];details?:ReactNode}){
 const order=caseSectionOrder(activeHref,sections.map(section=>section.id));const active=sections.find(section=>section.id===order[0]);
 return <div aria-label="Opravila primera" className="space-y-4" data-case-workspace>
  <CaseAnchorNavigation activeHref={activeHref} progressKey={progressKey}/>
  {active&&<section key={active.id} data-case-active={active.id} className="space-y-3 [&_section.rounded-xl]:rounded-none [&_section.rounded-xl]:border-0 [&_section.rounded-xl]:p-0">{active.content}</section>}
  <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-medium text-slate-600">Več podrobnosti</summary><div className="mt-4 space-y-4">
   {order.slice(1).map(id=>{const section=sections.find(item=>item.id===id)!;return <details key={id} data-case-secondary={id}><summary className="cursor-pointer py-2 text-sm font-medium">{section.title}</summary><div className="py-3">{section.content}</div></details>})}{details}
  </div></details>
 </div>;
}
