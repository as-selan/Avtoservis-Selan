/** A reference is historical evidence, never an assertion that current content is unchanged. */
export function documentReferenceState(confirmedSha:string,currentSha:string|null):'unchanged'|'changed'|'unavailable'{
 if(!/^[a-f0-9]{64}$/.test(confirmedSha)||!currentSha||!/^[a-f0-9]{64}$/.test(currentSha))return 'unavailable';
 return confirmedSha===currentSha?'unchanged':'changed';
}
