-- Session A: same-VIN race (distinct client_request_id).
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
  'a',
  public.create_manual_service_request_intake(
    p_display_name := 'Conc Vin',
    p_phone := '041700002',
    p_email := 'm4-conc-vin@isolated.test',
    p_channel := 'phone',
    p_vin := 'WBAKCONCRACE0001',
    p_make := 'Opel',
    p_model := 'Astra',
    p_service_wanted := 'Servis VIN-A',
    p_client_request_id := 'c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2'
  );
