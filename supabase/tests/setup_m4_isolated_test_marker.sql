-- =============================================================================
-- M4 — MANUAL setup for an isolated local Supabase / Postgres test target
--
-- Run this ONCE by a human against the disposable local DB only.
-- Runners MUST NOT execute this file automatically.
--
-- M4 uses its own private marker table so it can coexist with M3's marker
-- (setup_isolated_test_marker.sql / private.avtoservis_isolated_test_marker)
-- on the same disposable database without shared rows or overwrites.
--
-- All identity fields below are required. An optional project ref alone is
-- insufficient — runners independently verify marker, database name, port,
-- project ref, and container identity before any suite SQL runs.
--
-- PORT DISTINCTION (do not conflate):
--   expected_port        = PostgreSQL internal listen port from
--                          inet_server_port() (often 5432 inside the container)
--   Docker-published host port / URI port = external mapping used by runners
--                          (often 54322 on the host). Runners compare URI port
--                          to docker inspect HostPort only. The SQL gate
--                          compares inet_server_port() to this marker column.
--   Never store or compare the published host/URI port against inet_server_port().
-- =============================================================================

create schema if not exists private;

create table if not exists private.avtoservis_m4_isolated_test_marker (
  singleton boolean primary key default true check (singleton),
  marker text not null,
  expected_database text not null,
  expected_project_ref text not null,
  expected_port integer not null,
  expected_container_id text not null,
  container_or_host_note text,
  installed_at timestamptz not null default now(),
  constraint avtoservis_m4_isolated_test_marker_nonempty
    check (char_length(btrim(marker)) > 0),
  constraint avtoservis_m4_isolated_test_marker_ref_nonempty
    check (char_length(btrim(expected_project_ref)) > 0),
  constraint avtoservis_m4_isolated_test_marker_container_nonempty
    check (char_length(btrim(expected_container_id)) > 0),
  constraint avtoservis_m4_isolated_test_marker_port_positive
    check (expected_port > 0)
);

-- Upgrade path for earlier draft markers (still operator-only; never auto-run).
alter table private.avtoservis_m4_isolated_test_marker
  add column if not exists expected_port integer;
alter table private.avtoservis_m4_isolated_test_marker
  add column if not exists expected_container_id text;

revoke all on table private.avtoservis_m4_isolated_test_marker from public;
revoke all on table private.avtoservis_m4_isolated_test_marker from anon;
revoke all on table private.avtoservis_m4_isolated_test_marker from authenticated;
-- Intentionally no grants to authenticated — marker is operator-only.

-- Fill EVERY placeholder from the disposable target before running suites:
--   expected_database    = current_database() on that instance (usually "postgres")
--   expected_project_ref = local `supabase status` project-id / ref
--   expected_port        = inet_server_port() (INTERNAL DB port; NOT the host URI port)
--   expected_container_id = docker container id/name OR a unique local host label
insert into private.avtoservis_m4_isolated_test_marker as t (
  singleton,
  marker,
  expected_database,
  expected_project_ref,
  expected_port,
  expected_container_id,
  container_or_host_note
) values (
  true,
  'avtoservis-selan-m4-isolated',
  current_database(),
  'REPLACE_WITH_LOCAL_PROJECT_REF',
  inet_server_port(),
  'REPLACE_WITH_LOCAL_CONTAINER_ID',
  'Set only on disposable local Docker Supabase; never on hosted/prod.'
)
on conflict (singleton) do update
set
  marker = excluded.marker,
  expected_database = excluded.expected_database,
  expected_project_ref = excluded.expected_project_ref,
  expected_port = excluded.expected_port,
  expected_container_id = excluded.expected_container_id,
  container_or_host_note = excluded.container_or_host_note,
  installed_at = now();

do $$
declare
  v_ref text;
  v_container text;
  v_port integer;
begin
  select expected_project_ref, expected_container_id, expected_port
    into v_ref, v_container, v_port
  from private.avtoservis_m4_isolated_test_marker
  where singleton;

  if v_ref is null
     or v_ref like 'REPLACE_%'
     or v_container is null
     or v_container like 'REPLACE_%'
     or v_port is null
     or v_port <= 0 then
    raise exception
      'M4 marker installed with placeholders — edit expected_project_ref, expected_port (inet_server_port / internal), and expected_container_id on the disposable DB before running suites.';
  end if;

  raise notice
    'M4 isolated marker installed: marker=%, database=%, internal_port=%, project_ref=%, container_id=%',
    'avtoservis-selan-m4-isolated',
    current_database(),
    v_port,
    v_ref,
    v_container;
end;
$$;
