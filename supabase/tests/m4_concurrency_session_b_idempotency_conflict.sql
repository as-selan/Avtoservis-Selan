-- Session B: same client_request_id as session A but DIFFERENT material (parallel).
\ir assert_isolated_test_target.sql

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0',
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text,
  false
);
select set_config('request.jwt.claim.sub', 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set role authenticated;

insert into private.m4_concurrency_session_result (session_key, result)
select
  'b',
  public.create_manual_service_request_intake(
    p_display_name := 'Conc Idem',
    p_phone := '041700001',
    p_email := 'm4-conc-idem@isolated.test',
    p_channel := 'phone',
    p_vin := 'WBAKCONCIDEM0001',
    p_make := 'Ford',
    p_model := 'Focus',
    p_service_wanted := 'Servis B DIFFERENT',
    p_client_request_id := 'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1'
  );
