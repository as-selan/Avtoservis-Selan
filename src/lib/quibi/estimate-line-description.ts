/** Intake permits a requested service OR a problem description. Do not invent a service. */
export function estimateLineDescription(request:{service_wanted?:string|null;problem_description?:string|null}):string|null {
 const description=request.service_wanted?.trim() || '';
 return description.length>0 && description.length<=500 ? description : null;
}
