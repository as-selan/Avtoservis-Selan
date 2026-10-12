export function businessFormStart(references: {document_kind:string}[]) {
 const order=references.some(r=>r.document_kind==='work_order');
 const invoice=references.some(r=>r.document_kind==='invoice');
 return {kind:order?'invoice':'work_order',operation:invoice?'update':'create'};
}
export function businessDispatchMayContinue(result:{ok:boolean;dispatchStarted?:boolean}) {
 return !result.ok&&result.dispatchStarted===false;
}

/** READ preparation is safe only when no business header decision is ambiguous. */
export function businessPreparationCanAutoload(input:{caseId?:string;kind:string;operation:string;numberingCount:number}){
 return !!input.caseId&&['work_order','invoice'].includes(input.kind)&&input.operation==='create'&&input.numberingCount===1;
}

export function hasRecordedCustomerApproval(row:{customer_decision:string|null;decided_at:string|null;decision_evidence_reference:string|null;revoked_at:string|null;content_sha256:string},sha:string){
 return row.customer_decision==='approved'&&row.revoked_at===null&&row.content_sha256===sha&&!!row.decided_at&&Number.isFinite(Date.parse(row.decided_at))&&!!row.decision_evidence_reference&&row.decision_evidence_reference.trim().length>=4;
}

/** Called only for the explicit business submit button, never automatic READ preparation. */
export function businessDispatchConfirmation(sha:string|undefined){
 if(!sha||! /^[a-f0-9]{64}$/.test(sha))throw Error('BUSINESS_PREPARATION_REQUIRED');
 return {dispatch:'yes',confirmed:'yes',expectedSha:sha};
}
