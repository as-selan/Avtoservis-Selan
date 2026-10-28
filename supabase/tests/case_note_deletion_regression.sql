\set ON_ERROR_STOP on
\ir assert_isolated_test_target.sql
begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-111111111111','authenticated','authenticated','note-owner@example.test',crypt('isolated-test-only',gen_salt('bf')),now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','33333333-3333-4333-8333-333333333333','authenticated','authenticated','note-mechanic@example.test',crypt('isolated-test-only',gen_salt('bf')),now(),'{}','{}',now(),now());
insert into public.organizations(id,name,slug) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Note test','note-test');
insert into public.organization_memberships(organization_id,profile_id,role) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','mechanic');
insert into public.customers(id,organization_id,display_name) values('cccccccc-cccc-4ccc-8ccc-cccccccc0001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Test');
insert into public.vehicles(id,organization_id,customer_id,registration_current) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccc0001','TEST');
insert into public.service_requests(id,organization_id,customer_id,vehicle_id,status,summary,source,channel) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccc0001','dddddddd-dddd-4ddd-8ddd-dddddddddddd','new','Test','manual','manual');
insert into public.service_case_assignments(case_id,organization_id,mechanic_id,assigned_by,vehicle_id,quibi_customer_id,quibi_vehicle_id,quibi_work_order_id,quibi_content_sha256,status) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','1','2','3',repeat('a',64),'work_completed');
insert into public.service_case_notes(id,case_id,author_id,body) values('aaaaaaaa-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','33333333-3333-4333-8333-333333333333','Own note'),('aaaaaaaa-0000-4000-8000-000000000002','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111','Manager note');
create temp table evidence_before as select private.case_work_evidence_sha('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') as sha;
grant select on evidence_before to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ begin
 begin perform public.hide_case_note('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-0000-4000-8000-000000000002'); raise exception 'other note deletion allowed'; exception when raise_exception then if sqlerrm <> 'FORBIDDEN' then raise; end if; end;
 perform public.hide_case_note('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-0000-4000-8000-000000000001');
 if not exists(select 1 from public.service_case_notes where id='aaaaaaaa-0000-4000-8000-000000000001' and deleted_at is not null and deleted_by=auth.uid() and body='Own note') then raise exception 'audit missing'; end if;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.hide_case_note('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-0000-4000-8000-000000000002');
reset role;
do $$ begin if private.case_work_evidence_sha('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') is distinct from (select sha from evidence_before) then raise exception 'review evidence changed'; end if; end $$;
rollback;
