\set ON_ERROR_STOP on
\ir assert_isolated_test_target.sql
begin;
do $$
declare org uuid;actor uuid:=gen_random_uuid();src uuid:=gen_random_uuid();dst uuid:=gen_random_uuid();car uuid:=gen_random_uuid();c1 uuid:=gen_random_uuid();c2 uuid:=gen_random_uuid();rev uuid:=gen_random_uuid();fields jsonb;remote jsonb;expected timestamptz;result jsonb;blocked boolean;
begin
 select id into org from public.organizations where slug='avtoservis-selan';
 if org is null then insert into public.organizations(name,slug) values('Canonical fixture','avtoservis-selan') returning id into org;end if;
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000',actor,'authenticated','authenticated','canonical-'||actor||'@example.test',crypt('isolated-only',gen_salt('bf')),now(),'{}','{}',now(),now());
 insert into public.organization_memberships(organization_id,profile_id,role) values(org,actor,'admin');
 insert into public.customers(id,organization_id,display_name,email) values(src,org,'TEST same name','intake@example.test'),(dst,org,'TEST same name','canonical@example.test');
 insert into public.vehicles(id,organization_id,customer_id,vin,registration_current,make,model) values(car,org,src,'HOTFIX-'||left(car::text,16),'HOTFIX','TEST','A');
 insert into public.service_requests(id,organization_id,customer_id,vehicle_id,status,summary,source) values(c1,org,src,car,'new','Canonical test','manual'),(c2,org,src,car,'new','Shared pending','manual');
 insert into public.integration_links(organization_id,provider,entity_type,entity_id,external_id,local_fingerprint,external_fingerprint,confirmed_by,sync_status,quibi_environment) values(org,'quibi','customer',dst,'99123456',repeat('a',64),repeat('b',64),actor,'ok','dev');
 select updated_at into expected from public.service_requests where id=c1;
 select jsonb_build_object('kind','customer','id','99123456','localCustomerId',dst,'fingerprint',repeat('b',64),'canonicalFingerprint',repeat('a',64),'canonicalUpdatedAt',d.updated_at,'sourceUpdatedAt',s.updated_at) into remote from public.customers d cross join public.customers s where d.id=dst and s.id=src;
 fields:=jsonb_build_object('vin','HOTFIX-'||left(car::text,16),'registration','HOTFIX','make','TEST','model','A');
 blocked:=false;
 begin perform public.resolve_case_vehicle(c1,gen_random_uuid(),'correct',rev,expected,fields,remote);exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;blocked:=true;end;
 if not blocked then raise exception 'Foreign actor accepted';end if;
 blocked:=false;
 begin perform public.resolve_case_vehicle(c1,actor,'correct',rev,expected,fields,jsonb_set(remote,'{fingerprint}',to_jsonb(repeat('c',64))));exception when others then if sqlerrm<>'IDENTITY_UNVERIFIED' then raise;end if;blocked:=true;end;
 if not blocked then raise exception 'Stale identity accepted';end if;
 -- A bound sibling must block the entire transaction, including the physical vehicle.
 insert into public.appointments(organization_id,service_request_id,customer_id,vehicle_id,status,appointment_type,starts_at,ends_at) values(org,c2,src,car,'proposed','intake',now(),now()+interval '1 hour');
 blocked:=false;
 begin perform public.resolve_case_vehicle(c1,actor,'correct',rev,expected,fields,remote);exception when others then if sqlerrm<>'DOCUMENTS_BOUND' then raise;end if;blocked:=true;end;
 if not blocked or (select customer_id from public.vehicles where id=car)<>src or exists(select 1 from public.service_requests where id in(c1,c2) and customer_id<>src) then raise exception 'Partial or bound reassignment';end if;
 delete from public.appointments where service_request_id=c2;
 result:=public.resolve_case_vehicle(c1,actor,'correct',rev,expected,fields,remote);
 if result->>'ok'<>'true' or (select customer_id from public.vehicles where id=car)<>dst or (select count(*) from public.service_requests where id in(c1,c2) and customer_id=dst)<>2 then raise exception 'Canonical selection did not move pending identities atomically';end if;
 if (select email from public.customers where id=src)<>'intake@example.test' or (select email from public.customers where id=dst)<>'canonical@example.test' or (select entity_id from public.integration_links where organization_id=org and external_id='99123456')<>dst then raise exception 'Original identity overwritten';end if;
 result:=public.resolve_case_vehicle(c1,actor,'correct',rev,expected,fields,remote);
 if result->>'ok'<>'true' or (select count(*) from public.case_vehicle_resolution_events where id=rev)<>1 then raise exception 'Replay is not idempotent';end if;
end $$;
rollback;
