-- Assert same-VIN simultaneous requests with distinct client_request_ids.
-- Both succeed; exactly one vehicle; exactly two service_requests.
\ir assert_isolated_test_target.sql

do $$
declare
  v_result_count integer;
  v_ok_count integer;
  v_original_count integer;
  v_vin_count integer;
  v_req_count integer;
  v_sample jsonb;
  v_ids text[];
begin
  select count(*)::integer into v_result_count
  from private.m4_concurrency_session_result;

  if v_result_count <> 2 then
    raise exception
      'same-VIN race: expected 2 session results, got %', v_result_count;
  end if;

  select count(*)::integer into v_ok_count
  from private.m4_concurrency_session_result
  where coalesce((result->>'ok')::boolean, false);

  if v_ok_count <> 2 then
    select result into v_sample
    from private.m4_concurrency_session_result
    where not coalesce((result->>'ok')::boolean, false)
    limit 1;
    raise exception
      'same-VIN race: expected both ok=true, got ok_count=% sample=%',
      v_ok_count, coalesce(v_sample::text, '<none>');
  end if;

  select count(*)::integer into v_original_count
  from private.m4_concurrency_session_result
  where coalesce((result->>'ok')::boolean, false)
    and coalesce((result->>'replayed')::boolean, false) = false;

  if v_original_count <> 2 then
    raise exception
      'same-VIN race: expected two non-replay successes, got %', v_original_count;
  end if;

  select array_agg(result->>'service_request_id' order by session_key)
    into v_ids
  from private.m4_concurrency_session_result;

  if v_ids is null
     or array_length(v_ids, 1) <> 2
     or v_ids[1] is null
     or v_ids[2] is null
     or v_ids[1] = v_ids[2] then
    raise exception
      'same-VIN race: expected two distinct service_request_id values, got %', v_ids;
  end if;

  select count(*)::integer into v_vin_count
  from public.vehicles v
  join public.organizations o on o.id = v.organization_id
  where o.slug = 'avtoservis-selan'
    and private.normalize_intake_vin(v.vin) = 'WBAKCONCRACE0001';

  if v_vin_count <> 1 then
    raise exception
      'same-VIN race: expected 1 vehicle, got %', v_vin_count;
  end if;

  select count(*)::integer into v_req_count
  from public.service_requests
  where intake_request_id in (
    'c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2',
    'c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3'
  );

  if v_req_count <> 2 then
    raise exception
      'same-VIN race: expected 2 service_requests, got %', v_req_count;
  end if;

  raise notice
    'M4 concurrency same-VIN PASS (results=2 ok=2 vehicles=1 requests=2)';
end;
$$;
