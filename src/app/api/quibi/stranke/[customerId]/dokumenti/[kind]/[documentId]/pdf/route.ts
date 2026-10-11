import {requirePhase1OperationalAccess} from '@/lib/auth/requireWorkshopAccess';
import {configuredQuibiReadClient} from '@/lib/quibi/client';
import {assertDirectDevRead,loadDirectDevPdf,type DirectDocumentScope} from '@/lib/quibi/direct-document-read';
export async function GET(_request:Request,{params}:{params:Promise<DirectDocumentScope>}){
 const access=await requirePhase1OperationalAccess(),scope=await params;
 try{assertDirectDevRead({...process.env,APP_ENV:process.env.APP_ENV,QUIBI_MODE:process.env.QUIBI_MODE},access.role,scope);}catch{return new Response('Dokument ni na voljo.',{status:403,headers:{'Cache-Control':'private, no-store'}});}
 try{const bytes=await loadDirectDevPdf(configuredQuibiReadClient(),scope);return new Response(bytes.buffer as ArrayBuffer,{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="quibi-'+scope.documentId+'.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch{return new Response('PDF dokumenta ni mogoče preverjeno pridobiti.',{status:502,headers:{'Cache-Control':'private, no-store'}});}
}
