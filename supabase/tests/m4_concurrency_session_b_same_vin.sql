-- Session B: same VIN, different client_request_id (parallel).
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
    p_display_name := 'Conc Vin',
    p_phone := '041700002',
    p_email := 'm4-conc-vin@isolated.test',
    p_channel := 'phone',
    p_vin := 'WBAKCONCRACE0001',
    p_make := 'Opel',
    p_model := 'Astra',
    p_service_wanted := 'Servis VIN-B',
    p_client_request_id := 'c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3'
  );
