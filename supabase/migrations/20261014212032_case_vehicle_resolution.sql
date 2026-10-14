-- Local intake correction and linkage audit only. No Quibi documents or WRITE.
create table public.case_vehicle_resolution_events(
 id uuid primary key,organization_id uuid not null references public.organizations(id),case_id uuid not null references public.service_requests(id),actor_id uuid not null references public.profiles(id),action text not null check(action in ('correct','link')),before_state jsonb not null,after_state jsonb not null,created_at timestamptz not null default now());
alter table public.case_vehicle_resolution_events enable row level security;
grant select on public.case_vehicle_resolution_events to authenticated;
create policy resolution_events_owner_admin on public.case_vehicle_resolution_events for select to authenticated using(exists(select 1 from public.organization_memberships m where m.organization_id=case_vehicle_resolution_events.organization_id and m.profile_id=auth.uid() and m.is_active and m.role in ('owner','admin')));
create function public.resolve_case_vehicle(p_case uuid,p_actor uuid,p_action text,p_revision uuid default null,p_expected timestamptz default null,p_fields jsonb default null,p_remote jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.service_requests;v public.vehicles;target public.vehicles;old_link jsonb;event public.case_vehicle_resolution_events;begin
 select * into r from public.service_requests where id=p_case and archived_at is null for update;
 if not found or not exists(select 1 from public.organization_memberships m join public.organizations o on o.id=m.organization_id where m.organization_id=r.organization_id and m.profile_id=p_actor and m.is_active and m.role in ('owner','admin') and o.slug='avtoservis-selan') then raise exception 'FORBIDDEN';end if;
 if p_action='ready' then return jsonb_build_object('ok',true);end if;
 select * into event from public.case_vehicle_resolution_events where id=p_revision;
 if found then if event.case_id<>p_case or event.actor_id<>p_actor or event.action<>p_action or event.after_state->'fields' is distinct from p_fields or event.after_state->'remote' is distinct from coalesce(p_remote,'null'::jsonb) then raise exception 'REVISION_CONFLICT';end if;return jsonb_build_object('ok',true,'vehicleId',event.after_state->>'vehicleId');end if;
 if p_action not in ('correct','link') or p_revision is null or r.updated_at is distinct from p_expected or r.status not in ('new','needs_data') then raise exception 'CASE_CHANGED';end if;
 if exists(select 1 from public.quotes q where q.service_request_id=r.id) or exists(select 1 from public.quibi_dev_operation_journal j where j.service_request_id=r.id and j.kind in ('estimate','work_order','invoice','send')) then raise exception 'DOCUMENTS_BOUND';end if;
 if exists(select 1 from public.quibi_dev_operation_journal j where j.service_request_id=r.id and j.kind in ('vehicle','vehicle_update') and j.state in ('prepared','dispatching','uncertain')) then raise exception 'UNRESOLVED_VEHICLE_OPERATION';end if;
 select * into v from public.vehicles where id=r.vehicle_id and organization_id=r.organization_id and customer_id=r.customer_id and archived_at is null for update;
 if not found then raise exception 'VEHICLE_UNAVAILABLE';end if;
 if p_fields is null or length(btrim(coalesce(p_fields->>'vin','')))=0 or length(p_fields->>'vin')>32 or length(btrim(coalesce(p_fields->>'registration','')))=0 or length(p_fields->>'registration')>64 or length(btrim(coalesce(p_fields->>'make','')))=0 or length(btrim(coalesce(p_fields->>'model','')))=0 or length(p_fields->>'make')>100 or length(p_fields->>'model')>100 then raise exception 'INVALID_FIELDS';end if;
 select to_jsonb(l) into old_link from public.quibi_vehicle_links l where l.vehicle_id=v.id and l.organization_id=r.organization_id;
 if p_action='link' then
  if p_remote is null or p_remote->>'id' !~ '^[0-9]+$' or p_remote->>'fingerprint' !~ '^[a-f0-9]{64}$' or p_remote->'fields' is distinct from p_fields or not exists(select 1 from public.integration_links l where l.organization_id=r.organization_id and l.entity_id=r.customer_id and l.provider='quibi' and l.entity_type='customer' and l.sync_status='ok' and l.quibi_environment='dev' and l.external_id=p_remote->>'customerId') then raise exception 'IDENTITY_UNVERIFIED';end if;
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
  insert into public.quibi_vehicle_links(organization_id,customer_id,vehicle_id,quibi_customer_id,quibi_vehicle_id,quibi_environment,local_fingerprint,external_fingerprint,confirmed_by,sync_status,last_checked_at) values(r.organization_id,r.customer_id,target.id,p_remote->>'customerId',p_remote->>'id','dev',p_remote->>'fingerprint',p_remote->>'fingerprint',p_actor,'ok',now()) on conflict(organization_id,vehicle_id) do update set quibi_customer_id=excluded.quibi_customer_id,quibi_vehicle_id=excluded.quibi_vehicle_id,quibi_environment=excluded.quibi_environment,local_fingerprint=excluded.local_fingerprint,external_fingerprint=excluded.external_fingerprint,confirmed_by=excluded.confirmed_by,sync_status='ok',last_checked_at=now();
 end if;
 update public.service_requests set vehicle_id=target.id,attention_needed=true,attention_reason='Quibi povezava: Podatki povpraševanja so preverjeni. Preverite povezavo vozila in nato sprejmite primer.' where id=r.id;
 insert into public.case_vehicle_resolution_events values(p_revision,r.organization_id,r.id,p_actor,p_action,jsonb_build_object('case',to_jsonb(r),'vehicle',to_jsonb(v),'link',old_link),jsonb_build_object('vehicleId',target.id,'fields',p_fields,'remote',p_remote),now());
 return jsonb_build_object('ok',true,'vehicleId',target.id);
end;$$;
revoke all on function public.resolve_case_vehicle(uuid,uuid,text,uuid,timestamptz,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.resolve_case_vehicle(uuid,uuid,text,uuid,timestamptz,jsonb,jsonb) to service_role;
