export function quibiReadEndpoint(path:string){return path.split('?')[0].replace(/\/\d+(?=\/|$)/g,'/:id').slice(0,160);}

/** Bounded diagnostic metadata only: never emit response text or credential headers. */
export async function quibiReadRejection(response:Response,path:string,method:string){
 const endpoint=quibiReadEndpoint(path);
 const rawType=response.headers.get('content-type')??'';
 const contentType=rawType.includes('application/json')?'application/json':rawType.includes('text/html')?'text/html':'other';
 let sample='';const reader=response.body?.getReader();
 if(reader)try{let remaining=4096;while(remaining>0){const r=await reader.read();if(r.done)break;const part=r.value.subarray(0,remaining);sample+=new TextDecoder().decode(part);remaining-=part.length;}}catch{/* Diagnostics cannot replace the original HTTP failure. */}finally{void reader.cancel().catch(()=>{});}
 const challenge=/cf-chl-|challenge-platform|just a moment|captcha|wordfence|sucuri|mod_security/i.test(sample);
 let apiEnvelope=false;if(contentType==='application/json')try{const value=JSON.parse(sample);apiEnvelope=!!value&&typeof value==='object'&&('error' in value||'errors' in value||'message' in value);}catch{/* Never output an incomplete body. */}
 const ray=response.headers.get('cf-ray')??'';
 return {event:'quibi_read_rejected',endpoint,method,status:response.status,contentType,
  responseKind:challenge?'security_challenge':apiEnvelope?'api_envelope':contentType==='text/html'?'html_denial':'unclassified',
  ...( /^[a-f0-9]{8,32}-[a-z]{3}$/i.test(ray)?{edgeReference:ray}:{}),
  edge:response.headers.get('server')?.toLowerCase().includes('cloudflare')?'cloudflare':'not_identified'};
}
