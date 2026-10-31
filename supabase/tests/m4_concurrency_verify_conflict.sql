-- Assert conflicting simultaneous client_request_id race.
-- Exactly one success and one idempotency_conflict; exactly one row.
\ir assert_isolated_test_target.sql

do $$
declare
  v_result_count integer;
  v_ok_count integer;
  v_conflict_count integer;
  v_row_count integer;
  v_wanted text;
  v_sample jsonb;
begin
  select count(*)::integer into v_result_count
  from private.m4_concurrency_session_result;

  if v_result_count <> 2 then
    raise exception
      'conflict race: expected 2 session results, got %', v_result_count;
  end if;

  select count(*)::integer into v_ok_count
  from private.m4_concurrency_session_result
  where coalesce((result->>'ok')::boolean, false);

  select count(*)::integer into v_conflict_count
  from private.m4_concurrency_session_result
  where coalesce((result->>'ok')::boolean, true) = false
    and result->>'error_code' = 'idempotency_conflict';

  if v_ok_count <> 1 or v_conflict_count <> 1 then
    select result into v_sample
    from private.m4_concurrency_session_result
    order by id
    limit 1;
    raise exception
      'conflict race: expected exactly one success and one idempotency_conflict (ok=% conflict=% sample=%)',
      v_ok_count, v_conflict_count, coalesce(v_sample::text, '<none>');
  end if;

  select count(*)::integer into v_row_count
  from public.service_requests
  where intake_request_id = 'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1';

  if v_row_count <> 1 then
    raise exception
      'conflict race: expected exactly 1 service_request row, got %', v_row_count;
  end if;

  select service_wanted into v_wanted
  from public.service_requests
  where intake_request_id = 'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1';

  if v_wanted is distinct from 'Servis A'
     and v_wanted is distinct from 'Servis B DIFFERENT' then
    raise exception
      'conflict race: unexpected service_wanted %', v_wanted;
  end if;

  raise notice
    'M4 concurrency conflict PASS (ok=1 conflict=1 rows=1 wanted=%)', v_wanted;
end;
$$;
