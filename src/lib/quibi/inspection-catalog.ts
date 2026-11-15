/** Suggestions only: persisted inspection text never establishes identity, price or approval. */
export function inspectionCatalogSuggestions<T extends {key:string;name:string;code:string}>(findings:string|null|undefined,options:T[]){
 const normalize=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('sl-SI');
 const matches:T[]=[],unmatched:string[]=[],ambiguous:string[]=[];
 for(const raw of (findings??'').split(/\r?\n/)){
  const line=raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/,'').trim();if(!line)continue;
  const candidates=[...new Map(options.filter(o=>normalize(o.name)===normalize(line)||(o.code.trim()&&normalize(o.code)===normalize(line))).map(o=>[o.key,o])).values()];
  if(candidates.length===1){if(!matches.some(m=>m.key===candidates[0].key))matches.push(candidates[0]);}
  else if(candidates.length>1)ambiguous.push(line);else unmatched.push(line);
 }
 return {matches,unmatched,ambiguous};
}

/** A technical-roadworthiness inspection is not the conditional preliminary repair assessment. */
export function isPretechnicalInspection(name:string){return /pred\s+tehnic/.test(name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());}
