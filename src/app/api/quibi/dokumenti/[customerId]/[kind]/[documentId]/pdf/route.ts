import {requirePhase1OperationalAccess} from '@/lib/auth/requireWorkshopAccess';
import {canQueryCustomerId} from '@/lib/customers/present';
import {createClient} from '@/lib/supabase/server';
import {configuredQuibiReadClient} from '@/lib/quibi/client';
import {documentKindLabels,loadQuibiDocument,type QuibiDocumentKind} from '@/lib/quibi/document-read';
import {quibiLinkEnvironment} from '@/lib/quibi/workflow-config';
export async function GET(_request:Request,{params}:{params:Promise<{customerId:string;kind:string;documentId:string}>}){
 const access=await requirePhase1OperationalAccess(),{customerId,kind,documentId}=await params;
 if(!canQueryCustomerId(customerId)||!Object.hasOwn(documentKindLabels,kind)||!/^\d+$/.test(documentId))return new Response('Dokument ni na voljo.',{status:404});
 try{
 const db=await createClient();const {data:link}=await db.from('integration_links').select('external_id,quibi_environment').eq('organization_id',access.organizationId).eq('entity_id',customerId).eq('provider','quibi').eq('entity_type','customer').single();
 if(!link||link.quibi_environment!==quibiLinkEnvironment(process.env))return new Response('Povezava ni potrjena.',{status:403});
 const client=configuredQuibiReadClient();await loadQuibiDocument(client,kind as QuibiDocumentKind,documentId,link.external_id);
 const bytes=await client.documentPdf(documentId);
 return new Response(bytes.buffer,{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="quibi-${documentId}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response('PDF dokumenta ni mogoče preverjeno pridobiti.',{status:502,headers:{'Cache-Control':'no-store'}})}
}
