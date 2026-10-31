export async function readQuibiPdf(fetcher:typeof fetch,url:string,headers:Record<string,string>,documentId:string){
 const response=await fetcher(url,{method:'POST',headers,body:JSON.stringify({Glavadokumenta:{id:Number(documentId),natisni:3,jezik:'sl'}}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok||!response.headers.get('content-type')?.toLowerCase().startsWith('application/pdf')||!response.body)throw Error('QUIBI_PDF_UNAVAILABLE');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[],limit=10*1024*1024;let length=0;
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>limit)throw Error('QUIBI_PDF_TOO_LARGE');chunks.push(part.value)}}catch(error){await reader.cancel();throw error}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('QUIBI_PDF_INVALID');return bytes;
}
