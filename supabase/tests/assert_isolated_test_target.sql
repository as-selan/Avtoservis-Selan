-- =============================================================================
-- M4 — mandatory isolated-target gate (include / run before any DB suite)
--
-- Refuses execution unless ALL of the following independently match:
--   1) marker = avtoservis-selan-m4-isolated
--   2) current_database() = marker.expected_database
--   3) inet_server_port() = marker.expected_port
--   4) session GUC m4.isolated_project_ref = marker.expected_project_ref
--      (GUC required; optional/empty project ref alone is insufficient)
--   5) session GUC m4.isolated_container_id = marker.expected_container_id
--      (GUC required; identifies the disposable Docker/local instance)
-- =============================================================================

do $$
declare
  v_marker text;
  v_expected_db text;
  v_expected_ref text;
  v_expected_port integer;
  v_expected_container text;
  v_session_ref text;
  v_session_container text;
  v_db text := current_database();
  v_port integer := inet_server_port();
  v_user text := current_user;
begin
  begin
    select
      m.marker,
      m.expected_database,
      m.expected_project_ref,
      m.expected_port,
      m.expected_container_id
      into
        v_marker,
        v_expected_db,
        v_expected_ref,
        v_expected_port,
        v_expected_container
    from private.avtoservis_isolated_test_marker as m
    where m.singleton;
  exception
    when undefined_table then
      raise exception
        'REFUSING M4 DB TESTS: private.avtoservis_isolated_test_marker missing. Apply supabase/tests/setup_isolated_test_marker.sql manually on the disposable local DB only.';
    when undefined_column then
      raise exception
        'REFUSING M4 DB TESTS: marker table is missing required identity columns (expected_port / expected_container_id). Re-apply setup_isolated_test_marker.sql on the disposable DB.';
  end;

  if v_marker is distinct from 'avtoservis-selan-m4-isolated' then
    raise exception
      'REFUSING M4 DB TESTS: marker % is not avtoservis-selan-m4-isolated',
      coalesce(v_marker, '<null>');
  end if;

  if v_expected_db is null or char_length(btrim(v_expected_db)) = 0 then
    raise exception 'REFUSING M4 DB TESTS: marker.expected_database is missing';
  end if;

  if v_db is distinct from v_expected_db then
    raise exception
      'REFUSING M4 DB TESTS: connected to database % but marker expects %',
      v_db,
      v_expected_db;
  end if;

  if v_expected_port is null or v_expected_port <= 0 then
    raise exception 'REFUSING M4 DB TESTS: marker.expected_port is missing or invalid';
  end if;

  if v_port is null then
    raise exception
      'REFUSING M4 DB TESTS: inet_server_port() is null (cannot verify local port identity)';
  end if;

  if v_port is distinct from v_expected_port then
    raise exception
      'REFUSING M4 DB TESTS: connected port % but marker expects %',
      v_port,
      v_expected_port;
  end if;

  if v_expected_ref is null
     or char_length(btrim(v_expected_ref)) = 0
     or v_expected_ref like 'REPLACE_%' then
    raise exception
      'REFUSING M4 DB TESTS: marker.expected_project_ref must be a real disposable project id (not empty/placeholder)';
  end if;

  v_session_ref := nullif(current_setting('m4.isolated_project_ref', true), '');
  if v_session_ref is null then
    raise exception
      'REFUSING M4 DB TESTS: session GUC m4.isolated_project_ref is required (set by runner from M4_ISOLATED_PROJECT_REF)';
  end if;

  if v_session_ref is distinct from v_expected_ref then
    raise exception
      'REFUSING M4 DB TESTS: project ref % does not match marker %',
      v_session_ref,
      v_expected_ref;
  end if;

  if v_expected_container is null
     or char_length(btrim(v_expected_container)) = 0
     or v_expected_container like 'REPLACE_%' then
    raise exception
      'REFUSING M4 DB TESTS: marker.expected_container_id must be a real disposable container/host id (not empty/placeholder)';
  end if;

  v_session_container := nullif(current_setting('m4.isolated_container_id', true), '');
  if v_session_container is null then
    raise exception
      'REFUSING M4 DB TESTS: session GUC m4.isolated_container_id is required (set by runner from M4_ISOLATED_CONTAINER_ID)';
  end if;

  if v_session_container is distinct from v_expected_container then
    raise exception
      'REFUSING M4 DB TESTS: container id % does not match marker %',
      v_session_container,
      v_expected_container;
  end if;

  -- Soft signal only: superuser bypasses RLS; suites must SET ROLE authenticated.
  if v_user in ('postgres', 'supabase_admin') then
    raise notice
      'M4 gate OK (marker/db/port/ref/container). Connected as % — suite must SET ROLE authenticated for RLS cases.',
      v_user;
  else
    raise notice
      'M4 isolated gate OK: db=% port=% marker=% project_ref=% container=% user=%',
      v_db, v_port, v_marker, v_session_ref, v_session_container, v_user;
  end if;
end;
$$;
