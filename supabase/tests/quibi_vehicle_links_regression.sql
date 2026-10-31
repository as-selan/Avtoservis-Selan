\set ON_ERROR_STOP on
\ir assert_isolated_test_target.sql
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-111111111111','authenticated','authenticated',
 'vehicle-a@example.test',crypt('isolated-test-only',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','22222222-2222-4222-8222-222222222222','authenticated','authenticated',
 'vehicle-b@example.test',crypt('isolated-test-only',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
insert into public.organizations(id,name,slug) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Vehicle test A','vehicle-test-a'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Vehicle test B','vehicle-test-b');
insert into public.organization_memberships(organization_id,profile_id,role) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','admin'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','admin');
insert into public.customers(id,organization_id,display_name) values
('cccccccc-cccc-4ccc-8ccc-cccccccc0001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Customer A'),
('cccccccc-cccc-4ccc-8ccc-cccccccc0002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Customer B');
insert into public.vehicles(id,organization_id,customer_id,vin) values
('dddddddd-dddd-4ddd-8ddd-dddddddd0001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccc0001','TESTVIN-A'),
('dddddddd-dddd-4ddd-8ddd-dddddddd0002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccc0002','TESTVIN-B');
insert into public.integration_links(organization_id,provider,entity_type,entity_id,external_id,
  local_fingerprint,external_fingerprint,confirmed_by) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','quibi','customer','cccccccc-cccc-4ccc-8ccc-cccccccc0001',
 '12',repeat('a',64),repeat('b',64),'11111111-1111-4111-8111-111111111111');

do $$ begin
  if not (select relrowsecurity from pg_class where oid='public.quibi_vehicle_links'::regclass)
    or not has_table_privilege('authenticated','public.quibi_vehicle_links','SELECT')
    or has_table_privilege('authenticated','public.quibi_vehicle_links','INSERT')
    or has_table_privilege('authenticated','public.quibi_vehicle_links','UPDATE')
    or has_table_privilege('authenticated','public.quibi_vehicle_links','DELETE')
    or has_table_privilege('anon','public.quibi_vehicle_links','SELECT')
  then raise exception 'Vehicle link grants/RLS unsafe'; end if;
end $$;

do $$ declare denied boolean := false; begin
  begin
    insert into public.quibi_vehicle_links(organization_id,customer_id,vehicle_id,quibi_customer_id,
      quibi_vehicle_id,local_fingerprint,external_fingerprint,confirmed_by) values
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccc0002',
     'dddddddd-dddd-4ddd-8ddd-dddddddd0002','12','972',repeat('a',64),repeat('b',64),
     '22222222-2222-4222-8222-222222222222');
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'Unconfirmed customer pair accepted'; end if;
end $$;

insert into public.quibi_vehicle_links(organization_id,customer_id,vehicle_id,quibi_customer_id,
  quibi_vehicle_id,local_fingerprint,external_fingerprint,confirmed_by) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccc0001',
 'dddddddd-dddd-4ddd-8ddd-dddddddd0001','12','972',repeat('a',64),repeat('b',64),
 '11111111-1111-4111-8111-111111111111');

do $$ declare denied boolean := false; begin
  begin
    insert into public.quibi_vehicle_links(organization_id,customer_id,vehicle_id,quibi_customer_id,
      quibi_vehicle_id,local_fingerprint,external_fingerprint,confirmed_by) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccc0001',
     'dddddddd-dddd-4ddd-8ddd-dddddddd0001','12','973',repeat('a',64),repeat('b',64),
     '11111111-1111-4111-8111-111111111111');
  exception when unique_violation then denied := true; end;
  if not denied then raise exception 'Duplicate local vehicle link accepted'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ declare denied boolean := false; begin
  if (select count(*) from public.quibi_vehicle_links) <> 1 then raise exception 'Own vehicle link hidden'; end if;
  begin update public.quibi_vehicle_links set sync_status='ok';
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Browser forged vehicle sync status'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
  if (select count(*) from public.quibi_vehicle_links) <> 0 then raise exception 'Cross-org vehicle link visible'; end if;
end $$;
rollback;
