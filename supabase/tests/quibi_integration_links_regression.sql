-- Run only via the isolated CI runner after M3/M4 and the full migration chain.
\set ON_ERROR_STOP on
\ir assert_isolated_test_target.sql

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'quibi-owner-a@example.test', crypt('isolated-test-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'quibi-owner-b@example.test', crypt('isolated-test-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'quibi-mechanic@example.test', crypt('isolated-test-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.organizations (id, name, slug) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Isolated Quibi A', 'isolated-quibi-a'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Isolated Quibi B', 'isolated-quibi-b');
insert into public.organization_memberships (organization_id, profile_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'owner'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'mechanic');
insert into public.customers (id, organization_id, display_name, archived_at) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccc0001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fixture A1', null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccc0002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fixture A2', null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccc0003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fixture archived', now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccc0004', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Fixture B', null);

do $$ begin
  if not has_table_privilege('authenticated', 'public.integration_links', 'SELECT')
    or not has_column_privilege('authenticated', 'public.integration_links', 'sync_status', 'UPDATE')
    or has_column_privilege('authenticated', 'public.integration_links', 'external_id', 'UPDATE')
    or has_table_privilege('authenticated', 'public.integration_links', 'DELETE')
    or has_table_privilege('anon', 'public.integration_links', 'SELECT')
  then raise exception 'Quibi link grants are unsafe'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.integration_links'::regclass)
  then raise exception 'Quibi link RLS is disabled'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
insert into public.integration_links (
  organization_id, provider, entity_type, entity_id, external_id,
  local_fingerprint, external_fingerprint, confirmed_by
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'quibi', 'customer',
  'cccccccc-cccc-4ccc-8ccc-cccccccc0001', '13510', repeat('a',64), repeat('b',64),
  '11111111-1111-4111-8111-111111111111'
);
do $$ begin
  if (select count(*) from public.integration_links) <> 1 then
    raise exception 'Owner cannot read own Quibi link or tenant isolation failed';
  end if;
end $$;
update public.integration_links set sync_status = 'ok', last_checked_at = now(),
  last_seen_fingerprint = repeat('b',64), last_error_code = null
where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and entity_id = 'cccccccc-cccc-4ccc-8ccc-cccccccc0001';
do $$ begin
  if not exists (select 1 from public.integration_links where external_id = '13510' and sync_status = 'ok')
  then raise exception 'Owner could not record successful read state'; end if;
end $$;

do $$
declare denied boolean := false;
begin
  begin
    insert into public.integration_links (organization_id, provider, entity_type, entity_id, external_id, local_fingerprint, external_fingerprint, confirmed_by)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'quibi', 'customer', 'cccccccc-cccc-4ccc-8ccc-cccccccc0001', '999', repeat('a',64), repeat('b',64), '11111111-1111-4111-8111-111111111111');
  exception when unique_violation then denied := true; end;
  if not denied then raise exception 'Duplicate internal customer ID was accepted'; end if;
  denied := false;
  begin
    insert into public.integration_links (organization_id, provider, entity_type, entity_id, external_id, local_fingerprint, external_fingerprint, confirmed_by)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'quibi', 'customer', 'cccccccc-cccc-4ccc-8ccc-cccccccc0002', '13510', repeat('a',64), repeat('b',64), '11111111-1111-4111-8111-111111111111');
  exception when unique_violation then denied := true; end;
  if not denied then raise exception 'Duplicate external Quibi ID was accepted'; end if;
  denied := false;
  begin
    insert into public.integration_links (organization_id, provider, entity_type, entity_id, external_id, local_fingerprint, external_fingerprint, confirmed_by)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'quibi', 'customer', 'cccccccc-cccc-4ccc-8ccc-cccccccc0003', '200', repeat('a',64), repeat('b',64), '11111111-1111-4111-8111-111111111111');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Archived customer link was accepted'; end if;
  denied := false;
  begin
    insert into public.integration_links (organization_id, provider, entity_type, entity_id, external_id, local_fingerprint, external_fingerprint, confirmed_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'quibi', 'customer', 'cccccccc-cccc-4ccc-8ccc-cccccccc0004', '200', repeat('a',64), repeat('b',64), '11111111-1111-4111-8111-111111111111');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Cross-tenant link was accepted'; end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$ begin
  if (select count(*) from public.integration_links) <> 0 then raise exception 'Other organization saw Quibi link'; end if;
end $$;
insert into public.integration_links (organization_id, provider, entity_type, entity_id, external_id, local_fingerprint, external_fingerprint, confirmed_by)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'quibi', 'customer', 'cccccccc-cccc-4ccc-8ccc-cccccccc0004', '13510', repeat('a',64), repeat('b',64), '22222222-2222-4222-8222-222222222222');
do $$ begin
  if (select count(*) from public.integration_links) <> 1 then raise exception 'Per-tenant external ID reuse failed'; end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
do $$
declare denied boolean := false;
begin
  if (select count(*) from public.integration_links) <> 0 then raise exception 'Mechanic saw Quibi links'; end if;
  begin
    insert into public.integration_links (organization_id, provider, entity_type, entity_id, external_id, local_fingerprint, external_fingerprint, confirmed_by)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'quibi', 'customer', 'cccccccc-cccc-4ccc-8ccc-cccccccc0002', '300', repeat('a',64), repeat('b',64), '33333333-3333-4333-8333-333333333333');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Mechanic linked Quibi customer'; end if;
end $$;

rollback;
