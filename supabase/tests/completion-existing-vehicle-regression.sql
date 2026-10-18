-- Disposable native PostgreSQL only; fixture changes always roll back.
-- Load active migrations through contact_policy_and_completion_review, then the
-- completion_existing_customer_vehicle migration. Never run this fixture suite on hosted.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() <> 'selan_completion_isolated'
     or inet_server_addr() <> '127.0.0.1'::inet
     or inet_server_port() <> 55438 then
    raise exception 'REFUSING: isolated completion database on loopback:55438 required';
  end if;
end $$;

do $$
declare
  org uuid := gen_random_uuid(); foreign_org uuid := gen_random_uuid();
  actor uuid := gen_random_uuid(); customer uuid; other_customer uuid;
  foreign_customer uuid; vehicle uuid; another uuid; rid uuid; result jsonb;
  token text; scenario text; before_count integer; after_count integer;
  used_at timestamptz; original_vin text; linked uuid;
begin
  insert into auth.users(id,email) values(actor,'completion-owner@example.test');
  insert into public.organizations(id,name,slug) values
    (org,'Completion isolated QA','completion-isolated'),
    (foreign_org,'Foreign isolated QA','completion-foreign');
  insert into public.organization_memberships(organization_id,profile_id,role)
    values(org,actor,'owner');
  insert into public.customers(organization_id,display_name,email)
    values(org,'Same owner','same-owner@example.test') returning id into customer;
  insert into public.customers(organization_id,display_name,email)
    values(org,'Other owner','other-owner@example.test') returning id into other_customer;
  insert into public.customers(organization_id,display_name,email)
    values(foreign_org,'Foreign owner','foreign-owner@example.test') returning id into foreign_customer;

  foreach scenario in array array['same_owner','shared_plate','other_owner','foreign_org',
      'wrong_make','archived','partial','linked_wrong_vin',
      'invalid_token','expired','revoked','advanced','registration_only','ambiguous_vin'] loop
    token := encode(sha256(scenario::bytea),'hex');
    original_vin := 'QA' || upper(replace(scenario,'_',''));
    vehicle := null;
    insert into public.vehicles(organization_id,customer_id,vin,registration_current,make,model,archived_at)
      values(case when scenario='foreign_org' then foreign_org else org end,
             case when scenario='foreign_org' then foreign_customer
                  when scenario='other_owner' then other_customer else customer end,
             original_vin,'QA SHARED',case when scenario='partial' then null else 'TEST' end,
             case when scenario='partial' then null else 'QA' end,
             case when scenario='archived' then now() else null end)
      returning id into vehicle;
    if scenario in ('shared_plate','registration_only') then
      insert into public.vehicles(organization_id,customer_id,vin,registration_current,make,model)
        values(org,customer,'QAOTHERPLATE'||scenario,'QA SHARED','TEST','QA') returning id into another;
    elsif scenario='ambiguous_vin' then
      -- Simulate corrupt/legacy duplicates ONLY in this guarded disposable DB.
      -- The real unique index normally prevents them; ROLLBACK restores it.
      drop index public.vehicles_organization_id_vin_normalized_unique;
      insert into public.vehicles(organization_id,customer_id,vin,make,model)
        values(org,customer,original_vin,'TEST','QA');
    end if;
    insert into public.service_requests(organization_id,customer_id,vehicle_id,status,summary,source,channel)
      values(org,customer,case when scenario='linked_wrong_vin' then vehicle end,
        case when scenario='advanced' then 'cancelled' else 'needs_data' end,
        'Synthetic completion regression','manual','phone') returning id into rid;
    insert into public.service_request_completion_links(organization_id,service_request_id,
      token_hash,expires_at,created_by_profile_id,revoked_at)
      values(org,rid,token,case when scenario='expired' then now()-interval '1 day'
        else now()+interval '1 day' end,actor,case when scenario='revoked' then now() end);
    select count(*) into before_count from public.vehicles;

    execute 'set local role anon';
    result := public.submit_service_request_completion(
      case when scenario='invalid_token' then repeat('f',64) else token end,
      case when scenario='other_owner' then '099888123' end,null,case when scenario='registration_only' then null when scenario='linked_wrong_vin' then 'QADIFFERENTVIN' else original_vin end,
      case when scenario in ('partial','registration_only') then null when scenario='wrong_make' then 'OTHER' else 'TEST' end,
      case when scenario in ('partial','registration_only') then null else 'QA' end);
    execute 'reset role';
    select vehicle_id into linked from public.service_requests where id=rid;
    select count(*) into after_count from public.vehicles;

    if scenario in ('same_owner','shared_plate') then
      if result->>'completed' is distinct from 'true' or linked is distinct from vehicle
         or after_count<>before_count then raise exception '% failed: %',scenario,result; end if;
      select last_used_at into used_at from public.service_request_completion_links where token_hash=token;
      execute 'set local role anon';
      if public.submit_service_request_completion(token,null,null,'MALICIOUSRETRY','OTHER','OTHER')
         is distinct from result then raise exception 'retry result changed'; end if;
      execute 'reset role';
      if (select last_used_at from public.service_request_completion_links where token_hash=token)
          is distinct from used_at
         or (select count(*) from public.vehicles)<>before_count
         or (select vehicle_id from public.service_requests where id=rid) is distinct from vehicle
         or exists(select 1 from public.service_request_intake_reviews where service_request_id=rid)
         or (select status from public.service_requests where id=rid)<>'new'
        then raise exception 'retry or staff-review gate changed'; end if;
    elsif scenario='partial' then
      if linked is distinct from vehicle or result->>'completed'<>'false'
         or result->'missing_fields' <> '["make","model"]'::jsonb then
        raise exception 'partial VIN link not preserved: %',result; end if;
      execute 'set local role anon';
      result:=public.submit_service_request_completion(token,null,null,original_vin,'TEST','QA');
      execute 'reset role';
      if result->>'completed'<>'true' or (select count(*) from public.vehicles)<>before_count then
        raise exception 'partial continuation duplicated/lost vehicle: %',result; end if;
    elsif scenario='registration_only' then
      if linked is not null or after_count<>before_count or result->>'completed'<>'false' then
        raise exception 'shared registration linked a vehicle without VIN'; end if;
    elsif scenario='foreign_org' then
      -- A different tenant's VIN never leaks or attaches; an org-local record is
      -- allowed by the established tenant-scoped model, with the same request.
      if linked is null or linked=vehicle or after_count<>before_count+1 then
        raise exception 'foreign tenant isolation failed'; end if;
    elsif scenario='linked_wrong_vin' then
      if (select vin from public.vehicles where id=vehicle)<>original_vin
         or not (select attention_needed from public.service_requests where id=rid)
         or after_count<>before_count then raise exception 'VIN mismatch overwrote identity'; end if;
    elsif scenario in ('invalid_token','expired','revoked','advanced') then
      if result <> '{"ok":false}'::jsonb or linked is not null or after_count<>before_count then
        raise exception 'unauthorized/stale token mutation: % %',scenario,result; end if;
    else
      if linked is not null or result->>'completed' is distinct from 'false'
         or not (select attention_needed from public.service_requests where id=rid)
         or after_count<>before_count then raise exception 'unsafe match accepted: % %',scenario,result; end if;
    end if;
    if scenario='other_owner' and (select phone from public.customers where id=customer) is distinct from '099888123' then
      raise exception 'valid partial contact lost on vehicle conflict'; end if;
    raise notice 'PASS % (and retry where applicable)',scenario;
  end loop;

  -- Capability RPC does not confer direct table access or staff permissions.
  execute 'set local role anon';
  begin
    perform 1 from public.vehicles;
    raise exception 'anonymous direct access unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  execute 'set local role authenticated';
  if exists(select 1 from public.vehicles where organization_id=org) then
    raise exception 'unrelated authenticated user bypassed RLS'; end if;
  begin
    update public.service_requests set vehicle_id=vehicle where id=rid;
    if found then raise exception 'unrelated authenticated user changed request'; end if;
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  if not has_function_privilege('anon','public.submit_service_request_completion(text,text,text,text,text,text)','execute')
     or has_function_privilege('anon','public.review_service_request_intake(uuid)','execute') then
    raise exception 'RPC grants changed'; end if;
  raise notice 'PASS anonymous/table and unrelated-user RLS isolation; RPC grants preserved';
end $$;
rollback;
