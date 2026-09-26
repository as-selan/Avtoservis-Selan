-- M4 concurrency setup — ephemeral fixtures with fixed UUIDs for two-session races.
-- Must run only after assert_isolated_test_target.sql via run-m4-db-concurrency.ps1.
-- Cleanup: m4_concurrency_cleanup.sql (always).

\ir assert_isolated_test_target.sql

begin;

create table if not exists private.m4_concurrency_run (
  singleton boolean primary key default true check (singleton),
  run_id uuid not null,
  owner_id uuid not null,
  started_at timestamptz not null default now()
);

revoke all on table private.m4_concurrency_run from public, anon, authenticated;

-- Cross-session JSON result sink (authenticated INSERT only; verify as privileged).
create table if not exists private.m4_concurrency_session_result (
  id bigserial primary key,
  session_key text not null,
  result jsonb not null,
  observed_at timestamptz not null default now()
);

revoke all on table private.m4_concurrency_session_result from public, anon, authenticated;
grant insert on table private.m4_concurrency_session_result to authenticated;
grant usage, select on sequence private.m4_concurrency_session_result_id_seq to authenticated;

truncate table private.m4_concurrency_session_result;

do $$
declare
  v_org_id uuid;
  v_owner uuid := 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0';
  v_run uuid := 'b0b0b0b0-b0b0-40b0-80b0-b0b0b0b0b0b0';
  v_instance uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_owner, v_instance, 'authenticated', 'authenticated',
    'm4-conc-owner@isolated.test', crypt('unused', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  )
  on conflict (id) do nothing;

  insert into public.profiles (id, full_name, email)
  values (v_owner, 'M4 Conc Owner', 'm4-conc-owner@isolated.test')
  on conflict (id) do nothing;

  select id into v_org_id from public.organizations where slug = 'avtoservis-selan';
  if v_org_id is null then
    insert into public.organizations (name, slug, timezone)
    values ('Avtoservis Selan', 'avtoservis-selan', 'Europe/Ljubljana')
    returning id into v_org_id;
  end if;

  insert into public.organization_memberships (organization_id, profile_id, role, is_active)
  values (v_org_id, v_owner, 'owner', true)
  on conflict (organization_id, profile_id) do update
    set role = excluded.role, is_active = true;

  insert into private.m4_concurrency_run (singleton, run_id, owner_id)
  values (true, v_run, v_owner)
  on conflict (singleton) do update
    set run_id = excluded.run_id, owner_id = excluded.owner_id, started_at = now();
end;
$$;

commit;
