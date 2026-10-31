-- The public web intake RPC must not be callable with the publishable key.
-- Only the server route may use its server-only service role credential.
revoke execute on function public.create_web_service_request_intake(
  uuid, text, text, text, text, text, text, text, integer, integer,
  text, text, text, integer, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.create_web_service_request_intake(
  uuid, text, text, text, text, text, text, text, integer, integer,
  text, text, text, integer, text, text, boolean
) to service_role;

-- Privacy-preserving, bounded counters. The application sends only a keyed
-- SHA-256 digest of the client address; raw addresses are never stored here.
create table private.web_intake_budgets (
  scope text not null check (scope in ('client_hour','global_hour','global_day')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  attempts integer not null check (attempts between 1 and 300),
  primary key (scope,key_hash,window_start)
);
create index web_intake_budgets_window_start_idx
  on private.web_intake_budgets(window_start);
revoke all on private.web_intake_budgets from public,anon,authenticated;

create or replace function public.consume_web_intake_budget(
  p_client_hash text, p_client_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org_id uuid; v_hour timestamptz := date_trunc('hour',pg_catalog.now());
  v_day timestamptz := date_trunc('day',pg_catalog.now());
  v_global text := repeat('0',64);
  v_client_count integer; v_hour_count integer; v_day_count integer;
begin
  if p_client_hash is null or p_client_hash !~ '^[0-9a-f]{64}$'
     or p_client_request_id is null then
    return jsonb_build_object('ok',false,'error_code','invalid');
  end if;
  v_org_id := private.resolve_web_intake_org();
  if v_org_id is null then
    return jsonb_build_object('ok',false,'error_code','unavailable');
  end if;
  perform pg_advisory_xact_lock(910021,hashtext(v_org_id::text));
  -- A genuine retry of a request already persisted is harmless and must keep
  -- the existing idempotent response even after the budget is exhausted.
  if exists (select 1 from public.service_requests sr
    where sr.organization_id=v_org_id and sr.intake_request_id=p_client_request_id
      and sr.source='web_form') then
    return jsonb_build_object('ok',true,'replay',true);
  end if;
  select attempts into v_client_count from private.web_intake_budgets
    where scope='client_hour' and key_hash=p_client_hash and window_start=v_hour;
  select attempts into v_hour_count from private.web_intake_budgets
    where scope='global_hour' and key_hash=v_global and window_start=v_hour;
  select attempts into v_day_count from private.web_intake_budgets
    where scope='global_day' and key_hash=v_global and window_start=v_day;
  if coalesce(v_client_count,0)>=12 or coalesce(v_hour_count,0)>=60
     or coalesce(v_day_count,0)>=300 then
    return jsonb_build_object('ok',false,'error_code','limited');
  end if;
  insert into private.web_intake_budgets(scope,key_hash,window_start,attempts)
    values('client_hour',p_client_hash,v_hour,1)
    on conflict(scope,key_hash,window_start) do update
      set attempts=web_intake_budgets.attempts+1;
  insert into private.web_intake_budgets(scope,key_hash,window_start,attempts)
    values('global_hour',v_global,v_hour,1)
    on conflict(scope,key_hash,window_start) do update
      set attempts=web_intake_budgets.attempts+1;
  insert into private.web_intake_budgets(scope,key_hash,window_start,attempts)
    values('global_day',v_global,v_day,1)
    on conflict(scope,key_hash,window_start) do update
      set attempts=web_intake_budgets.attempts+1;
  delete from private.web_intake_budgets
    where window_start < pg_catalog.now()-interval '30 days';
  return jsonb_build_object('ok',true,'replay',false);
end;
$$;
revoke all on function public.consume_web_intake_budget(text,uuid)
  from public,anon,authenticated;
grant execute on function public.consume_web_intake_budget(text,uuid)
  to service_role;
