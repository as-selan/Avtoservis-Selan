export function businessFormStart(references: {document_kind:string}[]) {
 const order=references.some(r=>r.document_kind==='work_order');
 const invoice=references.some(r=>r.document_kind==='invoice');
 return {kind:order?'invoice':'work_order',operation:invoice?'update':'create'};
}
export function businessDispatchMayContinue(result:{ok:boolean;dispatchStarted?:boolean}) {
 return !result.ok&&result.dispatchStarted===false;
}
