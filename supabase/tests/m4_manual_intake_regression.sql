-- =============================================================================
-- M4 manual intake — database regression suite (Docker / local Supabase later)
--
-- HARD RULES:
--   - Do NOT run without scripts/run-m4-db-regression.ps1 (or equivalent gate).
--   - Direct `psql "$DATABASE_URL"` is forbidden; use M4_ISOLATED_TEST_DATABASE_URL
--     via the runner after manual setup_m4_isolated_test_marker.sql.
--   - Auth fixtures are created inside this transaction and discarded by ROLLBACK.
--     Do not create durable external auth users for this suite.
--
-- Prerequisites (applied in order on the isolated DB):
--   M2 foundation, M3 customers/vehicles/service_requests, M4 intake RPC,
--   supabase/tests/setup_m4_isolated_test_marker.sql (manual).
-- =============================================================================

\ir assert_isolated_test_target.sql

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Temp objects are owned by the session role (postgres). After SET ROLE
-- authenticated, current_user loses default access unless granted — so grant
-- INSERT/UPDATE/SELECT on the assert log and EXECUTE on helpers explicitly.
create temporary table m4_assert_log (
  step text primary key,
  ok boolean not null,
  detail text,
  observed_role text not null default current_user
);

grant select, insert, update on table m4_assert_log to authenticated;
grant select, insert, update on table m4_assert_log to public;

create or replace function pg_temp.m4_assert(p_step text, p_ok boolean, p_detail text default null)
returns void
language plpgsql
security invoker
set search_path = pg_temp, public
as $$
begin
  insert into pg_temp.m4_assert_log(step, ok, detail, observed_role)
  values (p_step, p_ok, p_detail, current_user)
  on conflict (step) do update
    set ok = excluded.ok,
        detail = excluded.detail,
        observed_role = excluded.observed_role;
  if not p_ok then
    raise exception 'M4 assert failed: % — % (role=%)',
      p_step,
      coalesce(p_detail, 'no detail'),
      current_user;
  end if;
end;
$$;

grant execute on function pg_temp.m4_assert(text, boolean, text) to authenticated;
grant execute on function pg_temp.m4_assert(text, boolean, text) to public;

-- Become PostgREST-equivalent authenticated caller (RLS applies).
create or replace function pg_temp.m4_become_authenticated(p_uid uuid)
returns void
language plpgsql
security invoker
set search_path = pg_temp, public
as $$
begin
  execute 'reset role';
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_uid::text,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  if current_user is distinct from 'authenticated' then
    raise exception 'M4 role switch failed: expected authenticated, got %', current_user;
  end if;
end;
$$;

grant execute on function pg_temp.m4_become_authenticated(uuid) to authenticated;
grant execute on function pg_temp.m4_become_authenticated(uuid) to public;

create or replace function pg_temp.m4_become_postgres()
returns void
language plpgsql
security invoker
set search_path = pg_temp, public
as $$
begin
  execute 'reset role';
  if current_user in ('authenticated', 'anon') then
    raise exception 'M4 role switch failed: still % after reset role', current_user;
  end if;
end;
$$;

grant execute on function pg_temp.m4_become_postgres() to authenticated;
grant execute on function pg_temp.m4_become_postgres() to public;

-- ---------------------------------------------------------------------------
-- Ephemeral fixtures (ROLLBACK discards auth.users + app rows)
-- ---------------------------------------------------------------------------
do $$
declare
  v_org_id uuid;
  v_other_org uuid;
  v_owner uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_mechanic uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_outsider uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_instance uuid := '00000000-0000-0000-0000-000000000000';
begin
  perform pg_temp.m4_become_postgres();

  -- Minimal auth.users rows (transaction-scoped; rolled back at end).
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values
    (v_owner, v_instance, 'authenticated', 'authenticated',
     'm4-owner@isolated.test', crypt('unused', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (v_mechanic, v_instance, 'authenticated', 'authenticated',
     'm4-mechanic@isolated.test', crypt('unused', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (v_outsider, v_instance, 'authenticated', 'authenticated',
     'm4-outsider@isolated.test', crypt('unused', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
  on conflict (id) do nothing;

  insert into public.profiles (id, full_name, email)
  values
    (v_owner, 'M4 Owner', 'm4-owner@isolated.test'),
    (v_mechanic, 'M4 Mechanic', 'm4-mechanic@isolated.test'),
    (v_outsider, 'M4 Outsider', 'm4-outsider@isolated.test')
  on conflict (id) do nothing;

  select id into v_org_id from public.organizations where slug = 'avtoservis-selan';
  if v_org_id is null then
    insert into public.organizations (name, slug, timezone)
    values ('Avtoservis Selan', 'avtoservis-selan', 'Europe/Ljubljana')
    returning id into v_org_id;
  end if;

  select id into v_other_org from public.organizations where slug = 'other-shop-m4-test';
  if v_other_org is null then
    insert into public.organizations (name, slug, timezone)
    values ('Other Shop', 'other-shop-m4-test', 'Europe/Ljubljana')
    returning id into v_other_org;
  end if;

  insert into public.organization_memberships (organization_id, profile_id, role, is_active)
  values
    (v_org_id, v_owner, 'owner', true),
    (v_org_id, v_mechanic, 'mechanic', true),
    (v_other_org, v_outsider, 'owner', true)
  on conflict (organization_id, profile_id) do update
    set role = excluded.role, is_active = true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 0) Actual function/table privileges (catalog, not source-text greps)
-- ---------------------------------------------------------------------------
do $$
declare
  v_canon_reg regprocedure :=
    'private.canonical_manual_intake_material(text, text, uuid, uuid, text, text, text, integer, text, text, text, text, text, integer, integer, text, text, text, boolean)'::regprocedure;
  v_rpc_reg regprocedure :=
    'public.create_manual_service_request_intake(text, text, text, text, text, text, text, text, integer, integer, text, text, text, integer, text, text, boolean, uuid, uuid, uuid)'::regprocedure;
  v_snap regclass := 'private.manual_intake_material_snapshots'::regclass;
begin
  perform pg_temp.m4_become_postgres();

  perform pg_temp.m4_assert(
    'priv_canonical_no_exec_authenticated',
    not has_function_privilege('authenticated', v_canon_reg, 'EXECUTE'),
    'authenticated must not EXECUTE private.canonical_manual_intake_material'
  );
  perform pg_temp.m4_assert(
    'priv_canonical_no_exec_anon',
    not has_function_privilege('anon', v_canon_reg, 'EXECUTE'),
    'anon must not EXECUTE private.canonical_manual_intake_material'
  );
  perform pg_temp.m4_assert(
    'priv_rpc_exec_authenticated',
    has_function_privilege('authenticated', v_rpc_reg, 'EXECUTE'),
    'authenticated must EXECUTE create_manual_service_request_intake'
  );
  perform pg_temp.m4_assert(
    'priv_rpc_no_exec_anon',
    not has_function_privilege('anon', v_rpc_reg, 'EXECUTE'),
    'anon must not EXECUTE create_manual_service_request_intake'
  );
  perform pg_temp.m4_assert(
    'priv_rpc_is_security_definer',
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'create_manual_service_request_intake'
        and p.prosecdef
    ),
    'intake RPC must be SECURITY DEFINER'
  );

  perform pg_temp.m4_assert(
    'priv_rpc_owner_privileged',
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_roles r on r.oid = p.proowner
      where n.nspname = 'public'
        and p.proname = 'create_manual_service_request_intake'
        and p.prosecdef
        and r.rolname in ('postgres', 'supabase_admin')
    ),
    'DEFINER intake RPC owner must be postgres or supabase_admin'
  );

  perform pg_temp.m4_assert(
    'priv_snap_composite_fk',
    exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'private'
        and t.relname = 'manual_intake_material_snapshots'
        and c.conname = 'manual_intake_material_snapshots_org_sr_fkey'
        and c.contype = 'f'
    ),
    'snapshot must have composite FK (organization_id, service_request_id)'
  );

  perform pg_temp.m4_assert(
    'priv_snap_no_select_authenticated',
    not has_table_privilege('authenticated', v_snap, 'SELECT')
  );
  perform pg_temp.m4_assert(
    'priv_snap_no_insert_authenticated',
    not has_table_privilege('authenticated', v_snap, 'INSERT')
  );
  perform pg_temp.m4_assert(
    'priv_snap_no_update_authenticated',
    not has_table_privilege('authenticated', v_snap, 'UPDATE')
  );
  perform pg_temp.m4_assert(
    'priv_snap_no_delete_authenticated',
    not has_table_privilege('authenticated', v_snap, 'DELETE')
  );
  perform pg_temp.m4_assert(
    'priv_snap_no_select_anon',
    not has_table_privilege('anon', v_snap, 'SELECT')
  );
  perform pg_temp.m4_assert(
    'priv_intake_request_id_no_insert_authenticated',
    not has_column_privilege(
      'authenticated',
      'public.service_requests',
      'intake_request_id',
      'INSERT'
    )
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- 1) Mileage preservation (authenticated owner)
-- ---------------------------------------------------------------------------
do $$
declare
  v_org_id uuid;
  v_owner uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_req_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_result jsonb;
  v_latest integer;
  v_recorded_at timestamptz;
  v_reported integer;
begin
  perform pg_temp.m4_become_postgres();
  select id into v_org_id from public.organizations where slug = 'avtoservis-selan';

  insert into public.customers (organization_id, display_name, phone, email, source)
  values (v_org_id, 'Mileage Cust', '041111111', 'mile@test.si', 'manual')
  returning id into v_customer_id;

  insert into public.vehicles (
    organization_id, customer_id, vin, make, model,
    mileage_latest_km, mileage_latest_recorded_at
  ) values (
    v_org_id, v_customer_id, 'WBAKMILEAGE00001', 'BMW', '320d',
    200000, timestamptz '2026-01-15 10:00:00+00'
  ) returning id into v_vehicle_id;

  perform pg_temp.m4_become_authenticated(v_owner);
  perform pg_temp.m4_assert(
    'mileage_role_is_authenticated',
    current_user = 'authenticated',
    current_user
  );
  v_result := public.create_manual_service_request_intake(
    p_display_name := 'Mileage Cust',
    p_phone := '041111111',
    p_email := 'mile@test.si',
    p_channel := 'phone',
    p_vin := 'WBAKMILEAGE00001',
    p_make := 'BMW',
    p_model := '320d',
    p_mileage_reported_km := 150000,
    p_service_wanted := 'Oljni servis',
    p_selected_customer_id := v_customer_id,
    p_selected_vehicle_id := v_vehicle_id,
    p_client_request_id := v_req_id
  );

  perform pg_temp.m4_assert('mileage_rpc_ok', coalesce((v_result->>'ok')::boolean, false), v_result::text);

  perform pg_temp.m4_become_postgres();
  select mileage_latest_km, mileage_latest_recorded_at
    into v_latest, v_recorded_at
  from public.vehicles where id = v_vehicle_id;

  perform pg_temp.m4_assert('mileage_latest_preserved', v_latest = 200000, format('got %s', v_latest));
  perform pg_temp.m4_assert(
    'mileage_recorded_at_preserved',
    v_recorded_at = timestamptz '2026-01-15 10:00:00+00',
    v_recorded_at::text
  );

  select mileage_reported_km into v_reported
  from public.service_requests where intake_request_id = v_req_id;
  perform pg_temp.m4_assert('mileage_reported_on_request', v_reported = 150000, format('got %s', v_reported));
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Idempotent same payload (authenticated)
-- ---------------------------------------------------------------------------
do $$
declare
  v_owner uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_req_id uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_first jsonb;
  v_second jsonb;
  v_count integer;
begin
  perform pg_temp.m4_become_authenticated(v_owner);

  v_first := public.create_manual_service_request_intake(
    p_display_name := 'Idem Cust',
    p_phone := '041222222',
    p_email := 'idem@test.si',
    p_channel := 'manual',
    p_vin := 'WBAKIDEM00000001',
    p_make := 'VW',
    p_model := 'Golf',
    p_service_wanted := 'Diagnostika',
    p_client_request_id := v_req_id
  );

  v_second := public.create_manual_service_request_intake(
    p_display_name := 'Idem Cust',
    p_phone := '041222222',
    p_email := 'idem@test.si',
    p_channel := 'manual',
    p_vin := 'WBAKIDEM00000001',
    p_make := 'VW',
    p_model := 'Golf',
    p_service_wanted := 'Diagnostika',
    p_client_request_id := v_req_id
  );

  perform pg_temp.m4_assert('idem_first_ok', coalesce((v_first->>'ok')::boolean, false), v_first::text);
  perform pg_temp.m4_assert('idem_second_ok', coalesce((v_second->>'ok')::boolean, false), v_second::text);
  perform pg_temp.m4_assert('idem_replayed_flag', coalesce((v_second->>'replayed')::boolean, false));
  perform pg_temp.m4_assert(
    'idem_same_request_id',
    (v_first->>'service_request_id') = (v_second->>'service_request_id')
  );

  perform pg_temp.m4_become_postgres();
  select count(*)::integer into v_count
  from public.service_requests where intake_request_id = v_req_id;
  perform pg_temp.m4_assert('idem_single_row', v_count = 1, format('count=%s', v_count));

  select count(*)::integer into v_count
  from private.manual_intake_material_snapshots s
  where s.intake_request_id = v_req_id;
  perform pg_temp.m4_assert('idem_single_snapshot', v_count = 1, format('count=%s', v_count));

  perform pg_temp.m4_assert(
    'idem_response_omits_material',
    not (v_first ? 'material') and not (v_second ? 'material')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2b) Idempotency material snapshot: identical vs conflict vs missing snapshot
-- ---------------------------------------------------------------------------
do $$
declare
  v_owner uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_req_id uuid := 'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1';
  v_req_null uuid := 'e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e2e2';
  v_org_id uuid;
  v_cid uuid;
  v_vid uuid;
  v_first jsonb;
  v_second jsonb;
  v_wanted text;
  v_count integer;
  v_cust_before integer;
  v_veh_before integer;
  v_sr_before integer;
  v_cust_after integer;
  v_veh_after integer;
  v_sr_after integer;
begin
  perform pg_temp.m4_become_authenticated(v_owner);

  v_first := public.create_manual_service_request_intake(
    p_display_name := 'Idem Drift',
    p_phone := '041 222 233',
    p_email := 'idem-drift@test.si',
    p_channel := 'manual',
    p_vin := 'wbakidemdrift001',
    p_make := 'VW',
    p_model := 'Polo',
    p_service_wanted := 'Prvi opis',
    p_problem_description := 'Opis A',
    p_mileage_reported_km := 1000,
    p_client_request_id := v_req_id
  );

  -- Normalized equivalent phone/VIN/email must replay.
  v_second := public.create_manual_service_request_intake(
    p_display_name := 'Idem Drift',
    p_phone := '041-222-233',
    p_email := 'IDEM-DRIFT@TEST.SI',
    p_channel := 'manual',
    p_vin := 'WBAKIDEMDRIFT001',
    p_make := 'VW',
    p_model := 'Polo',
    p_service_wanted := 'Prvi opis',
    p_problem_description := 'Opis A',
    p_mileage_reported_km := 1000,
    p_client_request_id := v_req_id
  );

  perform pg_temp.m4_assert('idem_norm_first_ok', coalesce((v_first->>'ok')::boolean, false), v_first::text);
  perform pg_temp.m4_assert(
    'idem_norm_replay',
    coalesce((v_second->>'ok')::boolean, false)
      and coalesce((v_second->>'replayed')::boolean, false),
    v_second::text
  );

  perform pg_temp.m4_become_postgres();
  select count(*)::integer into v_cust_before from public.customers;
  select count(*)::integer into v_veh_before from public.vehicles;
  select count(*)::integer into v_sr_before from public.service_requests;

  perform pg_temp.m4_become_authenticated(v_owner);

  v_second := public.create_manual_service_request_intake(
    p_display_name := 'Idem Drift',
    p_phone := '041222233',
    p_email := 'idem-drift@test.si',
    p_channel := 'manual',
    p_vin := 'WBAKIDEMDRIFT001',
    p_make := 'VW',
    p_model := 'Polo',
    p_service_wanted := 'Drugačen opis',
    p_problem_description := 'Opis A',
    p_mileage_reported_km := 1000,
    p_client_request_id := v_req_id
  );
  perform pg_temp.m4_assert(
    'idem_conflict_service_wanted',
    (v_second->>'ok') = 'false'
      and (v_second->>'error_code') = 'idempotency_conflict',
    v_second::text
  );

  v_second := public.create_manual_service_request_intake(
    p_display_name := 'Idem Drift',
    p_phone := '041222233',
    p_email := 'idem-drift@test.si',
    p_channel := 'manual',
    p_vin := 'WBAKIDEMDRIFT001',
    p_make := 'VW',
    p_model := 'Polo',
    p_service_wanted := 'Prvi opis',
    p_problem_description := 'Opis B',
    p_mileage_reported_km := 1000,
    p_client_request_id := v_req_id
  );
  perform pg_temp.m4_assert(
    'idem_conflict_problem_description',
    (v_second->>'ok') = 'false'
      and (v_second->>'error_code') = 'idempotency_conflict',
    v_second::text
  );

  v_second := public.create_manual_service_request_intake(
    p_display_name := 'Idem Drift',
    p_phone := '041222233',
    p_email := 'idem-drift@test.si',
    p_channel := 'manual',
    p_vin := 'WBAKIDEMDRIFT001',
    p_make := 'VW',
    p_model := 'Polo',
    p_service_wanted := 'Prvi opis',
    p_problem_description := 'Opis A',
    p_mileage_reported_km := 2000,
    p_client_request_id := v_req_id
  );
  perform pg_temp.m4_assert(
    'idem_conflict_mileage',
    (v_second->>'ok') = 'false'
      and (v_second->>'error_code') = 'idempotency_conflict',
    v_second::text
  );

  v_second := public.create_manual_service_request_intake(
    p_display_name := 'Idem Drift',
    p_phone := '041222299',
    p_email := 'idem-drift@test.si',
    p_channel := 'manual',
    p_vin := 'WBAKIDEMDRIFT001',
    p_make := 'VW',
    p_model := 'Polo',
    p_service_wanted := 'Prvi opis',
    p_problem_description := 'Opis A',
    p_mileage_reported_km := 1000,
    p_client_request_id := v_req_id
  );
  perform pg_temp.m4_assert(
    'idem_conflict_phone',
    (v_second->>'ok') = 'false'
      and (v_second->>'error_code') = 'idempotency_conflict',
    v_second::text
  );

  v_second := public.create_manual_service_request_intake(
    p_display_name := 'Idem Drift',
    p_phone := '041222233',
    p_email := 'other-drift@test.si',
    p_channel := 'manual',
    p_vin := 'WBAKIDEMDRIFT001',
    p_make := 'VW',
    p_model := 'Polo',
    p_service_wanted := 'Prvi opis',
    p_problem_description := 'Opis A',
    p_mileage_reported_km := 1000,
    p_client_request_id := v_req_id
  );
  perform pg_temp.m4_assert(
    'idem_conflict_email',
    (v_second->>'ok') = 'false'
      and (v_second->>'error_code') = 'idempotency_conflict',
    v_second::text
  );

  v_second := public.create_manual_service_request_intake(
    p_display_name := 'Idem Drift',
    p_phone := '041222233',
    p_email := 'idem-drift@test.si',
    p_channel := 'manual',
    p_vin := 'WBAKIDEMDRIFT999',
    p_make := 'VW',
    p_model := 'Polo',
    p_service_wanted := 'Prvi opis',
    p_problem_description := 'Opis A',
    p_mileage_reported_km := 1000,
    p_client_request_id := v_req_id
  );
  perform pg_temp.m4_assert(
    'idem_conflict_vin',
    (v_second->>'ok') = 'false'
      and (v_second->>'error_code') = 'idempotency_conflict',
    v_second::text
  );

  perform pg_temp.m4_become_postgres();
  select count(*)::integer into v_cust_after from public.customers;
  select count(*)::integer into v_veh_after from public.vehicles;
  select count(*)::integer into v_sr_after from public.service_requests;
  perform pg_temp.m4_assert('idem_conflict_no_new_customers', v_cust_after = v_cust_before);
  perform pg_temp.m4_assert('idem_conflict_no_new_vehicles', v_veh_after = v_veh_before);
  perform pg_temp.m4_assert('idem_conflict_no_new_requests', v_sr_after = v_sr_before);

  select service_wanted into v_wanted
  from public.service_requests where intake_request_id = v_req_id;
  perform pg_temp.m4_assert('idem_keeps_original_service_wanted', v_wanted = 'Prvi opis', coalesce(v_wanted, '<null>'));

  select count(*)::integer into v_count
  from public.service_requests where intake_request_id = v_req_id;
  perform pg_temp.m4_assert('idem_single_row_after_conflicts', v_count = 1);

  select id into v_org_id from public.organizations where slug = 'avtoservis-selan';
  select c.id into v_cid
  from public.customers c
  where c.organization_id = v_org_id
    and private.normalize_intake_phone(c.phone) = '041222233'
  limit 1;
  select v.id into v_vid
  from public.vehicles v
  where v.organization_id = v_org_id
    and private.normalize_intake_vin(v.vin) = 'WBAKIDEMDRIFT001'
  limit 1;

  perform pg_temp.m4_become_authenticated(v_owner);
  v_second := public.create_manual_service_request_intake(
    p_display_name := 'Idem Drift',
    p_phone := '041222233',
    p_email := 'idem-drift@test.si',
    p_channel := 'manual',
    p_vin := 'WBAKIDEMDRIFT001',
    p_make := 'VW',
    p_model := 'Polo',
    p_service_wanted := 'Prvi opis',
    p_problem_description := 'Opis A',
    p_mileage_reported_km := 1000,
    p_selected_customer_id := v_cid,
    p_selected_vehicle_id := v_vid,
    p_client_request_id := v_req_id
  );
  perform pg_temp.m4_assert(
    'idem_conflict_selected_ids',
    (v_second->>'ok') = 'false'
      and (v_second->>'error_code') = 'idempotency_conflict',
    v_second::text
  );

  -- Missing private snapshot for an intake_request_id: fail closed.
  perform pg_temp.m4_become_postgres();
  insert into public.service_requests (
    organization_id,
    customer_id,
    status,
    summary,
    service_wanted,
    source,
    channel,
    intake_request_id
  )
  select
    o.id,
    c.id,
    'needs_data',
    'Legacy',
    'Legacy wanted',
    'manual',
    'phone',
    v_req_null
  from public.organizations o
  cross join lateral (
    select id from public.customers
    where organization_id = o.id
    limit 1
  ) c
  where o.slug = 'avtoservis-selan';

  perform pg_temp.m4_assert(
    'missing_snapshot_row',
    not exists (
      select 1
      from private.manual_intake_material_snapshots s
      where s.intake_request_id = v_req_null
    )
  );

  perform pg_temp.m4_become_authenticated(v_owner);
  v_second := public.create_manual_service_request_intake(
    p_display_name := 'Legacy',
    p_phone := '041222233',
    p_email := 'idem-drift@test.si',
    p_channel := 'phone',
    p_service_wanted := 'Legacy wanted',
    p_client_request_id := v_req_null
  );
  perform pg_temp.m4_assert(
    'missing_snapshot_conflict',
    (v_second->>'ok') = 'false'
      and (v_second->>'error_code') = 'idempotency_conflict'
      and (v_second ? 'service_request_id'),
    v_second::text
  );

  -- Additional material-field conflicts (19-field coverage beyond the core eight).
  v_second := public.create_manual_service_request_intake(
    p_display_name := 'Idem Drift OTHER',
    p_phone := '041222233',
    p_email := 'idem-drift@test.si',
    p_channel := 'manual',
    p_vin := 'WBAKIDEMDRIFT001',
    p_make := 'VW',
    p_model := 'Polo',
    p_service_wanted := 'Prvi opis',
    p_problem_description := 'Opis A',
    p_mileage_reported_km := 1000,
    p_client_request_id := v_req_id
  );
  perform pg_temp.m4_assert(
    'idem_conflict_display_name',
    (v_second->>'ok') = 'false'
      and (v_second->>'error_code') = 'idempotency_conflict',
    v_second::text
  );

  v_second := public.create_manual_service_request_intake(
    p_display_name := 'Idem Drift',
    p_phone := '041222233',
    p_email := 'idem-drift@test.si',
    p_channel := 'sms',
    p_vin := 'WBAKIDEMDRIFT001',
    p_make := 'VW',
    p_model := 'Polo',
    p_service_wanted := 'Prvi opis',
    p_problem_description := 'Opis A',
    p_mileage_reported_km := 1000,
    p_client_request_id := v_req_id
  );
  perform pg_temp.m4_assert(
    'idem_conflict_channel',
    (v_second->>'ok') = 'false'
      and (v_second->>'error_code') = 'idempotency_conflict',
    v_second::text
  );

  v_second := public.create_manual_service_request_intake(
    p_display_name := 'Idem Drift',
    p_phone := '041222233',
    p_email := 'idem-drift@test.si',
    p_channel := 'manual',
    p_vin := 'WBAKIDEMDRIFT001',
    p_registration := 'LJ-AB-123',
    p_make := 'VW',
    p_model := 'Polo',
    p_year := 2018,
    p_power_kw := 85,
    p_engine := '1.6',
    p_engine_type := 'CJZA',
    p_fuel := 'diesel',
    p_service_wanted := 'Prvi opis',
    p_problem_description := 'Opis A',
    p_mileage_reported_km := 1000,
    p_brings_own_material := true,
    p_client_request_id := v_req_id
  );
  perform pg_temp.m4_assert(
    'idem_conflict_vehicle_attrs_and_flag',
    (v_second->>'ok') = 'false'
      and (v_second->>'error_code') = 'idempotency_conflict',
    v_second::text
  );

  -- Response must never echo snapshot material.
  perform pg_temp.m4_assert(
    'response_omits_material_keys',
    not (v_second ? 'material')
      and not (v_second ? 'intake_material'),
    v_second::text
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2c) Direct private snapshot access + orphan intake_request_id blocked
-- ---------------------------------------------------------------------------
do $$
declare
  v_org_id uuid;
  v_owner uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_customer_id uuid;
  v_sr_id uuid;
  v_denied boolean := false;
begin
  perform pg_temp.m4_become_postgres();
  select id into v_org_id from public.organizations where slug = 'avtoservis-selan';
  select id into v_customer_id
  from public.customers where organization_id = v_org_id limit 1;

  insert into public.service_requests (
    organization_id, customer_id, status, summary, service_wanted, source, channel
  ) values (
    v_org_id, v_customer_id, 'needs_data', 'Snap gate', 'Snap', 'manual', 'phone'
  ) returning id into v_sr_id;

  perform pg_temp.m4_become_authenticated(v_owner);

  begin
    insert into private.manual_intake_material_snapshots (
      service_request_id, organization_id, intake_request_id, material
    ) values (
      v_sr_id, v_org_id, 'e3e3e3e3-e3e3-43e3-83e3-e3e3e3e3e3e3',
      '{"service_wanted":"Forged"}'::jsonb
    );
  exception
    when insufficient_privilege then
      v_denied := true;
  end;
  perform pg_temp.m4_assert('direct_snapshot_insert_denied', v_denied);

  v_denied := false;
  begin
    perform 1 from private.manual_intake_material_snapshots limit 1;
  exception
    when insufficient_privilege then
      v_denied := true;
  end;
  perform pg_temp.m4_assert('direct_snapshot_select_denied', v_denied);

  -- Orphan idempotency key via authenticated INSERT must fail (column grant revoked).
  v_denied := false;
  begin
    insert into public.service_requests (
      organization_id,
      customer_id,
      status,
      summary,
      service_wanted,
      source,
      channel,
      intake_request_id
    ) values (
      v_org_id,
      v_customer_id,
      'needs_data',
      'Orphan key',
      'Orphan',
      'manual',
      'phone',
      'e4e4e4e4-e4e4-44e4-84e4-e4e4e4e4e4e4'
    );
  exception
    when insufficient_privilege then
      v_denied := true;
  end;
  perform pg_temp.m4_assert('orphan_intake_request_id_insert_denied', v_denied);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2d) Independent idempotency_conflict for EACH of the 19 material fields
--     (normalization-equivalence covered separately in 2b; this mutates one
--     field at a time and asserts zero row mutations).
-- ---------------------------------------------------------------------------
do $$
declare
  v_owner uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_req_id uuid := 'f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1';
  v_first jsonb;
  v_second jsonb;
  v_field text;
  v_sr_before integer;
  v_sr_after integer;
  v_snap_before integer;
  v_snap_after integer;
  v_updated_before timestamptz;
  v_updated_after timestamptz;
  v_wanted_before text;
  v_wanted_after text;
  v_fields text[] := array[
    'service_wanted',
    'problem_description',
    'selected_customer_id',
    'selected_vehicle_id',
    'vin',
    'phone',
    'email',
    'mileage_reported_km',
    'display_name',
    'channel',
    'registration',
    'make',
    'model',
    'year',
    'power_kw',
    'engine',
    'engine_type',
    'fuel',
    'brings_own_material'
  ];
begin
  perform pg_temp.m4_become_authenticated(v_owner);
  perform pg_temp.m4_assert(
    'field_matrix_role_authenticated',
    current_user = 'authenticated',
    current_user
  );

  v_first := public.create_manual_service_request_intake(
    p_display_name := 'Field Matrix',
    p_phone := '041900001',
    p_email := 'field-matrix@test.si',
    p_channel := 'phone',
    p_vin := 'WBAKFIELDMATRIX01',
    p_registration := 'LJGO123',
    p_make := 'Audi',
    p_model := 'A4',
    p_year := 2019,
    p_power_kw := 110,
    p_engine := '2.0',
    p_engine_type := 'DEUA',
    p_fuel := 'diesel',
    p_mileage_reported_km := 90000,
    p_service_wanted := 'Osnova',
    p_problem_description := 'Opis osnova',
    p_brings_own_material := false,
    p_client_request_id := v_req_id
  );
  perform pg_temp.m4_assert(
    'field_matrix_first_ok',
    coalesce((v_first->>'ok')::boolean, false),
    v_first::text
  );

  perform pg_temp.m4_become_postgres();
  select count(*)::integer into v_sr_before
  from public.service_requests where intake_request_id = v_req_id;
  select count(*)::integer into v_snap_before
  from private.manual_intake_material_snapshots where intake_request_id = v_req_id;
  select updated_at, service_wanted into v_updated_before, v_wanted_before
  from public.service_requests where intake_request_id = v_req_id;

  perform pg_temp.m4_become_authenticated(v_owner);

  foreach v_field in array v_fields
  loop
    v_second := case v_field
      when 'service_wanted' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A4', p_year := 2019, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'SPREMENJENO',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_client_request_id := v_req_id)
      when 'problem_description' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A4', p_year := 2019, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'DRUG OPIS', p_brings_own_material := false,
        p_client_request_id := v_req_id)
      when 'selected_customer_id' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A4', p_year := 2019, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_selected_customer_id := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        p_client_request_id := v_req_id)
      when 'selected_vehicle_id' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A4', p_year := 2019, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_selected_vehicle_id := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        p_client_request_id := v_req_id)
      when 'vin' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX99', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A4', p_year := 2019, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_client_request_id := v_req_id)
      when 'phone' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900099', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A4', p_year := 2019, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_client_request_id := v_req_id)
      when 'email' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'other-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A4', p_year := 2019, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_client_request_id := v_req_id)
      when 'mileage_reported_km' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A4', p_year := 2019, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 91000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_client_request_id := v_req_id)
      when 'display_name' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix OTHER', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A4', p_year := 2019, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_client_request_id := v_req_id)
      when 'channel' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'sms', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A4', p_year := 2019, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_client_request_id := v_req_id)
      when 'registration' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'MBXY999',
        p_make := 'Audi', p_model := 'A4', p_year := 2019, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_client_request_id := v_req_id)
      when 'make' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'BMW', p_model := 'A4', p_year := 2019, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_client_request_id := v_req_id)
      when 'model' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A6', p_year := 2019, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_client_request_id := v_req_id)
      when 'year' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A4', p_year := 2020, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_client_request_id := v_req_id)
      when 'power_kw' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A4', p_year := 2019, p_power_kw := 140,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_client_request_id := v_req_id)
      when 'engine' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A4', p_year := 2019, p_power_kw := 110,
        p_engine := '3.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_client_request_id := v_req_id)
      when 'engine_type' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A4', p_year := 2019, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'OTHER', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_client_request_id := v_req_id)
      when 'fuel' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A4', p_year := 2019, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'petrol',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := false,
        p_client_request_id := v_req_id)
      when 'brings_own_material' then public.create_manual_service_request_intake(
        p_display_name := 'Field Matrix', p_phone := '041900001', p_email := 'field-matrix@test.si',
        p_channel := 'phone', p_vin := 'WBAKFIELDMATRIX01', p_registration := 'LJGO123',
        p_make := 'Audi', p_model := 'A4', p_year := 2019, p_power_kw := 110,
        p_engine := '2.0', p_engine_type := 'DEUA', p_fuel := 'diesel',
        p_mileage_reported_km := 90000, p_service_wanted := 'Osnova',
        p_problem_description := 'Opis osnova', p_brings_own_material := true,
        p_client_request_id := v_req_id)
    end;

    -- Idempotency compare runs before selection validation, so a changed
    -- selected_* id yields idempotency_conflict (not selection_conflict).
    perform pg_temp.m4_assert(
      format('field_conflict_%s', v_field),
      (v_second->>'ok') = 'false'
        and (v_second->>'error_code') = 'idempotency_conflict',
      v_second::text
    );
  end loop;

  perform pg_temp.m4_become_postgres();
  select count(*)::integer into v_sr_after
  from public.service_requests where intake_request_id = v_req_id;
  select count(*)::integer into v_snap_after
  from private.manual_intake_material_snapshots where intake_request_id = v_req_id;
  select updated_at, service_wanted into v_updated_after, v_wanted_after
  from public.service_requests where intake_request_id = v_req_id;

  perform pg_temp.m4_assert('field_matrix_no_extra_sr', v_sr_after = v_sr_before and v_sr_before = 1);
  perform pg_temp.m4_assert('field_matrix_no_extra_snap', v_snap_after = v_snap_before and v_snap_before = 1);
  perform pg_temp.m4_assert(
    'field_matrix_no_sr_mutation',
    v_updated_after is not distinct from v_updated_before
      and v_wanted_after is not distinct from v_wanted_before,
    format('updated %s→%s wanted %s→%s', v_updated_before, v_updated_after, v_wanted_before, v_wanted_after)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Conflicting strong identifiers
-- ---------------------------------------------------------------------------
do $$
declare
  v_org_id uuid;
  v_owner uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_result jsonb;
begin
  perform pg_temp.m4_become_postgres();
  select id into v_org_id from public.organizations where slug = 'avtoservis-selan';

  insert into public.customers (organization_id, display_name, phone, email, source)
  values
    (v_org_id, 'Cust A', '041333301', 'a-conflict@test.si', 'manual'),
    (v_org_id, 'Cust B', '041333302', 'b-conflict@test.si', 'manual');

  perform pg_temp.m4_become_authenticated(v_owner);
  v_result := public.create_manual_service_request_intake(
    p_display_name := 'Conflict',
    p_phone := '041333301',
    p_email := 'b-conflict@test.si',
    p_channel := 'phone',
    p_service_wanted := 'Servis',
    p_client_request_id := 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  );

  perform pg_temp.m4_assert(
    'ambiguous_customer_on_split_ids',
    (v_result->>'ok') = 'false'
      and (v_result->>'error_code') = 'ambiguous_customer',
    v_result::text
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Unauthorized: mechanic + cross-tenant outsider (authenticated role)
-- ---------------------------------------------------------------------------
do $$
declare
  v_mechanic uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_outsider uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_result jsonb;
begin
  perform pg_temp.m4_become_authenticated(v_mechanic);
  v_result := public.create_manual_service_request_intake(
    p_display_name := 'Blocked Mechanic',
    p_phone := '041444444',
    p_channel := 'phone',
    p_service_wanted := 'Servis',
    p_client_request_id := '10101010-1010-4010-8010-101010101010'
  );
  perform pg_temp.m4_assert(
    'mechanic_forbidden',
    (v_result->>'ok') = 'false' and (v_result->>'error_code') = 'forbidden',
    v_result::text
  );

  perform pg_temp.m4_become_authenticated(v_outsider);
  v_result := public.create_manual_service_request_intake(
    p_display_name := 'Blocked Outsider',
    p_phone := '041555555',
    p_channel := 'phone',
    p_service_wanted := 'Servis',
    p_client_request_id := '20202020-2020-4020-8020-202020202020'
  );
  perform pg_temp.m4_assert(
    'outsider_forbidden',
    (v_result->>'ok') = 'false' and (v_result->>'error_code') = 'forbidden',
    v_result::text
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4b) Cross-tenant selection: outsider cannot attach Selan customer/vehicle IDs
--     (authenticated outsider; RPC org gate → forbidden before selection checks)
-- ---------------------------------------------------------------------------
do $$
declare
  v_org_id uuid;
  v_outsider uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_owner uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_customer_id uuid;
  v_result jsonb;
begin
  perform pg_temp.m4_become_postgres();
  select id into v_org_id from public.organizations where slug = 'avtoservis-selan';
  insert into public.customers (organization_id, display_name, phone, email, source)
  values (v_org_id, 'Selan Only', '041555501', 'selan-only@test.si', 'manual')
  returning id into v_customer_id;

  perform pg_temp.m4_become_authenticated(v_outsider);
  v_result := public.create_manual_service_request_intake(
    p_display_name := 'Selan Only',
    p_phone := '041555501',
    p_email := 'selan-only@test.si',
    p_channel := 'phone',
    p_service_wanted := 'Servis',
    p_selected_customer_id := v_customer_id,
    p_client_request_id := '21212121-2121-4121-8121-212121212121'
  );
  perform pg_temp.m4_assert(
    'cross_tenant_outsider_forbidden',
    (v_result->>'ok') = 'false' and (v_result->>'error_code') = 'forbidden',
    v_result::text
  );

  -- Control: owner can use the same selection
  perform pg_temp.m4_become_authenticated(v_owner);
  v_result := public.create_manual_service_request_intake(
    p_display_name := 'Selan Only',
    p_phone := '041555501',
    p_email := 'selan-only@test.si',
    p_channel := 'phone',
    p_service_wanted := 'Servis',
    p_selected_customer_id := v_customer_id,
    p_client_request_id := '22222222-2222-4222-8222-222222222222'
  );
  perform pg_temp.m4_assert(
    'same_tenant_owner_ok',
    coalesce((v_result->>'ok')::boolean, false),
    v_result::text
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Archived customer / vehicle
-- ---------------------------------------------------------------------------
do $$
declare
  v_org_id uuid;
  v_owner uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_result jsonb;
begin
  perform pg_temp.m4_become_postgres();
  select id into v_org_id from public.organizations where slug = 'avtoservis-selan';

  insert into public.customers (
    organization_id, display_name, phone, email, source, archived_at
  ) values (
    v_org_id, 'Archived Cust', '041666666', 'arch@test.si', 'manual', now()
  ) returning id into v_customer_id;

  perform pg_temp.m4_become_authenticated(v_owner);
  v_result := public.create_manual_service_request_intake(
    p_display_name := 'Archived Cust',
    p_phone := '041666666',
    p_channel := 'phone',
    p_service_wanted := 'Servis',
    p_client_request_id := '30303030-3030-4030-8030-303030303030'
  );
  perform pg_temp.m4_assert(
    'archived_customer_match',
    (v_result->>'ok') = 'false'
      and (v_result->>'error_code') = 'archived_customer_match',
    v_result::text
  );

  perform pg_temp.m4_become_postgres();
  insert into public.customers (organization_id, display_name, phone, email, source)
  values (v_org_id, 'Active Owner', '041777701', 'active-owner@test.si', 'manual')
  returning id into v_customer_id;

  insert into public.vehicles (
    organization_id, customer_id, vin, make, model, archived_at
  ) values (
    v_org_id, v_customer_id, 'WBAKARCHIVED0001', 'Audi', 'A4', now()
  ) returning id into v_vehicle_id;

  perform pg_temp.m4_become_authenticated(v_owner);
  v_result := public.create_manual_service_request_intake(
    p_display_name := 'Active Owner',
    p_phone := '041777701',
    p_email := 'active-owner@test.si',
    p_channel := 'phone',
    p_vin := 'WBAKARCHIVED0001',
    p_make := 'Audi',
    p_model := 'A4',
    p_service_wanted := 'Servis',
    p_client_request_id := '40404040-4040-4040-8040-404040404040'
  );
  perform pg_temp.m4_assert(
    'archived_vehicle_match',
    (v_result->>'ok') = 'false'
      and (v_result->>'error_code') = 'archived_vehicle_match',
    v_result::text
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Vehicle ownership conflict
-- ---------------------------------------------------------------------------
do $$
declare
  v_org_id uuid;
  v_owner uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_cust_a uuid;
  v_cust_b uuid;
  v_result jsonb;
begin
  perform pg_temp.m4_become_postgres();
  select id into v_org_id from public.organizations where slug = 'avtoservis-selan';

  insert into public.customers (organization_id, display_name, phone, email, source)
  values (v_org_id, 'Owner A', '041888801', 'ownera@test.si', 'manual')
  returning id into v_cust_a;

  insert into public.customers (organization_id, display_name, phone, email, source)
  values (v_org_id, 'Owner B', '041888802', 'ownerb@test.si', 'manual')
  returning id into v_cust_b;

  insert into public.vehicles (organization_id, customer_id, vin, make, model)
  values (v_org_id, v_cust_a, 'WBAKOWNERSHIP001', 'Skoda', 'Octavia');

  perform pg_temp.m4_become_authenticated(v_owner);
  v_result := public.create_manual_service_request_intake(
    p_display_name := 'Owner B',
    p_phone := '041888802',
    p_email := 'ownerb@test.si',
    p_channel := 'phone',
    p_vin := 'WBAKOWNERSHIP001',
    p_make := 'Skoda',
    p_model := 'Octavia',
    p_service_wanted := 'Servis',
    p_selected_customer_id := v_cust_b,
    p_client_request_id := '50505050-5050-4050-8050-505050505050'
  );
  perform pg_temp.m4_assert(
    'vehicle_ownership_conflict',
    (v_result->>'ok') = 'false'
      and (v_result->>'error_code') = 'vehicle_ownership_conflict',
    v_result::text
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Sequential VIN reuse (NOT concurrency — see m4 concurrency runner)
-- ---------------------------------------------------------------------------
do $$
declare
  v_owner uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_r1 jsonb;
  v_r2 jsonb;
  v_vin_count integer;
begin
  perform pg_temp.m4_become_authenticated(v_owner);

  v_r1 := public.create_manual_service_request_intake(
    p_display_name := 'Seq One',
    p_phone := '041999901',
    p_email := 'seq1@test.si',
    p_channel := 'phone',
    p_vin := 'WBAKSEQUENT00001',
    p_make := 'Toyota',
    p_model := 'Corolla',
    p_service_wanted := 'Servis',
    p_client_request_id := '60606060-6060-4060-8060-606060606060'
  );

  v_r2 := public.create_manual_service_request_intake(
    p_display_name := 'Seq One',
    p_phone := '041999901',
    p_email := 'seq1@test.si',
    p_channel := 'phone',
    p_vin := 'WBAKSEQUENT00001',
    p_make := 'Toyota',
    p_model := 'Corolla',
    p_service_wanted := 'Menjava zavor',
    p_client_request_id := '70707070-7070-4070-8070-707070707070'
  );

  perform pg_temp.m4_assert('seq_vin_first_ok', coalesce((v_r1->>'ok')::boolean, false), v_r1::text);
  perform pg_temp.m4_assert('seq_vin_second_ok', coalesce((v_r2->>'ok')::boolean, false), v_r2::text);
  perform pg_temp.m4_assert(
    'seq_vin_reuse_same_vehicle',
    (v_r1->>'vehicle_id') is not null
      and (v_r1->>'vehicle_id') = (v_r2->>'vehicle_id')
  );
  perform pg_temp.m4_assert(
    'seq_vin_second_not_creating_vehicle',
    coalesce((v_r2->>'vehicle_created')::boolean, true) = false
  );

  perform pg_temp.m4_become_postgres();
  select count(*)::integer into v_vin_count
  from public.vehicles v
  join public.organizations o on o.id = v.organization_id
  where o.slug = 'avtoservis-selan'
    and private.normalize_intake_vin(v.vin) = 'WBAKSEQUENT00001';
  perform pg_temp.m4_assert('seq_vin_single_row', v_vin_count = 1, format('count=%s', v_vin_count));
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Direct RPC email validation (authenticated) — cannot bypass app checks
-- ---------------------------------------------------------------------------
do $$
declare
  v_owner uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_result jsonb;
  v_count integer;
begin
  perform pg_temp.m4_become_authenticated(v_owner);

  -- Invalid email alone must fail (must not count as contact / completeness).
  v_result := public.create_manual_service_request_intake(
    p_display_name := 'Bad Email Only',
    p_phone := null,
    p_email := 'not-an-email',
    p_channel := 'phone',
    p_vin := 'WBAKBADMAIL00001',
    p_make := 'Seat',
    p_model := 'Leon',
    p_service_wanted := 'Servis',
    p_client_request_id := '80808080-8080-4080-8080-808080808080'
  );
  perform pg_temp.m4_assert(
    'invalid_email_only_rejected',
    (v_result->>'ok') = 'false'
      and (v_result->>'error_code') = 'validation_failed',
    v_result::text
  );

  -- Invalid email with valid phone must also fail (do not persist junk email).
  v_result := public.create_manual_service_request_intake(
    p_display_name := 'Bad Email With Phone',
    p_phone := '041888800',
    p_email := 'still-bad',
    p_channel := 'phone',
    p_vin := 'WBAKBADMAIL00002',
    p_make := 'Seat',
    p_model := 'Ibiza',
    p_service_wanted := 'Servis',
    p_client_request_id := '81818181-8181-4181-8181-818181818181'
  );
  perform pg_temp.m4_assert(
    'invalid_email_with_phone_rejected',
    (v_result->>'ok') = 'false'
      and (v_result->>'error_code') = 'validation_failed',
    v_result::text
  );

  perform pg_temp.m4_become_postgres();
  select count(*)::integer into v_count
  from public.service_requests
  where intake_request_id in (
    '80808080-8080-4080-8080-808080808080',
    '81818181-8181-4181-8181-818181818181'
  );
  perform pg_temp.m4_assert('invalid_email_no_rows', v_count = 0, format('count=%s', v_count));
end;
$$;

-- ---------------------------------------------------------------------------
-- Summary — discard all fixtures (including ephemeral auth.users)
-- ---------------------------------------------------------------------------
do $$
declare
  v_failed integer;
  v_auth_asserts integer;
begin
  select count(*)::integer into v_failed from pg_temp.m4_assert_log where not ok;
  select count(*)::integer into v_auth_asserts
  from pg_temp.m4_assert_log
  where observed_role = 'authenticated';

  raise notice 'M4 regression asserts: % passed, % failed, % under authenticated',
    (select count(*) from pg_temp.m4_assert_log where ok),
    v_failed,
    v_auth_asserts;

  if v_failed > 0 then
    raise exception 'M4 regression suite failed';
  end if;

  if v_auth_asserts < 1 then
    raise exception 'M4 regression recorded no asserts under role authenticated';
  end if;
end;
$$;

rollback;
