-- Disposable Docker database only; verifies direct RPC denial and DB budget.
\set ON_ERROR_STOP on
\ir assert_isolated_test_target.sql
begin;
do $$ begin
  if has_function_privilege('anon',
    'public.create_web_service_request_intake(uuid,text,text,text,text,text,text,text,integer,integer,text,text,text,integer,text,text,boolean)',
    'EXECUTE')
     or has_function_privilege('authenticated',
    'public.create_web_service_request_intake(uuid,text,text,text,text,text,text,text,integer,integer,text,text,text,integer,text,text,boolean)',
    'EXECUTE')
     or not has_function_privilege('service_role',
    'public.create_web_service_request_intake(uuid,text,text,text,text,text,text,text,integer,integer,text,text,text,integer,text,text,boolean)',
    'EXECUTE')
     or has_function_privilege('anon','public.consume_web_intake_budget(text,uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.consume_web_intake_budget(text,uuid)','EXECUTE')
  then raise exception 'Public web intake boundary can be bypassed'; end if;
end $$;
insert into public.service_requests(organization_id,status,summary,source,intake_request_id)
  select o.id,'new','Isolated replay','web_form','92929292-9292-4292-8292-929292929292'
  from public.organizations o where o.slug='avtoservis-selan';
set local role service_role;
do $$ declare v jsonb; i integer; begin
  for i in 1..12 loop
    v := public.consume_web_intake_budget(repeat('a',64),gen_random_uuid());
    if v->>'ok' <> 'true' then raise exception 'Budget rejected allowed request %: %',i,v; end if;
  end loop;
  v := public.consume_web_intake_budget(repeat('a',64),gen_random_uuid());
  if v->>'ok' <> 'false' or v->>'error_code' <> 'limited' then
    raise exception 'Per-client budget did not reject request 13: %',v;
  end if;
  v := public.consume_web_intake_budget(repeat('a',64),'92929292-9292-4292-8292-929292929292');
  if v->>'ok' <> 'true' or v->>'replay' <> 'true' then
    raise exception 'Existing idempotent request failed after budget exhaustion: %',v;
  end if;
end $$;
reset role;
do $$ begin
  if (select attempts from private.web_intake_budgets
      where scope='client_hour' and key_hash=repeat('a',64)) <> 12 then
    raise exception 'Budget counter changed after rejection or replay';
  end if;
end $$;
rollback;
