"use server";
import {caseWorkQuibiEnvironment,quibiJournalTable} from '@/lib/quibi/deployment-policy';
import {revalidatePath} from 'next/cache';import {requireWorkshopAccess} from '@/lib/auth/requireWorkshopAccess';import {createClient} from '@/lib/supabase/server';import {configuredQuibiReadClient} from '@/lib/quibi/client';import {loadQuibiDocument} from '@/lib/quibi/document-read';import {photoExtension,workInput} from './policy';
export async function caseWorkAction(form:FormData){try{const access=await requireWorkshopAccess(),db=await createClient(),action=String(form.get('action')),caseId=String(form.get('caseId')??'');
 if(action==='assign'){
  const environment=caseWorkQuibiEnvironment(process.env);
  if(!['owner','admin'].includes(access.role))throw Error('FORBIDDEN');
  const {data:rows,error}=await db.from(quibiJournalTable(environment)).select('quibi_id,quibi_content_sha256,request_body').eq('organization_id',access.organizationId).eq('service_request_id',caseId).in('kind',['work_order','work_order_update']).eq('state','verified').order('created_at',{ascending:false}).limit(1);
  if(error||!rows?.[0])throw Error('REFERENCE_REQUIRED');const ref=rows[0],payload=JSON.parse(ref.request_body),body=payload.body??payload,customer=String(body.Glavadokumenta.stranka_id),vehicle=String(body.Glavadokumenta.vozila_id),doc=await loadQuibiDocument(configuredQuibiReadClient(),'work_order',ref.quibi_id,customer);
  if(doc.vehicleId!==vehicle||doc.contentSha256!==ref.quibi_content_sha256)throw Error('REFERENCE_CHANGED');
  const r=await db.rpc('assign_service_case',{p_case:caseId,p_mechanic:form.get('assignmentTarget')==='self'?access.userId:String(form.get('mechanicId')),p_document:ref.quibi_id,p_sha:ref.quibi_content_sha256,p_environment:environment});if(r.error)throw Error('ASSIGNMENT_FAILED');
 }else if(action==='progress'){
  const v=workInput(caseId,form.get('status'),form.get('note')??'');const r=await db.rpc('update_case_work',{p_case:v.caseId,p_status:v.status,p_note:v.note});if(r.error)throw Error('FORBIDDEN');
 }else if(action==='deleteNote'){
  const r=await db.rpc('hide_case_note',{p_case:caseId,p_note:String(form.get('noteId')??'')});if(r.error)throw Error('FORBIDDEN');
 }else if(action==='photo'){
  const file=form.get('photo'),caption=String(form.get('caption')??'').trim();if(!(file instanceof File)||caption.length<1||caption.length>500||file.size>786432)throw Error('INVALID_PHOTO');const bytes=new Uint8Array(await file.arrayBuffer()),ext=photoExtension(file.type,bytes),id=crypto.randomUUID();
  const prepared=await db.rpc('prepare_case_photo',{p_case:caseId,p_id:id,p_caption:caption,p_ext:ext});if(prepared.error||typeof prepared.data!=='string')throw Error('PHOTO_ACCESS_DENIED');
  const uploaded=await db.storage.from('service-case-evidence').upload(prepared.data,bytes,{contentType:file.type,upsert:false});if(uploaded.error)throw Error('PHOTO_UPLOAD_FAILED');
  const completed=await db.rpc('complete_case_photo',{p_id:id});if(completed.error)throw Error('PHOTO_RECONCILIATION_REQUIRED');
 }else if(action==='photoComplete'){
  const photoId=String(form.get('photoId')??'');const existing=await db.from('service_case_photos').select('id').eq('id',photoId).eq('case_id',caseId).eq('author_id',access.userId).eq('state','pending').maybeSingle();if(existing.error||!existing.data)throw Error('PHOTO_ACCESS_DENIED');
  const completed=await db.rpc('complete_case_photo',{p_id:photoId});if(completed.error)throw Error('PHOTO_RECONCILIATION_REQUIRED');
 }else if(action==='photoApproval'){
  if(access.role!=='owner')throw Error('FORBIDDEN');const r=await db.rpc('approve_case_photo',{p_id:String(form.get('photoId')),p_approved:form.get('approved')==='yes'});if(r.error)throw Error('FORBIDDEN');
 }else throw Error('INVALID_ACTION');
 revalidatePath('/dashboard/nalogi');revalidatePath('/dashboard/nalogi/'+caseId);revalidatePath('/dashboard/mehanik');revalidatePath('/dashboard/mehanik/'+caseId);revalidatePath('/dashboard/primeri/'+caseId);return {ok:true,message:action==='deleteNote'?'Opomba je izbrisana.':'Podatki so shranjeni.'};
 }catch(e){if(e instanceof Error&&e.message==='PHOTO_RECONCILIATION_REQUIRED')return {ok:false,message:'Fotografija še ni potrjena. V seznamu nedokončanih nalaganj preverite že shranjeno datoteko; ne nalagajte je znova.'};return {ok:false,message:'Shranjevanje ni potrjeno. Preverite dodelitev, dovoljenja in dostop. Pri napaki fotografije preverite seznam pred ponovnim nalaganjem.'}}}
