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
 insert into public.service_requests(id,organization_id,customer_id,vehicle_id,status,summary,source,channel) values(c1,org,src,car,'new','Canonical test','manual','manual'),(c2,org,src,car,'new','Shared pending','web_form','web');
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
 update public.service_requests set attention_needed=true,attention_reason='Business information to retain' where id=c2;
 result:=public.resolve_case_vehicle(c1,actor,'correct',rev,expected,fields,remote);
 if result->>'ok'<>'true' or (select customer_id from public.vehicles where id=car)<>dst or (select count(*) from public.service_requests where id in(c1,c2) and customer_id=dst)<>2 then raise exception 'Canonical selection did not move pending identities atomically';end if;
 if (select email from public.customers where id=src)<>'intake@example.test' or (select email from public.customers where id=dst)<>'canonical@example.test' or (select entity_id from public.integration_links where organization_id=org and external_id='99123456')<>dst then raise exception 'Original identity overwritten';end if;
 if (select attention_reason from public.service_requests where id=c2)<>'Business information to retain' then raise exception 'Unrelated business attention erased';end if;
 result:=public.resolve_case_vehicle(c1,actor,'correct',rev,expected,fields,remote);
 if result->>'ok'<>'true' or (select count(*) from public.case_vehicle_resolution_events where id=rev)<>1 then raise exception 'Replay is not idempotent';end if;

 -- An unconfirmed web identity keeps the original contact gate.
 if private.compute_request_intake_completeness(c2,null,'canonical@example.test','TESTVIN','TEST','A')->>'status'<>'needs_data' then raise exception 'Unconfirmed web contact gate weakened';end if;
 insert into public.quibi_vehicle_links(organization_id,customer_id,vehicle_id,quibi_customer_id,quibi_vehicle_id,quibi_environment,local_fingerprint,external_fingerprint,confirmed_by,sync_status) values(org,dst,car,'99123456','99123457','dev',repeat('c',64),repeat('c',64),actor,'ok');
 -- Confirmed Quibi identity and valid email remove only the redundant phone requirement.
 if private.compute_request_intake_completeness(c2,null,'invalid','TESTVIN','TEST','A')->>'status'<>'needs_data' then raise exception 'Invalid email bypassed contact gate';end if;
 if private.compute_request_intake_completeness(c2,null,'canonical@example.test','TESTVIN','TEST','A')->>'status'<>'new' then raise exception 'Email-only continuation blocked';end if;
 if private.compute_request_intake_completeness(c2,null,null,'TESTVIN','TEST','A')->>'status'<>'needs_data' then raise exception 'No-contact continuation accepted';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 result:=public.review_service_request_intake(c2);
 if result->>'ok'<>'true' then raise exception 'Server review still demands phone: %',result;end if;
 result:=public.review_service_request_intake(c2);
 if result->>'ok'<>'true' or (select count(*) from public.service_request_intake_reviews where service_request_id=c2)<>1 then raise exception 'Review repeated instead of reused';end if;
 -- The existing job upgrades legacy empty suggestions once and preserves edited drafts.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','service_role')::text,true);
 result:=public.automatic_offer_job(c1,actor,'claim');
 if result->>'run' is null then raise exception 'Preparation claim missing';end if;
 perform public.automatic_offer_job(c1,actor,'finish',(result->>'run')::uuid,'{"rows":[]}'::jsonb,'needs_data');
 result:=public.automatic_offer_job(c1,actor,'claim');
 if result->>'run' is null then raise exception 'Legacy empty draft never refreshed';end if;
 perform public.automatic_offer_job(c1,actor,'finish',(result->>'run')::uuid,'{"rows":[],"serviceSuggestionVersion":2}'::jsonb,'needs_data');
 if public.automatic_offer_job(c1,actor,'claim') is not null then raise exception 'Upgraded empty draft loops';end if;
 update public.offer_preparations set auto_draft='{"rows":[{"key":"","description":"User edited row"}]}'::jsonb where service_request_id=c1;
 if public.automatic_offer_job(c1,actor,'claim') is not null then raise exception 'Edited draft overwritten';end if;
end $$;
rollback;
