'use client';
import {CaseWorkForm} from './CaseWorkForms';
/** Reuse the private case-evidence upload, including its server-side authorization. */
export function WorkOrderPhotoUpload({caseId}:{caseId:string}) {
 return <section aria-label="Fotografije popravila" className="space-y-3"><h2 className="font-semibold">Fotografije popravila</h2><CaseWorkForm caseId={caseId} mode="photo"/></section>;
}
