-- Prepared only: requires separate approval. No data, membership or RLS rewrite.
-- Prerequisites: unified_quibi_workflow, quibi_dev_business_journal,
-- team_case_work_and_private_evidence, case_vehicle_resolution.
begin;
alter table public.quibi_production_operation_journal drop constraint if exists quibi_production_operation_journal_kind_check;
alter table public.quibi_production_operation_journal drop constraint if exists quibi_production_operation_journal_check;
alter table public.quibi_production_operation_journal add constraint quibi_production_operation_journal_kind_check check(kind in ('customer','vehicle','estimate','estimate_update','send','work_order','invoice','customer_update','vehicle_update','work_order_update','invoice_update'));
alter table public.quibi_production_operation_journal add constraint quibi_production_operation_journal_check check(
 (kind='estimate' and service_request_id=local_entity_id and external_id is not null)
 or (kind='customer' and external_id=local_entity_id::text)
 or (kind in ('vehicle','estimate_update','send','customer_update','vehicle_update','work_order_update','invoice_update') and external_id is null)
 or (kind in ('work_order','invoice') and external_id='selan-work-order:'||local_entity_id::text||':'||kind));
-- Existing conflicting records abort the transaction; no rows are removed or rewritten.
create unique index if not exists quibi_production_one_business_create_per_case on public.quibi_production_operation_journal(organization_id,service_request_id,kind) where kind in ('work_order','invoice');
create unique index if not exists quibi_production_active_business_update on public.quibi_production_operation_journal(organization_id,quibi_id) where kind in ('work_order_update','invoice_update') and quibi_id is not null and state in ('prepared','dispatching','uncertain');

-- Reuse the existing immutable request guard and serialized document dispatch guard.
drop trigger if exists quibi_business_dispatch_guard on public.quibi_production_operation_journal;
create trigger quibi_business_dispatch_guard before update on public.quibi_production_operation_journal for each row execute function private.guard_quibi_dev_business_document_dispatch();
create or replace function public.assign_service_case(p_case uuid,p_mechanic uuid,p_document text,p_sha text) returns void language plpgsql security definer set search_path='' as $$declare s public.service_requests; v_customer text; v_vehicle text; v_mode text; v_verified boolean;begin
 select * into s from public.service_requests where id=p_case and archived_at is null for update;
 if not found or not public.team_has_role(s.organization_id,array['owner','admin']) then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from public.organization_memberships where organization_id=s.organization_id and profile_id=p_mechanic and is_active and role='mechanic') then raise exception 'MECHANIC_UNAVAILABLE';end if;
 select quibi_customer_id,quibi_vehicle_id,quibi_environment into v_customer,v_vehicle,v_mode from public.quibi_vehicle_links where organization_id=s.organization_id and vehicle_id=s.vehicle_id and customer_id=s.customer_id and sync_status='ok' and quibi_environment in ('dev','production');
 if not found then raise exception 'VEHICLE_LINK_UNVERIFIED';end if;
 execute format('select exists(select 1 from public.%I j where j.organization_id=$4 and j.service_request_id=$1 and j.kind in (''work_order'',''work_order_update'') and j.state=''verified'' and j.quibi_id=$2 and j.quibi_content_sha256=$3 and coalesce(j.request_body::jsonb->''body'',j.request_body::jsonb)->''Glavadokumenta''->>''stranka_id''=$5 and coalesce(j.request_body::jsonb->''body'',j.request_body::jsonb)->''Glavadokumenta''->>''vozila_id''=$6)',case v_mode when 'dev' then 'quibi_dev_operation_journal' else 'quibi_production_operation_journal' end) into v_verified using p_case,p_document,p_sha,s.organization_id,v_customer,v_vehicle;
 if not v_verified then raise exception 'QUIBI_REFERENCE_UNVERIFIED';end if;
 insert into public.service_case_assignments(case_id,organization_id,mechanic_id,assigned_by,quibi_work_order_id,quibi_content_sha256,vehicle_id,quibi_customer_id,quibi_vehicle_id) values(p_case,s.organization_id,p_mechanic,auth.uid(),p_document,p_sha,s.vehicle_id,v_customer,v_vehicle)
 on conflict(case_id) do update set mechanic_id=excluded.mechanic_id,assigned_by=auth.uid(),updated_at=now() where service_case_assignments.vehicle_id=excluded.vehicle_id and service_case_assignments.quibi_customer_id=excluded.quibi_customer_id and service_case_assignments.quibi_vehicle_id=excluded.quibi_vehicle_id and service_case_assignments.quibi_work_order_id=excluded.quibi_work_order_id and service_case_assignments.quibi_content_sha256=excluded.quibi_content_sha256;
 if not found then raise exception 'QUIBI_REFERENCE_CHANGED';end if;end;$$;

create or replace function public.case_work_snapshot(p_case uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$begin
 return coalesce((select jsonb_agg(jsonb_build_object('caseId',a.case_id,'mechanicId',a.mechanic_id,'quibiId',a.quibi_work_order_id,'sha',a.quibi_content_sha256,'status',a.status,'problem',s.problem_description,'service',s.service_wanted,'vehicle',jsonb_build_object('vin',v.vin,'registration',v.registration_current,'make',v.make,'model',v.model),'customerQuibiId',a.quibi_customer_id,'vehicleQuibiId',a.quibi_vehicle_id)) from public.service_case_assignments a join public.service_requests s on s.id=a.case_id left join public.vehicles v on v.id=a.vehicle_id left join public.quibi_vehicle_links l on l.organization_id=a.organization_id and l.vehicle_id=s.vehicle_id and l.customer_id=s.customer_id and l.sync_status='ok' and l.quibi_environment in ('dev','production') where (p_case is null or a.case_id=p_case) and public.can_read_case_work(a.case_id)),'[]');end;$$;

create or replace function public.resolve_case_vehicle(p_case uuid,p_actor uuid,p_action text,p_revision uuid default null,p_expected timestamptz default null,p_fields jsonb default null,p_remote jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.service_requests;v public.vehicles;target public.vehicles;old_link jsonb; v_mode text;event public.case_vehicle_resolution_events;begin
 select * into r from public.service_requests where id=p_case and archived_at is null for update;
 if not found or not exists(select 1 from public.organization_memberships m join public.organizations o on o.id=m.organization_id where m.organization_id=r.organization_id and m.profile_id=p_actor and m.is_active and m.role in ('owner','admin') and o.slug='avtoservis-selan') then raise exception 'FORBIDDEN';end if;
 if p_action='ready' then return jsonb_build_object('ok',true);end if;
 select * into event from public.case_vehicle_resolution_events where id=p_revision;
 if found then if event.case_id<>p_case or event.actor_id<>p_actor or event.action<>p_action or event.after_state->'fields' is distinct from p_fields or event.after_state->'remote' is distinct from coalesce(p_remote,'null'::jsonb) then raise exception 'REVISION_CONFLICT';end if;return jsonb_build_object('ok',true,'vehicleId',event.after_state->>'vehicleId');end if;
 if p_action not in ('correct','link') or p_revision is null or r.updated_at is distinct from p_expected or r.status not in ('new','needs_data') then raise exception 'CASE_CHANGED';end if;
 if exists(select 1 from public.quotes q where q.service_request_id=r.id) or exists(select 1 from (select service_request_id,kind,state from public.quibi_dev_operation_journal union all select service_request_id,kind,state from public.quibi_production_operation_journal) j where j.service_request_id=r.id and j.kind in ('estimate','work_order','invoice','send')) then raise exception 'DOCUMENTS_BOUND';end if;
 if exists(select 1 from (select service_request_id,kind,state from public.quibi_dev_operation_journal union all select service_request_id,kind,state from public.quibi_production_operation_journal) j where j.service_request_id=r.id and j.kind in ('vehicle','vehicle_update') and j.state in ('prepared','dispatching','uncertain')) then raise exception 'UNRESOLVED_VEHICLE_OPERATION';end if;
 select * into v from public.vehicles where id=r.vehicle_id and organization_id=r.organization_id and customer_id=r.customer_id and archived_at is null for update;
 if not found then raise exception 'VEHICLE_UNAVAILABLE';end if;
 if p_fields is null or length(btrim(coalesce(p_fields->>'vin','')))=0 or length(p_fields->>'vin')>32 or length(btrim(coalesce(p_fields->>'registration','')))=0 or length(p_fields->>'registration')>64 or length(btrim(coalesce(p_fields->>'make','')))=0 or length(btrim(coalesce(p_fields->>'model','')))=0 or length(p_fields->>'make')>100 or length(p_fields->>'model')>100 then raise exception 'INVALID_FIELDS';end if;
 select to_jsonb(l) into old_link from public.quibi_vehicle_links l where l.vehicle_id=v.id and l.organization_id=r.organization_id;
 if p_action='link' then
  select l.quibi_environment into v_mode from public.integration_links l where l.organization_id=r.organization_id and l.entity_id=r.customer_id and l.entity_type='customer' and l.provider='quibi' and l.sync_status='ok' and l.quibi_environment in ('dev','production');
  if not found then raise exception 'IDENTITY_UNVERIFIED';end if;
  if p_remote is null or p_remote->>'id' !~ '^[0-9]+$' or p_remote->>'fingerprint' !~ '^[a-f0-9]{64}$' or p_remote->'fields' is distinct from p_fields or not exists(select 1 from public.integration_links l where l.organization_id=r.organization_id and l.entity_id=r.customer_id and l.provider='quibi' and l.entity_type='customer' and l.sync_status='ok' and l.quibi_environment=v_mode and l.external_id=p_remote->>'customerId') then raise exception 'IDENTITY_UNVERIFIED';end if;
  if p_fields is distinct from jsonb_build_object('vin',v.vin,'registration',v.registration_current,'make',v.make,'model',v.model) then raise exception 'CORRECT_INTAKE_FIRST';end if;
 end if;
 select * into target from public.vehicles where organization_id=r.organization_id and upper(btrim(vin))=upper(btrim(p_fields->>'vin')) for update;
 if found then
  if target.customer_id<>r.customer_id or target.archived_at is not null then raise exception 'OWNERSHIP_CONFLICT';end if;
  if target.id<>v.id and p_fields is distinct from jsonb_build_object('vin',target.vin,'registration',target.registration_current,'make',target.make,'model',target.model) then raise exception 'VEHICLE_CONFLICT';end if;
  if target.id=v.id and p_fields is distinct from jsonb_build_object('vin',v.vin,'registration',v.registration_current,'make',v.make,'model',v.model) then
   if exists(select 1 from public.service_requests s where s.vehicle_id=v.id and s.id<>r.id) then raise exception 'VEHICLE_SHARED';end if;
   update public.vehicles set vin=p_fields->>'vin',registration_current=p_fields->>'registration',make=p_fields->>'make',model=p_fields->>'model' where id=v.id;
   update public.quibi_vehicle_links set sync_status='never_checked' where vehicle_id=v.id and organization_id=r.organization_id;
  end if;
 else
  insert into public.vehicles(organization_id,customer_id,vin,registration_current,make,model) values(r.organization_id,r.customer_id,p_fields->>'vin',p_fields->>'registration',p_fields->>'make',p_fields->>'model') returning * into target;
 end if;
 if p_action='link' then
  if exists(select 1 from public.service_requests s where s.vehicle_id=target.id and s.id<>r.id) and exists(select 1 from public.quibi_vehicle_links l where l.vehicle_id=target.id and (l.quibi_vehicle_id<>p_remote->>'id' or l.sync_status<>'ok')) then raise exception 'VEHICLE_SHARED';end if;
  insert into public.quibi_vehicle_links(organization_id,customer_id,vehicle_id,quibi_customer_id,quibi_vehicle_id,quibi_environment,local_fingerprint,external_fingerprint,confirmed_by,sync_status,last_checked_at) values(r.organization_id,r.customer_id,target.id,p_remote->>'customerId',p_remote->>'id',v_mode,p_remote->>'fingerprint',p_remote->>'fingerprint',p_actor,'ok',now()) on conflict(organization_id,vehicle_id) do update set quibi_customer_id=excluded.quibi_customer_id,quibi_vehicle_id=excluded.quibi_vehicle_id,quibi_environment=excluded.quibi_environment,local_fingerprint=excluded.local_fingerprint,external_fingerprint=excluded.external_fingerprint,confirmed_by=excluded.confirmed_by,sync_status='ok',last_checked_at=now();
 end if;
 update public.service_requests set vehicle_id=target.id,attention_needed=true,attention_reason='Quibi povezava: Podatki povpraševanja so preverjeni. Preverite povezavo vozila in nato sprejmite primer.' where id=r.id;
 insert into public.case_vehicle_resolution_events values(p_revision,r.organization_id,r.id,p_actor,p_action,jsonb_build_object('case',to_jsonb(r),'vehicle',to_jsonb(v),'link',old_link),jsonb_build_object('vehicleId',target.id,'fields',p_fields,'remote',p_remote),now());
 return jsonb_build_object('ok',true,'vehicleId',target.id);
end;$$;

-- CREATE OR REPLACE retains existing execute privileges and SECURITY DEFINER search_path.
notify pgrst,'reload schema';
commit;
