-- =============================================================================
-- SETUP ONLY - Avtoservis Selan isolated local test DB marker
--
-- PURPOSE
--   Create a durable, DB-side identity token that M3 test scripts require in
--   addition to application_name / URL checks. Tests REFUSE to run if this
--   marker is missing. Direct `psql -f` of regression SQL cannot bypass it.
--
-- REQUIRED BEFORE APPLYING THIS FILE
--   Independently verify the isolated Docker container identity and host-port
--   mapping 55322. On mismatch, refuse install - do not apply this SQL.
--
--   Preferred (gated) install:
--     $env:DATABASE_URL = "postgresql://postgres:...@127.0.0.1:55322/postgres"
--     pwsh -File supabase/tests/Install-IsolatedTestMarker.ps1
--
--   Or verify-only, then apply manually only if verify exits 0:
--     pwsh -File supabase/tests/verify_isolated_docker_target.ps1
--     psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/setup_isolated_test_marker.sql
--
-- SAFETY
--   * Run ONLY against the isolated local test database (loopback, external
--     host-mapped port 55322). Never against production.
--   * This file is intentionally NOT executed by the M3 test runners.
--   * Review the SQL, confirm the Docker gate, then run once per DB.
--
-- VERIFY AFTER SETUP (read-only):
--   select marker from private.avtoservis_isolated_test_marker;
--   -- expect: avtoservis-selan-m3-isolated
--
-- REMOVE (manual, if retiring the test DB):
--   drop table if exists private.avtoservis_isolated_test_marker;
-- =============================================================================

\set ON_ERROR_STOP on

create schema if not exists private;

create table if not exists private.avtoservis_isolated_test_marker (
  marker text primary key
    check (marker = 'avtoservis-selan-m3-isolated')
);

revoke all on table private.avtoservis_isolated_test_marker
  from public, anon, authenticated;

insert into private.avtoservis_isolated_test_marker (marker)
values ('avtoservis-selan-m3-isolated')
on conflict (marker) do nothing;

select marker as installed_marker
from private.avtoservis_isolated_test_marker;
