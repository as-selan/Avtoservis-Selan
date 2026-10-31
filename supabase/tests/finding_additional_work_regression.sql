\set ON_ERROR_STOP on
\ir assert_isolated_test_target.sql
begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-111111111111','authenticated','authenticated','finding-owner@example.test',crypt('isolated-test-only',gen_salt('bf')),now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','33333333-3333-4333-8333-333333333333','authenticated','authenticated','finding-mechanic@example.test',crypt('isolated-test-only',gen_salt('bf')),now(),'{}','{}',now(),now());
insert into public.organizations(id,name,slug) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Finding test','finding-test');
insert into public.organization_memberships(organization_id,profile_id,role) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','mechanic');
insert into public.customers(id,organization_id,display_name) values('cccccccc-cccc-4ccc-8ccc-cccccccc0001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Test');
insert into public.vehicles(id,organization_id,customer_id,registration_current) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccc0001','TEST');
insert into public.service_requests(id,organization_id,customer_id,vehicle_id,status,summary,source,channel) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccc0001','dddddddd-dddd-4ddd-8ddd-dddddddddddd','new','Test','manual','manual');
insert into public.service_case_assignments(case_id,organization_id,mechanic_id,assigned_by,vehicle_id,quibi_customer_id,quibi_vehicle_id,quibi_work_order_id,quibi_content_sha256,status) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','1','2','3',repeat('a',64),'in_progress');
insert into public.case_repair_findings(id,case_id,author_id,description) values('aaaaaaaa-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','33333333-3333-4333-8333-333333333333','Test finding');
do $$ declare v_offer uuid; begin
 if has_function_privilege('authenticated','public.record_finding_catalog_decision(uuid,uuid,uuid,jsonb,text,text)','EXECUTE') or has_function_privilege('anon','public.bind_finding_catalog_operation(uuid,uuid,uuid)','EXECUTE') then raise exception 'Untrusted client may forge evidence'; end if;
 v_offer:=public.record_finding_catalog_decision('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',jsonb_build_array(jsonb_build_object('description','Test','baselineSha',repeat('a',64),'requestSha',repeat('d',64),'requestJson',jsonb_build_object('baselineSha',repeat('a',64))::text)),repeat('b',64),'approved');
 if not exists(select 1 from public.case_finding_offer_decisions where offer_id=v_offer and decision='approved') then raise exception 'Decision missing'; end if;
 begin perform public.record_finding_catalog_decision('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','[{"description":"Test"}]',repeat('c',64),'approved'); raise exception 'Duplicate approval allowed'; exception when raise_exception then if sqlerrm<>'INVALID_INPUT' then raise; end if; end;
 begin perform public.bind_finding_catalog_operation('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',v_offer,'aaaaaaaa-0000-4000-8000-000000000002'); raise exception 'Unverified operation bound'; exception when raise_exception then if sqlerrm<>'OPERATION_UNVERIFIED' then raise; end if; end;
 insert into public.quibi_dev_operation_journal(id,organization_id,service_request_id,local_entity_id,kind,request_body,request_sha256,state,quibi_id,quibi_content_sha256,created_by_profile_id)
 values('aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-0000-4000-8000-000000000003','work_order_update',jsonb_build_object('baselineSha',repeat('a',64))::text,repeat('d',64),'verified','3',repeat('e',64),'11111111-1111-4111-8111-111111111111');
 perform public.bind_finding_catalog_operation('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',v_offer,'aaaaaaaa-0000-4000-8000-000000000002');
 perform public.bind_finding_catalog_operation('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',v_offer,'aaaaaaaa-0000-4000-8000-000000000002');
 if (select quibi_content_sha256 from public.service_case_assignments where case_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')<>repeat('e',64) then raise exception 'Reference not updated'; end if;
 perform set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
 perform public.complete_finding_catalog_work('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',v_offer);
 if not exists(select 1 from public.case_finding_offers where id=v_offer and completed_by='33333333-3333-4333-8333-333333333333' and completed_at is not null) then raise exception 'Completion not recorded'; end if;
end $$;
rollback;
