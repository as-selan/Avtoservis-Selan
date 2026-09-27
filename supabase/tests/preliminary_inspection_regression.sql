-- Disposable Docker database only. No hosted project connection is accepted.
\set ON_ERROR_STOP on
\ir assert_isolated_test_target.sql
begin;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '61616161-6161-4161-8161-616161616161', 'authenticated', 'authenticated', 'inspection-owner@example.test', crypt('isolated-test-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '62626262-6262-4262-8262-626262626262', 'authenticated', 'authenticated', 'inspection-foreign@example.test', crypt('isolated-test-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.organizations (id, name, slug) values
  ('71717171-7171-4171-8171-717171717171', 'Isolated Selan', 'avtoservis-selan'),
  ('72727272-7272-4272-8272-727272727272', 'Other workshop', 'other-workshop');
insert into public.organization_memberships (organization_id, profile_id, role) values
  ('71717171-7171-4171-8171-717171717171', '61616161-6161-4161-8161-616161616161', 'owner'),
  ('72727272-7272-4272-8272-727272727272', '62626262-6262-4262-8262-626262626262', 'owner');
insert into public.service_requests (id, organization_id, status, summary, source) values
  ('81818181-8181-4181-8181-818181818181', '71717171-7171-4171-8171-717171717171', 'new', 'Preliminary inspection A', 'manual'),
  ('82828282-8282-4282-8282-828282828282', '71717171-7171-4171-8171-717171717171', 'new', 'Preliminary inspection B', 'manual');
do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.preliminary_inspections'::regclass)
     or has_table_privilege('authenticated','public.preliminary_inspections','INSERT')
     or not has_function_privilege('authenticated','public.record_preliminary_inspection(uuid,text,text)','EXECUTE')
  then raise exception 'Inspection RLS or grants are unsafe'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','61616161-6161-4161-8161-616161616161',true);
do $$ declare v jsonb; begin
  v := public.record_preliminary_inspection('81818181-8181-4181-8181-818181818181','request');
  if v->>'ok' <> 'true' then raise exception 'Inspection request failed: %',v; end if;
  v := public.record_preliminary_inspection('81818181-8181-4181-8181-818181818181','complete','Real synthetic findings');
  if v->>'ok' <> 'true' then raise exception 'Inspection completion failed: %',v; end if;
  v := public.record_preliminary_inspection('81818181-8181-4181-8181-818181818181','repair_ordered');
  if v->>'ok' <> 'true' then raise exception 'Repair order decision failed: %',v; end if;
  v := public.record_preliminary_inspection('81818181-8181-4181-8181-818181818181','repair_not_ordered');
  if v->>'ok' <> 'false' then raise exception 'Terminal decision changed without review'; end if;
  v := public.record_preliminary_inspection('82828282-8282-4282-8282-828282828282','request');
  v := public.record_preliminary_inspection('82828282-8282-4282-8282-828282828282','complete','Other synthetic findings');
  v := public.record_preliminary_inspection('82828282-8282-4282-8282-828282828282','repair_not_ordered');
  if v->>'ok' <> 'true' then raise exception 'Billable inspection decision failed: %',v; end if;
  if (select count(*) from public.preliminary_inspections where repair_decision = 'ordered') <> 1
     or (select count(*) from public.preliminary_inspections where repair_decision = 'not_ordered') <> 1
  then raise exception 'Inspection outcomes were not retained'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','62626262-6262-4262-8262-626262626262',true);
do $$ declare v jsonb; begin
  if (select count(*) from public.preliminary_inspections) <> 0 then
    raise exception 'Cross-tenant inspection rows visible'; end if;
  v := public.record_preliminary_inspection('81818181-8181-4181-8181-818181818181','request');
  if v->>'ok' <> 'false' then raise exception 'Cross-tenant inspection write accepted'; end if;
end $$;
rollback;
