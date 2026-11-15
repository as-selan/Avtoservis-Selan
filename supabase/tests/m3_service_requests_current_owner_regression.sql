-- =============================================================================
-- M3 regression — current-owner trigger + RLS (single session)
--
-- TARGET ONLY: isolated Avtoservis Selan local test DB.
-- External client port 55322 is enforced by the connection URL / runner (PS1).
-- inet_server_port() is the INTERNAL Postgres port (may differ, e.g. 5432 in
-- Docker) and is logged only — never used as the isolation gate.
--
-- Preconditions (abort before any fixture writes if unmet):
--   * application_name = avtoservis-selan-isolated-m3
--   * private.avtoservis_isolated_test_marker.marker = avtoservis-selan-m3-isolated
--     (independent DB-side identity; see setup_isolated_test_marker.sql —
--      that setup is manual and is NOT created by this script)
--   * M3 tables present
--   * FOR SHARE lock clause in function prosrc after SQL-comment stripping
--
-- Supported execution path (URL loopback + independent Docker identity/port
-- preflight + marker check; never creates the marker):
--   $env:DATABASE_URL = "postgresql://postgres:...@127.0.0.1:55322/postgres"
--   pwsh -File supabase/tests/run-m3-db-regression.ps1
--
-- Direct psql (lacks the independent Docker preflight — not the supported path):
--   psql "postgresql://postgres:...@127.0.0.1:55322/postgres?application_name=avtoservis-selan-isolated-m3" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/m3_service_requests_current_owner_regression.sql
--
-- DO NOT run against production. Does not reset the database or apply migrations.
-- =============================================================================

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- Preflight (read-only; abort before any fixture writes)
-- -----------------------------------------------------------------------------
do $$
declare
  v_app text := current_setting('application_name', true);
  v_internal_port int := inet_server_port();
  v_marker text;
  v_src text;
  v_src_nocomment text;
begin
  if v_app is distinct from 'avtoservis-selan-isolated-m3' then
    raise exception
      'Refusing to run: application_name must be avtoservis-selan-isolated-m3 (session fingerprint). Got "%". Connect via loopback external port 55322 with that application_name. Internal inet_server_port=% (not used as gate).',
      coalesce(v_app, '<null>'),
      coalesce(v_internal_port::text, 'null');
  end if;

  -- Independent DB-side marker (cannot be satisfied by application_name alone).
  if to_regclass('private.avtoservis_isolated_test_marker') is null then
    raise exception
      'Refusing to run: isolated test marker table private.avtoservis_isolated_test_marker is missing. Install it manually via supabase/tests/setup_isolated_test_marker.sql on the isolated local DB only (not run automatically).';
  end if;

  select m.marker
    into v_marker
  from private.avtoservis_isolated_test_marker as m
  where m.marker = 'avtoservis-selan-m3-isolated';

  if v_marker is distinct from 'avtoservis-selan-m3-isolated' then
    raise exception
      'Refusing to run: isolated test marker row avtoservis-selan-m3-isolated not found. Install via supabase/tests/setup_isolated_test_marker.sql on the isolated local DB only.';
  end if;

  if to_regclass('public.customers') is null
     or to_regclass('public.vehicles') is null
     or to_regclass('public.service_requests') is null
     or to_regclass('public.organization_memberships') is null then
    raise exception 'Refusing to run: M3 business tables missing on this database';
  end if;

  begin
    select p.prosrc
      into strict v_src
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'service_requests_require_current_vehicle_customer';
  exception
    when no_data_found then
      raise exception
        'Refusing to run: current-owner trigger function is not installed';
  end;

  -- Comments must not satisfy the check: strip -- and /* */ before matching.
  v_src_nocomment := regexp_replace(v_src, '--[^\n]*', '', 'g');
  v_src_nocomment := regexp_replace(
    v_src_nocomment,
    '/\*([^*]|\*+[^*\/])*\*+/',
    '',
    'ng'
  );

  if v_src_nocomment !~* 'for[[:space:]]+share([[:space:]]*;|[[:space:]]*$|[[:space:]]+of[[:space:]])' then
    raise exception
      'Refusing to run: FOR SHARE lock clause missing from function body (comments do not count)';
  end if;

  raise notice
    'Preflight OK (app %, DB marker %, internal inet_server_port=%, M3 present, FOR SHARE in prosrc)',
    v_app,
    v_marker,
    coalesce(v_internal_port::text, 'null');
end;
$$;

-- -----------------------------------------------------------------------------
-- Owner-check + RLS fixtures
-- Success path: explicit DELETE of this DO's fixtures at the end.
-- Failure path: an unhandled exception aborts and rolls back the entire DO
-- statement, including fixtures created within it (no leftover rows to clean).
-- -----------------------------------------------------------------------------
do $$
declare
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_cust_a uuid := gen_random_uuid();
  v_cust_b uuid := gen_random_uuid();
  v_cust_other uuid := gen_random_uuid();
  v_veh uuid := gen_random_uuid();
  v_veh_other uuid := gen_random_uuid();
  v_req_hist uuid;
  v_req_inc uuid;
  v_req_ok uuid;
  v_req_other uuid;
  v_user_reception uuid := gen_random_uuid();
  v_user_mechanic uuid := gen_random_uuid();
  v_user_other uuid := gen_random_uuid();
  v_cnt bigint;
begin
  -- Nested block: catch assertion failures to reset role before re-raising.
  -- Re-raise still aborts the outer DO and rolls back all fixtures in this DO.
  begin
    -- Auth users (profile via handle_new_user)
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values
      (
        '00000000-0000-0000-0000-000000000000',
        v_user_reception,
        'authenticated', 'authenticated',
        'm3-reception-' || v_user_reception::text || '@example.test',
        crypt('m3-test-not-used', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"full_name":"M3 Reception"}'::jsonb,
        now(), now()
      ),
      (
        '00000000-0000-0000-0000-000000000000',
        v_user_mechanic,
        'authenticated', 'authenticated',
        'm3-mechanic-' || v_user_mechanic::text || '@example.test',
        crypt('m3-test-not-used', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"full_name":"M3 Mechanic"}'::jsonb,
        now(), now()
      ),
      (
        '00000000-0000-0000-0000-000000000000',
        v_user_other,
        'authenticated', 'authenticated',
        'm3-other-' || v_user_other::text || '@example.test',
        crypt('m3-test-not-used', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"full_name":"M3 Other Org Reception"}'::jsonb,
        now(), now()
      );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) values
      (
        gen_random_uuid(), v_user_reception,
        jsonb_build_object('sub', v_user_reception::text, 'email', 'm3-reception@example.test'),
        'email', v_user_reception::text, now(), now(), now()
      ),
      (
        gen_random_uuid(), v_user_mechanic,
        jsonb_build_object('sub', v_user_mechanic::text, 'email', 'm3-mechanic@example.test'),
        'email', v_user_mechanic::text, now(), now(), now()
      ),
      (
        gen_random_uuid(), v_user_other,
        jsonb_build_object('sub', v_user_other::text, 'email', 'm3-other@example.test'),
        'email', v_user_other::text, now(), now(), now()
      );

    insert into public.organizations (id, name, slug) values
      (v_org_a, 'M3 Owner Check Org A', 'm3-owner-a-' || replace(v_org_a::text, '-', '')),
      (v_org_b, 'M3 Owner Check Org B', 'm3-owner-b-' || replace(v_org_b::text, '-', ''));

    insert into public.organization_memberships (
      organization_id, profile_id, role, is_active
    ) values
      (v_org_a, v_user_reception, 'reception', true),
      (v_org_a, v_user_mechanic, 'mechanic', true),
      (v_org_b, v_user_other, 'reception', true);

    insert into public.customers (id, organization_id, display_name, source) values
      (v_cust_a, v_org_a, 'Owner A', 'manual'),
      (v_cust_b, v_org_a, 'Owner B', 'manual'),
      (v_cust_other, v_org_b, 'Other Org Customer', 'manual');

    insert into public.vehicles (id, organization_id, customer_id, registration_current) values
      (v_veh, v_org_a, v_cust_a, 'M3-TEST-1'),
      (v_veh_other, v_org_b, v_cust_other, 'M3-OTHER');

    -- -----------------------------------------------------------------
    -- R1: INSERT matching current owner → OK
    -- -----------------------------------------------------------------
    insert into public.service_requests (
      id, organization_id, customer_id, vehicle_id, summary, source
    ) values (
      gen_random_uuid(), v_org_a, v_cust_a, v_veh, 'R1 match current owner', 'manual'
    )
    returning id into v_req_ok;
    raise notice 'PASS R1: INSERT matching current owner';

    -- -----------------------------------------------------------------
    -- R2: mismatched INSERT → exact SQLSTATE 23514
    -- -----------------------------------------------------------------
    begin
      insert into public.service_requests (
        organization_id, customer_id, vehicle_id, summary, source
      ) values (
        v_org_a, v_cust_b, v_veh, 'R2 mismatch', 'manual'
      );
      raise exception 'FAIL R2: expected SQLSTATE 23514';
    exception
      when sqlstate '23514' then
        raise notice 'PASS R2: mismatched INSERT rejected with 23514';
    end;

    -- -----------------------------------------------------------------
    -- R8: partial nulls skip check
    -- -----------------------------------------------------------------
    insert into public.service_requests (
      id, organization_id, customer_id, vehicle_id, summary, source, status
    ) values (
      gen_random_uuid(), v_org_a, null, v_veh, 'R8 incomplete vehicle only', 'manual', 'needs_data'
    )
    returning id into v_req_inc;

    insert into public.service_requests (
      organization_id, customer_id, vehicle_id, summary, source, status
    ) values (
      v_org_a, v_cust_a, null, 'R8 incomplete customer only', 'manual', 'needs_data'
    );
    raise notice 'PASS R8: partial null attach skipped';

    -- -----------------------------------------------------------------
    -- R3: historical pair survives ownership transfer (status-only UPDATE)
    -- -----------------------------------------------------------------
    insert into public.service_requests (
      id, organization_id, customer_id, vehicle_id, summary, source
    ) values (
      gen_random_uuid(), v_org_a, v_cust_a, v_veh, 'R3 historical pair', 'phone'
    )
    returning id into v_req_hist;

    update public.vehicles
    set customer_id = v_cust_b
    where id = v_veh;

    update public.service_requests
    set status = 'preparing_offer'
    where id = v_req_hist;

    if not exists (
      select 1
      from public.service_requests
      where id = v_req_hist
        and customer_id = v_cust_a
        and vehicle_id = v_veh
        and status = 'preparing_offer'
    ) then
      raise exception 'FAIL R3: historical customer_id rewritten or status not updated';
    end if;
    raise notice 'PASS R3: historical pair preserved after ownership transfer';

    -- -----------------------------------------------------------------
    -- R4a: stale UPDATE attach → exact 23514
    -- -----------------------------------------------------------------
    begin
      update public.service_requests
      set customer_id = v_cust_a
      where id = v_req_inc;
      raise exception 'FAIL R4a: expected SQLSTATE 23514';
    exception
      when sqlstate '23514' then
        raise notice 'PASS R4a: stale attach rejected with 23514';
    end;

    -- -----------------------------------------------------------------
    -- R4b: attach to new current owner → OK
    -- -----------------------------------------------------------------
    update public.service_requests
    set customer_id = v_cust_b
    where id = v_req_inc;

    if not exists (
      select 1
      from public.service_requests
      where id = v_req_inc
        and customer_id = v_cust_b
        and vehicle_id = v_veh
    ) then
      raise exception 'FAIL R4b: attach to new current owner failed';
    end if;
    raise notice 'PASS R4b: UPDATE attach to new current owner';

    -- Other-org request for cross-tenant RLS
    insert into public.service_requests (
      id, organization_id, customer_id, vehicle_id, summary, source
    ) values (
      gen_random_uuid(), v_org_b, v_cust_other, v_veh_other, 'Other org request', 'manual'
    )
    returning id into v_req_other;

    -- -----------------------------------------------------------------
    -- RLS R5: reception in org A can read org A business rows
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claim.sub', v_user_reception::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_user_reception::text, 'role', 'authenticated')::text,
      true
    );
    execute 'set local role authenticated';
    if current_user is distinct from 'authenticated' then
      raise exception
        'FAIL R5: expected current_user=authenticated after role switch, got %',
        current_user;
    end if;

    select count(*) into v_cnt from public.customers where organization_id = v_org_a;
    if v_cnt < 2 then
      raise exception 'FAIL R5: reception should SELECT org A customers (got %)', v_cnt;
    end if;
    select count(*) into v_cnt from public.vehicles where organization_id = v_org_a;
    if v_cnt < 1 then
      raise exception 'FAIL R5: reception should SELECT org A vehicles (got %)', v_cnt;
    end if;
    select count(*) into v_cnt from public.service_requests where organization_id = v_org_a;
    if v_cnt < 1 then
      raise exception 'FAIL R5: reception should SELECT org A service_requests (got %)', v_cnt;
    end if;
    raise notice 'PASS R5: reception can read org A M3 data';

    -- -----------------------------------------------------------------
    -- RLS R6: mechanic has no automatic access to M3 business data
    -- -----------------------------------------------------------------
    execute 'reset role';
    if current_user is distinct from session_user then
      raise exception
        'FAIL R5→R6: role not restored after RESET ROLE (current_user=%, session_user=%)',
        current_user, session_user;
    end if;
    perform set_config('request.jwt.claim.sub', v_user_mechanic::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_user_mechanic::text, 'role', 'authenticated')::text,
      true
    );
    execute 'set local role authenticated';
    if current_user is distinct from 'authenticated' then
      raise exception
        'FAIL R6: expected current_user=authenticated after role switch, got %',
        current_user;
    end if;

    select count(*) into v_cnt from public.customers where organization_id = v_org_a;
    if v_cnt <> 0 then
      raise exception 'FAIL R6: mechanic must not SELECT customers (got %)', v_cnt;
    end if;
    select count(*) into v_cnt from public.vehicles where organization_id = v_org_a;
    if v_cnt <> 0 then
      raise exception 'FAIL R6: mechanic must not SELECT vehicles (got %)', v_cnt;
    end if;
    select count(*) into v_cnt from public.service_requests where organization_id = v_org_a;
    if v_cnt <> 0 then
      raise exception 'FAIL R6: mechanic must not SELECT service_requests (got %)', v_cnt;
    end if;

    -- R6 write: INSERT denied
    begin
      insert into public.customers (organization_id, display_name, source)
      values (v_org_a, 'Mechanic insert blocked', 'manual');
      raise exception 'FAIL R6w: mechanic INSERT customers should be denied';
    exception
      when insufficient_privilege then
        raise notice 'PASS R6w-ins-customers: denied (42501)';
      when others then
        raise exception
          'FAIL R6w-ins-customers: expected SQLSTATE 42501, got % (%)',
          sqlstate, sqlerrm;
    end;

    begin
      insert into public.vehicles (
        organization_id, customer_id, registration_current
      ) values (
        v_org_a, v_cust_a, 'MECH-BLOCK'
      );
      raise exception 'FAIL R6w: mechanic INSERT vehicles should be denied';
    exception
      when insufficient_privilege then
        raise notice 'PASS R6w-ins-vehicles: denied (42501)';
      when others then
        raise exception
          'FAIL R6w-ins-vehicles: expected SQLSTATE 42501, got % (%)',
          sqlstate, sqlerrm;
    end;

    begin
      insert into public.service_requests (
        organization_id, customer_id, vehicle_id, summary, source
      ) values (
        v_org_a, v_cust_b, v_veh, 'Mechanic SR blocked', 'manual'
      );
      raise exception 'FAIL R6w: mechanic INSERT service_requests should be denied';
    exception
      when insufficient_privilege then
        raise notice 'PASS R6w-ins-service_requests: denied (42501)';
      when others then
        raise exception
          'FAIL R6w-ins-service_requests: expected SQLSTATE 42501, got % (%)',
          sqlstate, sqlerrm;
    end;

    -- R6 write: UPDATE affects zero visible rows under RLS
    update public.customers
    set notes = 'mechanic-should-not-write'
    where id = v_cust_a;
    get diagnostics v_cnt = row_count;
    if v_cnt <> 0 then
      raise exception 'FAIL R6w: mechanic UPDATE customers row_count=%', v_cnt;
    end if;

    update public.vehicles
    set notes = 'mechanic-should-not-write'
    where id = v_veh;
    get diagnostics v_cnt = row_count;
    if v_cnt <> 0 then
      raise exception 'FAIL R6w: mechanic UPDATE vehicles row_count=%', v_cnt;
    end if;

    update public.service_requests
    set summary = 'mechanic-should-not-write'
    where id = v_req_ok;
    get diagnostics v_cnt = row_count;
    if v_cnt <> 0 then
      raise exception 'FAIL R6w: mechanic UPDATE service_requests row_count=%', v_cnt;
    end if;

    raise notice 'PASS R6: mechanic cannot SELECT/INSERT/UPDATE M3 business data';

    -- -----------------------------------------------------------------
    -- RLS R7: org B reception cannot read or mutate org A data
    -- -----------------------------------------------------------------
    execute 'reset role';
    if current_user is distinct from session_user then
      raise exception
        'FAIL R6→R7: role not restored after RESET ROLE (current_user=%, session_user=%)',
        current_user, session_user;
    end if;
    perform set_config('request.jwt.claim.sub', v_user_other::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_user_other::text, 'role', 'authenticated')::text,
      true
    );
    execute 'set local role authenticated';
    if current_user is distinct from 'authenticated' then
      raise exception
        'FAIL R7: expected current_user=authenticated after role switch, got %',
        current_user;
    end if;

    select count(*) into v_cnt from public.customers where organization_id = v_org_a;
    if v_cnt <> 0 then
      raise exception 'FAIL R7: cross-org SELECT customers must be empty (got %)', v_cnt;
    end if;
    select count(*) into v_cnt from public.vehicles where id = v_veh;
    if v_cnt <> 0 then
      raise exception 'FAIL R7: cross-org SELECT vehicles must be empty (got %)', v_cnt;
    end if;
    select count(*) into v_cnt from public.service_requests where id = v_req_ok;
    if v_cnt <> 0 then
      raise exception 'FAIL R7: cross-org SELECT service_requests must be empty (got %)', v_cnt;
    end if;

    -- Can still see own org
    select count(*) into v_cnt from public.customers where organization_id = v_org_b;
    if v_cnt < 1 then
      raise exception 'FAIL R7: org B reception should still see own customers';
    end if;

    -- Cross-org writes must not mutate foreign rows
    update public.customers
    set notes = 'cross-org-should-not-write'
    where id = v_cust_a;
    get diagnostics v_cnt = row_count;
    if v_cnt <> 0 then
      raise exception 'FAIL R7w: cross-org UPDATE customers row_count=%', v_cnt;
    end if;

    update public.vehicles
    set notes = 'cross-org-should-not-write'
    where id = v_veh;
    get diagnostics v_cnt = row_count;
    if v_cnt <> 0 then
      raise exception 'FAIL R7w: cross-org UPDATE vehicles row_count=%', v_cnt;
    end if;

    update public.service_requests
    set summary = 'cross-org-should-not-write'
    where id = v_req_ok;
    get diagnostics v_cnt = row_count;
    if v_cnt <> 0 then
      raise exception 'FAIL R7w: cross-org UPDATE service_requests row_count=%', v_cnt;
    end if;

    begin
      insert into public.customers (organization_id, display_name, source)
      values (v_org_a, 'Cross-org insert blocked', 'manual');
      raise exception 'FAIL R7w: cross-org INSERT into org A should be denied';
    exception
      when insufficient_privilege then
        raise notice 'PASS R7w-ins: cross-org INSERT denied (42501)';
      when others then
        raise exception
          'FAIL R7w-ins: expected SQLSTATE 42501, got % (%)',
          sqlstate, sqlerrm;
    end;

    raise notice 'PASS R7: cross-organization read/write denied; own org still visible';

    execute 'reset role';
    if current_user is distinct from session_user then
      raise exception
        'FAIL R7: role not restored after RESET ROLE (current_user=%, session_user=%)',
        current_user, session_user;
    end if;

    -- Verify foreign rows were not mutated while RLS roles were active
    if exists (
      select 1 from public.customers
      where id = v_cust_a and notes = 'mechanic-should-not-write'
    ) or exists (
      select 1 from public.customers
      where id = v_cust_a and notes = 'cross-org-should-not-write'
    ) then
      raise exception 'FAIL R7verify: customer notes were mutated under denied roles';
    end if;
  exception
    when others then
      execute 'reset role';
      -- Unhandled exception rolls back the entire DO (including fixtures above).
      -- Notice is diagnostic only; fixtures will not remain for manual cleanup.
      raise notice
        'FAILURE (DO will roll back fixtures): org_a=%, org_b=%, users=%,%,%',
        v_org_a, v_org_b, v_user_reception, v_user_mechanic, v_user_other;
      raise;
  end;

  -- Success cleanup (only reached when assertions pass; deletes this DO's rows)
  delete from public.service_requests where organization_id in (v_org_a, v_org_b);
  delete from public.vehicles where organization_id in (v_org_a, v_org_b);
  delete from public.customers where organization_id in (v_org_a, v_org_b);
  delete from public.organization_memberships where organization_id in (v_org_a, v_org_b);
  delete from public.organizations where id in (v_org_a, v_org_b);
  delete from auth.identities where user_id in (v_user_reception, v_user_mechanic, v_user_other);
  delete from auth.users where id in (v_user_reception, v_user_mechanic, v_user_other);

  raise notice 'M3 regression finished (R1–R8, R5–R7 with write checks) — fixtures cleaned';
end;
$$;
