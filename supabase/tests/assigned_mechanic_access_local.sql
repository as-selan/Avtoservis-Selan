-- Existing local QA database only; execute in the manual-pr18 container with ON_ERROR_STOP.
-- Authentication fixtures and assignments are rolled back. No existing closed case is changed.
begin;
create temporary table mechanic_fixture(org uuid,actor uuid,mechanic uuid,other_mechanic uuid,foreign_mechanic uuid,order_id uuid,photo_id uuid,path text);
do $$
declare org uuid; actor uuid; mechanic uuid:=gen_random_uuid(); other_mechanic uuid:=gen_random_uuid(); foreign_mechanic uuid:=gen_random_uuid(); other_org uuid; r public.service_requests%rowtype; oid uuid; pid uuid:=gen_random_uuid(); path text;
begin
 select o.id,m.profile_id into org,actor from public.organizations o join public.organization_memberships m on m.organization_id=o.id where o.slug='avtoservis-selan' and m.role='owner' and m.is_active limit 1;
 select * into r from public.service_requests s where s.organization_id=org and s.customer_id is not null and s.vehicle_id is not null and not exists(select 1 from public.work_orders w where w.service_request_id=s.id) limit 1;
 if actor is null or r.id is null then raise exception 'Existing local QA owner and unconverted case required'; end if;
 insert into public.organizations(name,slug,timezone) values('Mechanic rollback fixture','mechanic-'||gen_random_uuid()::text,'Europe/Ljubljana') returning id into other_org;
 insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','mechanic-'||id::text||'@example.test','',jsonb_build_object('provider','email','providers',jsonb_build_array('email')),'{}'::jsonb,now(),now() from unnest(array[mechanic,other_mechanic,foreign_mechanic]) id;
 insert into public.profiles(id,full_name,email) select id,'SQL mechanic fixture','mechanic-'||id::text||'@example.test' from unnest(array[mechanic,other_mechanic,foreign_mechanic]) id on conflict(id) do nothing;
 insert into public.organization_memberships(organization_id,profile_id,role,is_active) values(org,mechanic,'mechanic',true),(org,other_mechanic,'mechanic',true),(other_org,foreign_mechanic,'mechanic',true);
 insert into public.work_orders(organization_id,service_request_id,customer_id,vehicle_id,inspection_charge_policy,created_by_profile_id) values(org,r.id,r.customer_id,r.vehicle_id,'not_applicable',actor) returning id into oid;
 path:=org::text||'/'||oid::text||'/'||pid::text||'.jpg';
 insert into storage.objects(bucket_id,name,owner_id) values('selan-work-order-photos',path,mechanic::text);
 insert into mechanic_fixture values(org,actor,mechanic,other_mechanic,foreign_mechanic,oid,pid,path);
end $$;
grant select on mechanic_fixture to authenticated;
set local role authenticated;
do $$
declare f record; answer jsonb; projection jsonb; command uuid:=gen_random_uuid();
begin
 select * into f from mechanic_fixture;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',f.actor,'role','authenticated')::text,true);
 answer:=public.assign_work_order(f.order_id,f.foreign_mechanic,gen_random_uuid());if answer->>'error_code' is distinct from 'invalid_assignee' then raise exception 'Cross-org assignment allowed: %',answer; end if;
 answer:=public.assign_work_order(f.order_id,f.mechanic,command);if answer->>'ok' is distinct from 'true' then raise exception 'Owner assignment failed: %',answer; end if;
 answer:=public.assign_work_order(f.order_id,f.mechanic,command);if answer->>'replayed' is distinct from 'true' then raise exception 'Assignment replay failed'; end if;
 answer:=public.assign_work_order(f.order_id,f.other_mechanic,command);if answer->>'error_code' is distinct from 'idempotency_conflict' then raise exception 'Changed assignment replay allowed'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',f.mechanic,'role','authenticated')::text,true);
 projection:=public.mechanic_work_orders(f.order_id);if jsonb_array_length(projection)<>1 or projection->0->>'id'<>f.order_id::text then raise exception 'Assigned order absent'; end if;
 if projection->0 ?| array['customer_id','invoice_reference','handover_reference','service_request_id'] then raise exception 'Business projection leak'; end if;
 if exists(select 1 from public.work_orders) or exists(select 1 from public.work_order_quibi_documents) then raise exception 'Mechanic direct business RLS leak'; end if;
 answer:=public.assign_work_order(f.order_id,f.other_mechanic,gen_random_uuid());if answer->>'error_code' is distinct from 'forbidden' then raise exception 'Mechanic assignment allowed'; end if;
 answer:=public.record_work_order(f.order_id,'open','in_progress','SQL mechanic start',gen_random_uuid());if answer->>'ok' is distinct from 'true' then raise exception 'Assigned transition failed: %',answer; end if;
 answer:=public.register_work_order_photo(f.order_id,f.photo_id,f.path,'SQL assigned photo');if answer->>'ok' is distinct from 'true' then raise exception 'Assigned photo failed: %',answer; end if;
 if not exists(select 1 from public.work_order_photos where id=f.photo_id) or not exists(select 1 from storage.objects where name=f.path) then raise exception 'Assigned photo RLS denied'; end if;
 answer:=public.record_work_order(f.order_id,'in_progress','ready_for_collection','SQL mechanic ready',gen_random_uuid());if answer->>'ok' is distinct from 'true' then raise exception 'Ready transition failed'; end if;
 answer:=public.record_work_order(f.order_id,'ready_for_collection','closed','SQL forbidden close',gen_random_uuid(),'SQL invoice','SQL handover',true);if answer->>'ok'='true' then raise exception 'Mechanic closed business case'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',f.other_mechanic,'role','authenticated')::text,true);
 if jsonb_array_length(public.mechanic_work_orders(f.order_id))<>0 or exists(select 1 from public.work_order_photos where id=f.photo_id) or exists(select 1 from storage.objects where name=f.path) then raise exception 'Unassigned mechanic RLS leak'; end if;
 answer:=public.record_work_order(f.order_id,'ready_for_collection',null,'SQL unauthorized note',gen_random_uuid());if answer->>'error_code' is distinct from 'forbidden' then raise exception 'Unassigned write allowed'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',f.foreign_mechanic,'role','authenticated')::text,true);
 if jsonb_array_length(public.mechanic_work_orders(f.order_id))<>0 or private.can_work_on_order(f.order_id) then raise exception 'Cross-org mechanic leak'; end if;
end $$;
reset role;
do $$declare f record;begin select * into f from mechanic_fixture;update public.organization_memberships set is_active=false where organization_id=f.org and profile_id=f.mechanic;perform set_config('request.jwt.claims',jsonb_build_object('sub',f.mechanic,'role','authenticated')::text,true);end $$;
set local role authenticated;
do $$declare f record;begin select * into f from mechanic_fixture;if jsonb_array_length(public.mechanic_work_orders(f.order_id))<>0 or private.can_work_on_order(f.order_id) then raise exception 'Inactive membership access';end if;raise notice 'PASS assignment, idempotency, mechanic projection, transitions, photos, closure denial, foreign/unassigned/inactive denial';end $$;
reset role;
set local role anon;
do $$begin if has_function_privilege('anon','public.mechanic_work_orders(uuid)','EXECUTE') or has_function_privilege('anon','public.assign_work_order(uuid,uuid,uuid)','EXECUTE') then raise exception 'Anonymous RPC grant'; end if;end $$;
reset role;
rollback;
