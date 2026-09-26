-- Assert identical simultaneous client_request_id race.
-- Both sessions must succeed; exactly one original write; exactly one row.
\ir assert_isolated_test_target.sql

do $$
declare
  v_result_count integer;
  v_ok_count integer;
  v_original_count integer;
  v_replayed_count integer;
  v_row_count integer;
  v_sample jsonb;
begin
  select count(*)::integer into v_result_count
  from private.m4_concurrency_session_result;

  if v_result_count <> 2 then
    raise exception
      'identical race: expected 2 session results, got %', v_result_count;
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
      'identical race: expected both ok=true, got ok_count=% sample=%',
      v_ok_count, coalesce(v_sample::text, '<none>');
  end if;

  select count(*)::integer into v_original_count
  from private.m4_concurrency_session_result
  where coalesce((result->>'ok')::boolean, false)
    and coalesce((result->>'replayed')::boolean, false) = false;

  select count(*)::integer into v_replayed_count
  from private.m4_concurrency_session_result
  where coalesce((result->>'ok')::boolean, false)
    and coalesce((result->>'replayed')::boolean, false) = true;

  if v_original_count <> 1 or v_replayed_count <> 1 then
    raise exception
      'identical race: expected exactly one original write and one replay (original=% replayed=%)',
      v_original_count, v_replayed_count;
  end if;

  select count(*)::integer into v_row_count
  from public.service_requests
  where intake_request_id = 'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1';

  if v_row_count <> 1 then
    raise exception
      'identical race: expected exactly 1 service_request row, got %', v_row_count;
  end if;

  raise notice
    'M4 concurrency identical PASS (results=2 original=1 replayed=1 rows=1)';
end;
$$;
