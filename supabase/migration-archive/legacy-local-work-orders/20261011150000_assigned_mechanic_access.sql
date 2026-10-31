-- Forward-only assignment access. No hosted application without explicit approval.
alter table public.work_orders add column assigned_mechanic_id uuid;
alter table public.work_orders add constraint work_order_assigned_member foreign key(organization_id,assigned_mechanic_id) references public.organization_memberships(organization_id,profile_id);
create index work_orders_assigned_mechanic on public.work_orders(organization_id,assigned_mechanic_id,updated_at desc) where assigned_mechanic_id is not null;
create function private.can_work_on_order(p_order uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.work_orders w where w.id=p_order and (private.has_org_role(w.organization_id,array['owner','admin','reception']::text[])
 or (w.assigned_mechanic_id=auth.uid() and private.has_org_role(w.organization_id,array['mechanic']::text[]))));
$$;
revoke all on function private.can_work_on_order(uuid) from public,anon;
grant execute on function private.can_work_on_order(uuid) to authenticated;
-- Do not open work_orders/customers/vehicles/quotes to mechanics: expose a minimal projection below.
create policy assigned_work_order_photos_read on public.work_order_photos for select to authenticated using(private.can_work_on_order(work_order_id));
create policy assigned_work_order_photo_read on storage.objects for select to authenticated using(bucket_id='selan-work-order-photos' and exists(
 select 1 from public.work_order_photos p where p.storage_path=name and private.can_work_on_order(p.work_order_id)));
-- Legacy photo reads remain available; no new Storage upload permission.
create function public.work_order_mechanics(p_order_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.profile_id,'name',coalesce(nullif(p.full_name,''),'Mehanik')) order by p.full_name),'[]'::jsonb)
 from public.work_orders w join public.organization_memberships m on m.organization_id=w.organization_id and m.role='mechanic' and m.is_active
 join public.profiles p on p.id=m.profile_id where w.id=p_order_id and private.has_org_role(w.organization_id,array['owner','admin']::text[]);
$$;
create function public.assign_work_order(p_order_id uuid,p_mechanic_id uuid,p_command_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.work_orders%rowtype; previous public.work_order_events%rowtype; material jsonb;
begin
 select * into w from public.work_orders where id=p_order_id for update;
 if not found or not private.has_org_role(w.organization_id,array['owner','admin']::text[]) then return jsonb_build_object('ok',false,'error_code','forbidden'); end if;
 if p_command_id is null then return jsonb_build_object('ok',false,'error_code','invalid_input'); end if;
 material:=jsonb_build_object('assigned_mechanic_id',p_mechanic_id);
 select * into previous from public.work_order_events where organization_id=w.organization_id and work_order_id=w.id and command_id=p_command_id;
 if found then
  if previous.payload<>material then return jsonb_build_object('ok',false,'error_code','idempotency_conflict'); end if;
  return jsonb_build_object('ok',true,'replayed',true);
 end if;
 if w.status='closed' then return jsonb_build_object('ok',false,'error_code','closed_order'); end if;
 if p_mechanic_id is not null and not exists(select 1 from public.organization_memberships m where m.organization_id=w.organization_id and m.profile_id=p_mechanic_id and m.role='mechanic' and m.is_active) then return jsonb_build_object('ok',false,'error_code','invalid_assignee'); end if;
 update public.work_orders set assigned_mechanic_id=p_mechanic_id where id=w.id;
 insert into public.work_order_events(organization_id,work_order_id,command_id,kind,body,payload,created_by_profile_id)
 values(w.organization_id,w.id,p_command_id,'note',case when p_mechanic_id is null then 'Dodelitev mehanika je umaknjena.' else 'Nalog je dodeljen mehaniku.' end,material,auth.uid());
 return jsonb_build_object('ok',true);
end $$;
create function public.mechanic_work_orders(p_order_id uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'organization_id',w.organization_id,'status',w.status,
 'vehicle',jsonb_build_object('make',v.make,'model',v.model,'registration',v.registration_current,'vin',v.vin),
 'events',case when p_order_id is not null then (select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'body',e.body,'created_at',e.created_at) order by e.created_at desc),'[]'::jsonb) from public.work_order_events e where e.organization_id=w.organization_id and e.work_order_id=w.id) else '[]'::jsonb end,
 'photos',case when p_order_id is not null then (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'caption',p.caption,'storage_path',p.storage_path) order by p.created_at desc),'[]'::jsonb) from public.work_order_photos p where p.organization_id=w.organization_id and p.work_order_id=w.id) else '[]'::jsonb end) order by w.updated_at desc),'[]'::jsonb)
 from public.work_orders w join public.organizations o on o.id=w.organization_id and o.slug='avtoservis-selan'
 join public.vehicles v on v.organization_id=w.organization_id and v.id=w.vehicle_id
 where w.assigned_mechanic_id=auth.uid() and private.has_org_role(w.organization_id,array['mechanic']::text[]) and (p_order_id is null or w.id=p_order_id);
$$;
revoke all on function public.work_order_mechanics(uuid),public.assign_work_order(uuid,uuid,uuid),public.mechanic_work_orders(uuid) from public,anon;
grant execute on function public.work_order_mechanics(uuid),public.assign_work_order(uuid,uuid,uuid),public.mechanic_work_orders(uuid) to authenticated;
-- Retain row locks, stale status, idempotency, transition and owner-only closure guards.
do $migration$
declare spec record; definition text; needle text;
begin
 for spec in select * from (values
 ('record_work_order','public.record_work_order(uuid,text,text,text,uuid,text,text,boolean)'::regprocedure),
 ('register_work_order_photo','public.register_work_order_photo(uuid,uuid,text,text)'::regprocedure)) as f(name,signature) loop
  definition:=pg_get_functiondef(spec.signature);
  needle:='not private.has_org_role(w.organization_id,array[''owner'',''admin'',''reception'']::text[])';
  if position(needle in definition)=0 then raise exception 'Unexpected % authorization implementation',spec.name; end if;
  execute replace(definition,needle,'not private.can_work_on_order(w.id)');
 end loop;
end $migration$;
notify pgrst,'reload schema';
