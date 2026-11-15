-- Forward-only; hosted application requires explicit approval.
-- Keep web completeness strict and select manual policy from immutable persisted provenance.
create or replace function private.compute_intake_completeness(
  p_phone text,
  p_email text,
  p_vin text,
  p_make text,
  p_model text
)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_missing text[] := '{}';
begin
  if p_phone is null or btrim(p_phone) = '' then
    v_missing := array_append(v_missing, 'phone');
  end if;
  if p_email is null or btrim(p_email) = '' then
    v_missing := array_append(v_missing, 'email');
  end if;
  if p_vin is null or btrim(p_vin) = '' then
    v_missing := array_append(v_missing, 'vin');
  end if;
  if p_make is null or btrim(p_make) = '' then
    v_missing := array_append(v_missing, 'make');
  end if;
  if p_model is null or btrim(p_model) = '' then
    v_missing := array_append(v_missing, 'model');
  end if;

  if coalesce(array_length(v_missing, 1), 0) = 0 then
    return jsonb_build_object(
      'status', 'new',
      'missing_fields', '[]'::jsonb,
      'next_action', 'Preveri podatke pred pripravo ponudbe.'
    );
  end if;

  return jsonb_build_object(
    'status', 'needs_data',
    'missing_fields', to_jsonb(v_missing),
    'next_action', 'Pridobi manjkajoče podatke stranke ali vozila.'
  );
end;
$$;

create or replace function private.compute_manual_intake_completeness(
  p_phone text,
  p_email text,
  p_vin text,
  p_make text,
  p_model text
)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_missing text[] := '{}';
begin
  if nullif(btrim(p_phone), '') is null and nullif(btrim(p_email), '') is null then
    v_missing := array_append(v_missing, 'phone');
  end if;
  if nullif(btrim(p_phone), '') is null and nullif(btrim(p_email), '') is null then
    v_missing := array_append(v_missing, 'email');
  end if;
  if p_vin is null or btrim(p_vin) = '' then
    v_missing := array_append(v_missing, 'vin');
  end if;
  if p_make is null or btrim(p_make) = '' then
    v_missing := array_append(v_missing, 'make');
  end if;
  if p_model is null or btrim(p_model) = '' then
    v_missing := array_append(v_missing, 'model');
  end if;

  if coalesce(array_length(v_missing, 1), 0) = 0 then
    return jsonb_build_object(
      'status', 'new',
      'missing_fields', '[]'::jsonb,
      'next_action', 'Preveri podatke pred pripravo ponudbe.'
    );
  end if;

  return jsonb_build_object(
    'status', 'needs_data',
    'missing_fields', to_jsonb(v_missing),
    'next_action', 'Pridobi manjkajoče podatke stranke ali vozila.'
  );
end;
$$;

create or replace function private.compute_request_intake_completeness(
  p_request_id uuid, p_phone text, p_email text, p_vin text, p_make text, p_model text
) returns jsonb language sql stable set search_path = '' as $$
  select case when exists (select 1 from public.service_requests sr
    where sr.id = p_request_id and sr.source = 'manual' and sr.channel in ('manual','phone','sms'))
    then private.compute_manual_intake_completeness(p_phone,p_email,p_vin,p_make,p_model)
    else private.compute_intake_completeness(p_phone,p_email,p_vin,p_make,p_model) end;
$$;
revoke all on function private.compute_request_intake_completeness(uuid,text,text,text,text,text) from public,anon,authenticated;

create or replace function private.guard_intake_provenance()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.source is distinct from old.source or new.channel is distinct from old.channel then
    raise exception 'intake source and channel are immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_intake_provenance() from public,anon,authenticated;
create trigger service_requests_guard_intake_provenance before update of source,channel
  on public.service_requests for each row execute function private.guard_intake_provenance();

create or replace function public.resolve_service_request_completion(
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.service_request_completion_links%rowtype;
  v_phone text;
  v_email text;
  v_vin text;
  v_make text;
  v_model text;
  v_comp jsonb;
  v_request_status text;
  v_request_archived timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return private.completion_public_unavailable();
  end if;

  perform pg_advisory_xact_lock(
    910006,
    hashtext(p_token_hash)
  );

  select l.*
    into v_link
  from public.service_request_completion_links as l
  where l.token_hash = p_token_hash;

  if not found then
    return private.completion_public_unavailable();
  end if;

  -- Completed-token retry: read-only completed success (no last_used_at write).
  if v_link.completed_at is not null then
    return private.completion_public_ok(true, '[]'::jsonb);
  end if;

  if v_link.revoked_at is not null
     or v_link.expires_at <= pg_catalog.now() then
    return private.completion_public_unavailable();
  end if;

  -- Active (non-completed) links are only usable while the request remains
  -- needs_data and unarchived. Do not leak the current status publicly.
  select
    sr.status,
    sr.archived_at,
    private.normalize_intake_phone(c.phone),
    private.normalize_intake_email(c.email),
    private.normalize_intake_vin(v.vin),
    nullif(btrim(v.make), ''),
    nullif(btrim(v.model), '')
    into
      v_request_status,
      v_request_archived,
      v_phone,
      v_email,
      v_vin,
      v_make,
      v_model
  from public.service_requests as sr
  left join public.customers as c
    on c.organization_id = sr.organization_id
   and c.id = sr.customer_id
  left join public.vehicles as v
    on v.organization_id = sr.organization_id
   and v.id = sr.vehicle_id
  where sr.organization_id = v_link.organization_id
    and sr.id = v_link.service_request_id;

  if not found
     or v_request_archived is not null
     or v_request_status is distinct from 'needs_data' then
    return private.completion_public_unavailable();
  end if;

  v_comp := private.compute_request_intake_completeness(
    v_link.service_request_id,
    v_phone,
    v_email,
    v_vin,
    v_make,
    v_model
  );

  -- last_used_at only for valid ACTIVE, NON-COMPLETED resolve.
  update public.service_request_completion_links as l
  set last_used_at = pg_catalog.now()
  where l.id = v_link.id
    and l.completed_at is null
    and l.revoked_at is null
    and l.expires_at > pg_catalog.now();

  return private.completion_public_ok(
    false,
    coalesce(v_comp -> 'missing_fields', '[]'::jsonb)
  );
end;
$$;

create or replace function public.submit_service_request_completion(
  p_token_hash text,
  p_phone text default null,
  p_email text default null,
  p_vin text default null,
  p_make text default null,
  p_model text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.service_request_completion_links%rowtype;
  v_org_id uuid;
  v_request_id uuid;
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_archived timestamptz;
  v_phone_in text;
  v_email_in text;
  v_vin_in text;
  v_make_in text;
  v_model_in text;
  v_existing_phone text;
  v_existing_email text;
  v_existing_vin text;
  v_existing_make text;
  v_existing_model text;
  v_phone_store text;
  v_email_store text;
  v_attention boolean := false;
  v_vin_other uuid;
  v_vehicle_owner_id uuid;
  v_new_vehicle_id uuid;
  v_comp jsonb;
  v_status text;
  v_locked_status text;
  v_missing text[];
  v_next_action text;
  v_lock_phone text;
  v_lock_email text;
  v_lock_vin text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return private.completion_public_unavailable();
  end if;

  if char_length(coalesce(p_phone, '')) > 40
     or char_length(coalesce(p_email, '')) > 254
     or char_length(coalesce(p_vin, '')) > 32
     or char_length(coalesce(p_make, '')) > 100
     or char_length(coalesce(p_model, '')) > 100 then
    return private.completion_public_unavailable();
  end if;

  v_phone_in := private.normalize_intake_phone(p_phone);
  v_email_in := private.normalize_intake_email(p_email);
  if nullif(btrim(p_email), '') is not null
     and (
       v_email_in is null
       or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     ) then
    return private.completion_public_unavailable();
  end if;
  v_vin_in := private.normalize_intake_vin(p_vin);
  v_make_in := nullif(btrim(p_make), '');
  v_model_in := nullif(btrim(p_model), '');
  v_phone_store := nullif(btrim(p_phone), '');
  v_email_store := nullif(btrim(p_email), '');

  -- Token serialization BEFORE request + identity locks.
  perform pg_advisory_xact_lock(
    910006,
    hashtext(p_token_hash)
  );

  select l.*
    into v_link
  from public.service_request_completion_links as l
  where l.token_hash = p_token_hash;

  if not found then
    return private.completion_public_unavailable();
  end if;

  -- Completed-link retry: generic successful completed state, no further mutation.
  -- Read-only: do not update last_used_at (or any other column).
  if v_link.completed_at is not null then
    return private.completion_public_ok(true, '[]'::jsonb);
  end if;

  if v_link.revoked_at is not null
     or v_link.expires_at <= pg_catalog.now() then
    return private.completion_public_unavailable();
  end if;

  v_org_id := v_link.organization_id;
  v_request_id := v_link.service_request_id;

  perform pg_advisory_xact_lock(
    910005,
    hashtext(v_org_id::text || chr(31) || v_request_id::text)
  );

  -- Re-read link after request lock (regeneration may have revoked it).
  select l.*
    into v_link
  from public.service_request_completion_links as l
  where l.id = v_link.id;

  if v_link.completed_at is not null then
    return private.completion_public_ok(true, '[]'::jsonb);
  end if;
  if v_link.revoked_at is not null
     or v_link.expires_at <= pg_catalog.now() then
    return private.completion_public_unavailable();
  end if;

  -- Lock the linked request and require CURRENT status still needs_data.
  -- Stale links must not mutate/reopen cancelled/declined/closed/converted/
  -- preparing_offer/advanced requests.
  select sr.customer_id, sr.vehicle_id, sr.archived_at, sr.status
    into v_customer_id, v_vehicle_id, v_archived, v_locked_status
  from public.service_requests as sr
  where sr.organization_id = v_org_id
    and sr.id = v_request_id
  for update;

  if not found
     or v_archived is not null
     or v_customer_id is null
     or v_locked_status is distinct from 'needs_data' then
    return private.completion_public_unavailable();
  end if;

  select
    private.normalize_intake_phone(c.phone),
    private.normalize_intake_email(c.email)
    into v_existing_phone, v_existing_email
  from public.customers as c
  where c.organization_id = v_org_id
    and c.id = v_customer_id;

  if not found then
    return private.completion_public_unavailable();
  end if;

  if v_vehicle_id is not null then
    select
      private.normalize_intake_vin(v.vin),
      nullif(btrim(v.make), ''),
      nullif(btrim(v.model), '')
      into v_existing_vin, v_existing_make, v_existing_model
    from public.vehicles as v
    where v.organization_id = v_org_id
      and v.id = v_vehicle_id;
  end if;

  v_lock_phone := coalesce(v_phone_in, v_existing_phone);
  v_lock_email := coalesce(v_email_in, v_existing_email);
  v_lock_vin := coalesce(v_vin_in, v_existing_vin);

  if v_lock_phone is not null then
    perform pg_advisory_xact_lock(
      910001,
      hashtext(v_org_id::text || chr(31) || v_lock_phone)
    );
  end if;
  if v_lock_email is not null then
    perform pg_advisory_xact_lock(
      910002,
      hashtext(v_org_id::text || chr(31) || v_lock_email)
    );
  end if;
  if v_lock_vin is not null then
    perform pg_advisory_xact_lock(
      910003,
      hashtext(v_org_id::text || chr(31) || v_lock_vin)
    );
  end if;

  -- Row locks: customer before vehicle.
  perform 1
  from public.customers as c
  where c.organization_id = v_org_id
    and c.id = v_customer_id
  for update;

  if v_vehicle_id is not null then
    perform 1
    from public.vehicles as v
    where v.organization_id = v_org_id
      and v.id = v_vehicle_id
    for update;
  end if;

  -- Re-read authoritative persisted values after locks.
  select
    sr.customer_id,
    sr.vehicle_id
    into v_customer_id, v_vehicle_id
  from public.service_requests as sr
  where sr.organization_id = v_org_id
    and sr.id = v_request_id;

  select
    private.normalize_intake_phone(c.phone),
    private.normalize_intake_email(c.email),
    c.phone,
    c.email
    into v_existing_phone, v_existing_email, v_phone_store, v_email_store
  from public.customers as c
  where c.organization_id = v_org_id
    and c.id = v_customer_id;

  -- Restore submitted stores (re-read overwrote store variables).
  v_phone_store := nullif(btrim(p_phone), '');
  v_email_store := nullif(btrim(p_email), '');

  select
    private.normalize_intake_phone(c.phone),
    private.normalize_intake_email(c.email)
    into v_existing_phone, v_existing_email
  from public.customers as c
  where c.organization_id = v_org_id
    and c.id = v_customer_id;

  if v_vehicle_id is not null then
    select
      private.normalize_intake_vin(v.vin),
      nullif(btrim(v.make), ''),
      nullif(btrim(v.model), '')
      into v_existing_vin, v_existing_make, v_existing_model
    from public.vehicles as v
    where v.organization_id = v_org_id
      and v.id = v_vehicle_id;
  else
    v_existing_vin := null;
    v_existing_make := null;
    v_existing_model := null;
  end if;

  -- Customer mutation: NULL fill / equal no-op / different → attention, no overwrite.
  -- Never merge customers or change organization_id.
  if v_phone_in is not null then
    if v_existing_phone is null then
      update public.customers as c
      set phone = v_phone_store
      where c.organization_id = v_org_id
        and c.id = v_customer_id
        and c.phone is null;
    elsif v_existing_phone is distinct from v_phone_in then
      v_attention := true;
    end if;
  end if;

  if v_email_in is not null then
    if v_existing_email is null then
      update public.customers as c
      set email = v_email_store
      where c.organization_id = v_org_id
        and c.id = v_customer_id
        and c.email is null;
    elsif v_existing_email is distinct from v_email_in then
      v_attention := true;
    end if;
  end if;

  -- Vehicle mutation on the linked vehicle only (no ownership transfer).
  -- If the vehicle's CURRENT customer differs from the request customer, do not
  -- mutate that vehicle (historical request pair after a sale/transfer).
  if v_vehicle_id is not null then
    select v.customer_id
      into v_vehicle_owner_id
    from public.vehicles as v
    where v.organization_id = v_org_id
      and v.id = v_vehicle_id;

    if v_vehicle_owner_id is distinct from v_customer_id then
      v_attention := true;
    else
      if v_vin_in is not null then
        if v_existing_vin is null then
          select v.id
            into v_vin_other
          from public.vehicles as v
          where v.organization_id = v_org_id
            and private.normalize_intake_vin(v.vin) = v_vin_in
            and v.id is distinct from v_vehicle_id
          limit 1;
          if v_vin_other is not null then
            v_attention := true;
          else
            begin
              update public.vehicles as v
              set vin = v_vin_in
              where v.organization_id = v_org_id
                and v.id = v_vehicle_id
                and v.customer_id = v_customer_id
                and v.vin is null;
            exception
              when unique_violation then
                v_attention := true;
            end;
          end if;
        elsif v_existing_vin is distinct from v_vin_in then
          v_attention := true;
        end if;
      end if;

      if v_make_in is not null then
        if v_existing_make is null then
          update public.vehicles as v
          set make = v_make_in
          where v.organization_id = v_org_id
            and v.id = v_vehicle_id
            and v.customer_id = v_customer_id
            and nullif(btrim(v.make), '') is null;
        elsif v_existing_make is distinct from v_make_in then
          v_attention := true;
        end if;
      end if;

      if v_model_in is not null then
        if v_existing_model is null then
          update public.vehicles as v
          set model = v_model_in
          where v.organization_id = v_org_id
            and v.id = v_vehicle_id
            and v.customer_id = v_customer_id
            and nullif(btrim(v.model), '') is null;
        elsif v_existing_model is distinct from v_model_in then
          v_attention := true;
        end if;
      end if;
    end if;
  elsif v_vin_in is not null or v_make_in is not null or v_model_in is not null then
    -- No vehicle yet: create a NEW vehicle under the request's existing customer.
    -- Do not attach another customer's vehicle. VIN conflict → attention, no create.
    v_vin_other := null;
    if v_vin_in is not null then
      select v.id
        into v_vin_other
      from public.vehicles as v
      where v.organization_id = v_org_id
        and private.normalize_intake_vin(v.vin) = v_vin_in
      limit 1;
    end if;

    if v_vin_other is not null then
      v_attention := true;
    else
      begin
        insert into public.vehicles (
          organization_id,
          customer_id,
          vin,
          make,
          model
        ) values (
          v_org_id,
          v_customer_id,
          v_vin_in,
          v_make_in,
          v_model_in
        )
        returning id into v_new_vehicle_id;

        -- Attach to the SAME service_request. Never INSERT a second service_request.
        update public.service_requests as sr
        set vehicle_id = v_new_vehicle_id
        where sr.organization_id = v_org_id
          and sr.id = v_request_id
          and sr.vehicle_id is null;

        v_vehicle_id := v_new_vehicle_id;
      exception
        when unique_violation then
          v_attention := true;
      end;
    end if;
  end if;

  -- Server-authoritative completeness from persisted customer + vehicle.
  select
    private.normalize_intake_phone(c.phone),
    private.normalize_intake_email(c.email)
    into v_existing_phone, v_existing_email
  from public.customers as c
  where c.organization_id = v_org_id
    and c.id = v_customer_id;

  select sr.vehicle_id
    into v_vehicle_id
  from public.service_requests as sr
  where sr.organization_id = v_org_id
    and sr.id = v_request_id;

  if v_vehicle_id is not null then
    select
      private.normalize_intake_vin(v.vin),
      nullif(btrim(v.make), ''),
      nullif(btrim(v.model), '')
      into v_existing_vin, v_existing_make, v_existing_model
    from public.vehicles as v
    where v.organization_id = v_org_id
      and v.id = v_vehicle_id;
  else
    v_existing_vin := null;
    v_existing_make := null;
    v_existing_model := null;
  end if;

  v_comp := private.compute_request_intake_completeness(
    v_request_id,
    v_existing_phone,
    v_existing_email,
    v_existing_vin,
    v_existing_make,
    v_existing_model
  );

  if coalesce(jsonb_array_length(v_comp -> 'missing_fields'), 0) = 0 then
    v_status := 'new';
    v_missing := '{}';
    v_next_action := 'Tadej naj preveri podatke pred pripravo ponudbe.';
  else
    v_status := 'needs_data';
    select array(select jsonb_array_elements_text(v_comp -> 'missing_fields'))
      into v_missing;
    v_next_action := 'Pridobi manjkajoče podatke stranke ali vozila.';
  end if;

  update public.service_requests as sr
  set
    status = v_status,
    missing_fields = v_missing,
    next_action = v_next_action,
    attention_needed = sr.attention_needed or v_attention,
    attention_reason = case
      when v_attention then
        'Preveri podatke iz dopolnitve spletnega povpraševanja.'
      else sr.attention_reason
    end
    -- Identity conflict is attention, not has_error. Do not clear prior system errors.
  where sr.organization_id = v_org_id
    and sr.id = v_request_id;

  if v_status = 'new' then
    update public.service_request_completion_links as l
    set
      completed_at = pg_catalog.now(),
      last_used_at = pg_catalog.now()
    where l.id = v_link.id
      and l.completed_at is null;
    return private.completion_public_ok(true, '[]'::jsonb);
  end if;

  update public.service_request_completion_links as l
  set last_used_at = pg_catalog.now()
  where l.id = v_link.id;

  return private.completion_public_ok(
    false,
    coalesce(v_comp -> 'missing_fields', '[]'::jsonb)
  );
end;
$$;

create or replace function public.review_service_request_intake(p_service_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_org uuid := private.resolve_manual_intake_org();
  v_request public.service_requests%rowtype;
  v_customer public.customers%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_completeness jsonb;
begin
  if v_actor is null or v_org is null or p_service_request_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden_or_invalid');
  end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = v_org and m.profile_id = v_actor and m.is_active
      and m.role in ('owner','admin')
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'owner_required');
  end if;
  perform pg_advisory_xact_lock(910015, hashtext(v_org::text || chr(31) || p_service_request_id::text));
  select * into v_request from public.service_requests sr
    where sr.organization_id = v_org and sr.id = p_service_request_id
      and sr.archived_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'not_found'); end if;
  if v_request.status = 'preparing_offer' and exists (
    select 1 from public.service_request_intake_reviews r
    where r.organization_id = v_org and r.service_request_id = p_service_request_id
  ) then
    return jsonb_build_object('ok', true, 'idempotent', true, 'status', 'preparing_offer');
  end if;
  if v_request.status <> 'new' then
    return jsonb_build_object('ok', false, 'error_code', 'stage_changed');
  end if;
  if v_request.customer_id is null or v_request.vehicle_id is null
     or exists (
       select 1 from public.preliminary_inspections i
       where i.organization_id = v_org and i.service_request_id = p_service_request_id
         and (i.status <> 'completed' or i.repair_decision = 'not_ordered')
     ) then
    return jsonb_build_object('ok', false, 'error_code', 'incomplete_data');
  end if;
  select * into v_customer from public.customers c
    where c.organization_id = v_org and c.id = v_request.customer_id
      and c.archived_at is null;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'incomplete_data'); end if;
  select * into v_vehicle from public.vehicles v
    where v.organization_id = v_org and v.id = v_request.vehicle_id
      and v.customer_id = v_customer.id and v.archived_at is null;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'incomplete_data'); end if;
  v_completeness := private.compute_request_intake_completeness(
    p_service_request_id,
    v_customer.phone, v_customer.email, v_vehicle.vin, v_vehicle.make, v_vehicle.model
  );
  if coalesce(jsonb_array_length(v_completeness -> 'missing_fields'), 0) > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'incomplete_data');
  end if;
  insert into public.service_request_intake_reviews
    (organization_id, service_request_id, reviewed_by_profile_id)
    values (v_org, p_service_request_id, v_actor);
  update public.service_requests set status = 'preparing_offer', missing_fields = '{}',
    next_action = 'Pripravi ponudbo za pregled.'
    where organization_id = v_org and id = p_service_request_id;
  return jsonb_build_object('ok', true, 'idempotent', false, 'status', 'preparing_offer');
end;
$$;

create or replace function private.guard_reviewed_intake_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from 'preparing_offer' and new.status = 'preparing_offer'
     and not exists (
       select 1 from public.service_request_intake_reviews r
       where r.organization_id = new.organization_id and r.service_request_id = new.id
     ) then
    raise exception 'case requires explicit staff intake review' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.prepare_service_request_offer(
  p_service_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org_id uuid;
  v_status text;
  v_archived timestamptz;
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_phone text;
  v_email text;
  v_customer_archived timestamptz;
  v_vin text;
  v_make text;
  v_model text;
  v_vehicle_archived timestamptz;
  v_comp jsonb;
  v_prep_id uuid;
  v_prep_status text;
begin
  v_org_id := private.resolve_manual_intake_org();
  if v_uid is null or v_org_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  if p_service_request_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  perform pg_advisory_xact_lock(
    910007,
    hashtext(v_org_id::text || chr(31) || p_service_request_id::text)
  );

  select sr.status, sr.archived_at, sr.customer_id, sr.vehicle_id
    into v_status, v_archived, v_customer_id, v_vehicle_id
  from public.service_requests as sr
  where sr.organization_id = v_org_id
    and sr.id = p_service_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  if v_archived is not null then
    return jsonb_build_object('ok', false, 'error_code', 'archived');
  end if;

  -- Re-check authoritative locked status in this transaction.
  -- Stale actions for needs_data / cancelled / declined / closed / converted /
  -- awaiting_customer_approval / appointment_confirmed / any other status fail closed.
  if v_status is distinct from 'preparing_offer' then
    return jsonb_build_object('ok', false, 'error_code', 'not_preparing_offer');
  end if;

  if not exists (select 1 from public.service_request_intake_reviews r
    where r.organization_id = v_org_id and r.service_request_id = p_service_request_id) then
    return jsonb_build_object('ok', false, 'error_code', 'intake_review_required');
  end if;

  -- preparing_offer is necessary but not sufficient: canonical V1 completeness
  -- (phone, email, VIN, make, model) must still hold. No new Quibi fields.
  -- Fail closed. Do not INSERT, do not change next_action/status, do not
  -- mutate customer/vehicle, do not return missing values/PII.
  if v_customer_id is null or v_vehicle_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'incomplete_data');
  end if;

  -- Canonical rows must stay stable through completeness + INSERT.
  -- FOR SHARE blocks concurrent UPDATE/DELETE; this RPC does not mutate them.
  select c.phone, c.email, c.archived_at
    into v_phone, v_email, v_customer_archived
  from public.customers as c
  where c.organization_id = v_org_id
    and c.id = v_customer_id
  for share;

  if not found or v_customer_archived is not null then
    return jsonb_build_object('ok', false, 'error_code', 'incomplete_data');
  end if;

  select v.vin, v.make, v.model, v.archived_at
    into v_vin, v_make, v_model, v_vehicle_archived
  from public.vehicles as v
  where v.organization_id = v_org_id
    and v.id = v_vehicle_id
    and v.customer_id = v_customer_id
  for share;

  if not found or v_vehicle_archived is not null then
    return jsonb_build_object('ok', false, 'error_code', 'incomplete_data');
  end if;

  v_comp := private.compute_request_intake_completeness(
    p_service_request_id,
    v_phone,
    v_email,
    v_vin,
    v_make,
    v_model
  );

  if coalesce(jsonb_array_length(v_comp -> 'missing_fields'), 0) > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'incomplete_data');
  end if;

  insert into public.offer_preparations (
    organization_id,
    service_request_id,
    status,
    created_by_profile_id,
    prepared_at
  ) values (
    v_org_id,
    p_service_request_id,
    'ready_for_provider',
    v_uid,
    pg_catalog.now()
  )
  on conflict on constraint offer_preparations_request_unique
  do nothing;

  select p.id, p.status
    into v_prep_id, v_prep_status
  from public.offer_preparations as p
  where p.organization_id = v_org_id
    and p.service_request_id = p_service_request_id;

  -- Internal staff hint only. MUST NOT change service_requests.status
  -- (no awaiting_customer_approval, no send, no appointment).
  update public.service_requests as sr
  set next_action = 'Podatki za ponudbo so pripravljeni.'
  where sr.organization_id = v_org_id
    and sr.id = p_service_request_id
    and sr.status = 'preparing_offer'
    and sr.archived_at is null
    and sr.next_action is distinct from 'Podatki za ponudbo so pripravljeni.';

  return jsonb_build_object(
    'ok', true,
    'offer_preparation_id', v_prep_id,
    'status', v_prep_status,
    'service_request_status', 'preparing_offer'
  );
end;
$$;

-- Recompute incomplete cases without fabricating contacts or staff approval.
-- Existing complete cases return to new; completion remains idempotent on the same request.
with current_completeness as (
  select sr.id, private.compute_request_intake_completeness(sr.id,c.phone,c.email,v.vin,v.make,v.model) as comp
  from public.service_requests sr
  join public.customers c on c.id=sr.customer_id and c.organization_id=sr.organization_id and c.archived_at is null
  left join public.vehicles v on v.id=sr.vehicle_id and v.organization_id=sr.organization_id
    and v.customer_id=c.id and v.archived_at is null
  where sr.status='needs_data' and sr.archived_at is null
)
update public.service_requests sr set
  missing_fields=array(select jsonb_array_elements_text(cc.comp->'missing_fields')),
  status=cc.comp->>'status', next_action=cc.comp->>'next_action'
from current_completeness cc where sr.id=cc.id;

-- Public web RPC requires BOTH contacts; source/channel stay fixed inside the RPC.
create or replace function public.create_web_service_request_intake(
  p_client_request_id uuid,
  p_display_name text,
  p_phone text default null,
  p_email text default null,
  p_vin text default null,
  p_registration text default null,
  p_make text default null,
  p_model text default null,
  p_year integer default null,
  p_power_kw integer default null,
  p_engine text default null,
  p_engine_type text default null,
  p_fuel text default null,
  p_mileage_reported_km integer default null,
  p_service_wanted text default null,
  p_problem_description text default null,
  p_brings_own_material boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_display_name text;
  v_phone text;
  v_email text;
  v_phone_store text;
  v_vin text;
  v_reg_match text;
  v_reg_store text;
  v_make text;
  v_model text;
  v_engine text;
  v_engine_type text;
  v_fuel text;
  v_service_wanted text;
  v_problem_description text;
  v_summary text;
  v_completeness jsonb;
  v_status text;
  v_missing jsonb;
  v_next_action text;

  v_customer public.customers%rowtype;
  v_vehicle public.vehicles%rowtype;

  v_phone_ids uuid[];
  v_email_ids uuid[];
  v_auto_customer_id uuid;
  v_auto_customer_archived boolean;
  v_vin_vehicle public.vehicles%rowtype;
  v_reg_vehicle_ids uuid[];
  v_auto_vehicle_id uuid;
  v_auto_vehicle_archived boolean;
  v_auto_vehicle_customer_id uuid;

  v_customer_id uuid;
  v_vehicle_id uuid;
  v_create_vehicle boolean;
  v_existing_phone text;
  v_existing_email text;
  v_existing_vin text;
  v_existing_reg text;
  v_comp_make text;
  v_comp_model text;
  v_replay_id uuid;
  v_identity_quarantine boolean := false;
  v_vin_store text;
  v_vehicle_notes text;
  v_vin_match_count integer := 0;
  v_attention_reason text;
begin
  if p_client_request_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;

  v_org_id := private.resolve_web_intake_org();
  if v_org_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'intake_unavailable');
  end if;

  -- Reject oversized raw payloads before normalize (abuse bound).
  if char_length(coalesce(p_display_name, '')) > 200
     or char_length(coalesce(p_phone, '')) > 40
     or char_length(coalesce(p_email, '')) > 254
     or char_length(coalesce(p_vin, '')) > 32
     or char_length(coalesce(p_registration, '')) > 40
     or char_length(coalesce(p_make, '')) > 100
     or char_length(coalesce(p_model, '')) > 100
     or char_length(coalesce(p_engine, '')) > 100
     or char_length(coalesce(p_engine_type, '')) > 100
     or char_length(coalesce(p_fuel, '')) > 32
     or char_length(coalesce(p_service_wanted, '')) > 200
     or char_length(coalesce(p_problem_description, '')) > 4000 then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;

  v_display_name := nullif(btrim(p_display_name), '');
  v_phone_store := nullif(btrim(p_phone), '');
  v_phone := private.normalize_intake_phone(p_phone);
  v_email := private.normalize_intake_email(p_email);
  -- Authoritative even for direct anon RPC. Mirrors TS /^[^\s@]+@[^\s@]+\.[^\s@]+$/.
  -- Blank email is allowed when phone is present; supplied malformed email is not.
  if nullif(btrim(p_email), '') is not null
     and (
       v_email is null
       or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     ) then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;
  v_vin := private.normalize_intake_vin(p_vin);
  v_reg_store := nullif(btrim(p_registration), '');
  v_reg_match := private.normalize_intake_registration(p_registration);
  v_make := nullif(btrim(p_make), '');
  v_model := nullif(btrim(p_model), '');
  v_engine := nullif(btrim(p_engine), '');
  v_engine_type := nullif(btrim(p_engine_type), '');
  v_fuel := nullif(btrim(p_fuel), '');
  v_service_wanted := nullif(btrim(p_service_wanted), '');
  v_problem_description := nullif(btrim(p_problem_description), '');

  if v_display_name is null then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;
  if v_phone is null or v_email is null then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;
  if v_service_wanted is null and v_problem_description is null then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;
  if p_year is not null and (p_year < 1886 or p_year > 2100) then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;
  if p_mileage_reported_km is not null and p_mileage_reported_km < 0 then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;
  if p_power_kw is not null and p_power_kw <= 0 then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;
  if v_fuel is not null and v_fuel not in (
    'petrol', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric',
    'lpg', 'cng', 'hydrogen', 'other'
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;

  -- 0) Idempotency lock BEFORE identity locks (same namespace as M4)
  perform pg_advisory_xact_lock(
    910000,
    hashtext(v_org_id::text || E'\x1f' || p_client_request_id::text)
  );

  select sr.id
    into v_replay_id
  from public.service_requests as sr
  where sr.organization_id = v_org_id
    and sr.intake_request_id = p_client_request_id;

  if found then
    return jsonb_build_object('ok', true);
  end if;

  -- Identity locks (ordered — compatible with M4)
  if v_phone is not null then
    perform pg_advisory_xact_lock(
      910001,
      hashtext(v_org_id::text || E'\x1f' || v_phone)
    );
  end if;
  if v_email is not null then
    perform pg_advisory_xact_lock(
      910002,
      hashtext(v_org_id::text || E'\x1f' || v_email)
    );
  end if;
  if v_vin is not null then
    perform pg_advisory_xact_lock(
      910003,
      hashtext(v_org_id::text || E'\x1f' || v_vin)
    );
  end if;
  if v_reg_match is not null then
    perform pg_advisory_xact_lock(
      910004,
      hashtext(v_org_id::text || E'\x1f' || v_reg_match)
    );
  end if;

  -- Re-read authoritative candidates AFTER locks
  if v_phone is not null then
    select coalesce(array_agg(c.id), '{}')
      into v_phone_ids
    from public.customers as c
    where c.organization_id = v_org_id
      and private.normalize_intake_phone(c.phone) = v_phone;
  else
    v_phone_ids := '{}';
  end if;

  if v_email is not null then
    select coalesce(array_agg(c.id), '{}')
      into v_email_ids
    from public.customers as c
    where c.organization_id = v_org_id
      and private.normalize_intake_email(c.email) = v_email;
  else
    v_email_ids := '{}';
  end if;

  if coalesce(array_length(v_phone_ids, 1), 0) > 1
     or coalesce(array_length(v_email_ids, 1), 0) > 1 then
    -- Ambiguous customer identifiers: do not reuse; quarantine after locks.
    v_identity_quarantine := true;
  elsif coalesce(array_length(v_phone_ids, 1), 0) = 1
     and coalesce(array_length(v_email_ids, 1), 0) = 1
     and v_phone_ids[1] is distinct from v_email_ids[1] then
    v_identity_quarantine := true;
  elsif coalesce(array_length(v_phone_ids, 1), 0) = 1 then
    v_auto_customer_id := v_phone_ids[1];
  elsif coalesce(array_length(v_email_ids, 1), 0) = 1 then
    v_auto_customer_id := v_email_ids[1];
  else
    v_auto_customer_id := null;
  end if;

  if v_identity_quarantine then
    v_auto_customer_id := null;
  end if;

  if v_auto_customer_id is not null then
    select (c.archived_at is not null)
      into v_auto_customer_archived
    from public.customers as c
    where c.id = v_auto_customer_id;

    if coalesce(v_auto_customer_archived, true) then
      v_identity_quarantine := true;
      v_auto_customer_id := null;
    end if;
  end if;

  if v_vin is not null then
    select count(*)::integer
      into v_vin_match_count
    from public.vehicles as v
    where v.organization_id = v_org_id
      and private.normalize_intake_vin(v.vin) = v_vin;

    if v_vin_match_count > 1 then
      v_identity_quarantine := true;
    elsif v_vin_match_count = 1 then
      select *
        into v_vin_vehicle
      from public.vehicles as v
      where v.organization_id = v_org_id
        and private.normalize_intake_vin(v.vin) = v_vin;

      if found then
        v_auto_vehicle_id := v_vin_vehicle.id;
        v_auto_vehicle_archived := v_vin_vehicle.archived_at is not null;
        v_auto_vehicle_customer_id := v_vin_vehicle.customer_id;
      end if;
    end if;
  end if;

  if v_reg_match is not null then
    select coalesce(array_agg(v.id), '{}')
      into v_reg_vehicle_ids
    from public.vehicles as v
    where v.organization_id = v_org_id
      and private.normalize_intake_registration(v.registration_current) = v_reg_match;

    if coalesce(array_length(v_reg_vehicle_ids, 1), 0) > 1 then
      v_identity_quarantine := true;
      if v_auto_vehicle_id is not null then
        v_auto_vehicle_id := null;
        v_auto_vehicle_archived := null;
        v_auto_vehicle_customer_id := null;
      end if;
    elsif coalesce(array_length(v_reg_vehicle_ids, 1), 0) = 1 then
      if v_auto_vehicle_id is not null
         and v_auto_vehicle_id is distinct from v_reg_vehicle_ids[1] then
        v_identity_quarantine := true;
        v_auto_vehicle_id := null;
        v_auto_vehicle_archived := null;
        v_auto_vehicle_customer_id := null;
      elsif v_auto_vehicle_id is null then
        select
          v.id,
          v.archived_at is not null,
          v.customer_id
        into
          v_auto_vehicle_id,
          v_auto_vehicle_archived,
          v_auto_vehicle_customer_id
        from public.vehicles as v
        where v.id = v_reg_vehicle_ids[1];
      end if;
    end if;
  end if;

  if v_auto_vehicle_id is not null and v_auto_vehicle_archived then
    v_identity_quarantine := true;
    v_auto_vehicle_id := null;
  end if;

  v_customer_id := v_auto_customer_id;
  v_vehicle_id := v_auto_vehicle_id;

  if v_vehicle_id is not null and v_customer_id is null then
    v_identity_quarantine := true;
    v_vehicle_id := null;
  end if;
  if v_vehicle_id is not null
     and v_auto_vehicle_customer_id is not null
     and v_auto_vehicle_customer_id is distinct from v_customer_id then
    v_identity_quarantine := true;
    v_vehicle_id := null;
  end if;

  if v_customer_id is not null then
    select *
      into v_customer
    from public.customers as c
    where c.id = v_customer_id
    for update;

    if not found
       or v_customer.organization_id is distinct from v_org_id
       or v_customer.archived_at is not null then
      v_identity_quarantine := true;
      v_customer_id := null;
      v_vehicle_id := null;
    else
      v_existing_phone := private.normalize_intake_phone(v_customer.phone);
      v_existing_email := private.normalize_intake_email(v_customer.email);

      -- Anonymous intake must not NULL-fill existing customer identity.
      -- Submitted phone/email must already equal persisted values, or be omitted.
      if (
           v_phone is not null
           and (
             v_existing_phone is null
             or v_existing_phone is distinct from v_phone
           )
         )
         or (
           v_email is not null
           and (
             v_existing_email is null
             or v_existing_email is distinct from v_email
           )
         ) then
        v_identity_quarantine := true;
        v_customer_id := null;
        v_vehicle_id := null;
      end if;
    end if;
  end if;

  if v_vehicle_id is not null then
    select *
      into v_vehicle
    from public.vehicles as v
    where v.id = v_vehicle_id
    for update;

    if not found
       or v_vehicle.organization_id is distinct from v_org_id
       or v_vehicle.archived_at is not null
       or v_vehicle.customer_id is distinct from v_customer_id then
      v_identity_quarantine := true;
      v_vehicle_id := null;
    else
      v_existing_vin := private.normalize_intake_vin(v_vehicle.vin);
      v_existing_reg := private.normalize_intake_registration(v_vehicle.registration_current);

      -- Anonymous intake must not NULL-fill existing VIN/registration.
      if (
           v_vin is not null
           and (
             v_existing_vin is null
             or v_existing_vin is distinct from v_vin
           )
         )
         or (
           v_reg_match is not null
           and (
             v_existing_reg is null
             or v_existing_reg is distinct from v_reg_match
           )
         ) then
        v_identity_quarantine := true;
        v_vehicle_id := null;
      end if;
    end if;
  end if;

  -- Structured VIN only when it is not already on a vehicle we will not reuse.
  v_vin_store := v_vin;
  v_vehicle_notes := null;
  if v_vehicle_id is null and v_vin is not null and v_vin_match_count >= 1 then
    v_vin_store := null;
    v_vehicle_notes :=
      'Nepotrjen VIN iz spletnega povpraševanja: ' || v_vin;
    v_identity_quarantine := true;
  end if;

  if v_customer_id is null then
    insert into public.customers (
      organization_id,
      customer_type,
      display_name,
      phone,
      email,
      source
    ) values (
      v_org_id,
      'individual',
      v_display_name,
      v_phone_store,
      v_email,
      'web_form'
    )
    returning id into v_customer_id;
  end if;
  -- Reused existing customers are never updated (no public phone/email NULL-fill).

  v_create_vehicle :=
    v_vehicle_id is null
    and (
      v_vin_store is not null
      or v_vehicle_notes is not null
      or v_reg_store is not null
      or (v_make is not null and v_model is not null)
    );

  if v_create_vehicle then
    begin
      insert into public.vehicles (
        organization_id,
        customer_id,
        registration_current,
        vin,
        make,
        model,
        year,
        power_kw,
        engine,
        engine_type,
        fuel,
        notes,
        mileage_latest_km,
        mileage_latest_recorded_at
      ) values (
        v_org_id,
        v_customer_id,
        v_reg_store,
        v_vin_store,
        v_make,
        v_model,
        p_year,
        p_power_kw,
        v_engine,
        v_engine_type,
        v_fuel,
        v_vehicle_notes,
        p_mileage_reported_km,
        case when p_mileage_reported_km is not null then now() else null end
      )
      returning id into v_vehicle_id;
    exception
      when unique_violation then
        -- Org VIN unique: never leak existence. Persist without structured VIN.
        v_identity_quarantine := true;
        v_vin_store := null;
        if v_vin is not null then
          v_vehicle_notes :=
            'Nepotrjen VIN iz spletnega povpraševanja: ' || v_vin;
        end if;
        insert into public.vehicles (
          organization_id,
          customer_id,
          registration_current,
          vin,
          make,
          model,
          year,
          power_kw,
          engine,
          engine_type,
          fuel,
          notes,
          mileage_latest_km,
          mileage_latest_recorded_at
        ) values (
          v_org_id,
          v_customer_id,
          v_reg_store,
          null,
          v_make,
          v_model,
          p_year,
          p_power_kw,
          v_engine,
          v_engine_type,
          v_fuel,
          v_vehicle_notes,
          p_mileage_reported_km,
          case when p_mileage_reported_km is not null then now() else null end
        )
        returning id into v_vehicle_id;
    end;
  elsif v_vehicle_id is not null then
    update public.vehicles as v
    set
      make = case
        when v.make is null and v_make is not null then v_make
        else v.make
      end,
      model = case
        when v.model is null and v_model is not null then v_model
        else v.model
      end,
      year = case
        when v.year is null and p_year is not null then p_year
        else v.year
      end,
      power_kw = case
        when v.power_kw is null and p_power_kw is not null then p_power_kw
        else v.power_kw
      end,
      engine = case
        when v.engine is null and v_engine is not null then v_engine
        else v.engine
      end,
      engine_type = case
        when v.engine_type is null and v_engine_type is not null then v_engine_type
        else v.engine_type
      end,
      fuel = case
        when v.fuel is null and v_fuel is not null then v_fuel
        else v.fuel
      end
      -- VIN, registration_current, mileage_latest_km, and
      -- mileage_latest_recorded_at are never assigned on an existing vehicle.
      -- Reported mileage belongs on service_requests.mileage_reported_km.
    where v.id = v_vehicle_id;
  end if;

  v_summary := coalesce(v_service_wanted, v_problem_description);

  select
    private.normalize_intake_phone(c.phone),
    private.normalize_intake_email(c.email)
  into v_existing_phone, v_existing_email
  from public.customers as c
  where c.id = v_customer_id;

  if v_vehicle_id is not null then
    select
      private.normalize_intake_vin(v.vin),
      nullif(btrim(v.make), ''),
      nullif(btrim(v.model), '')
    into v_existing_vin, v_comp_make, v_comp_model
    from public.vehicles as v
    where v.id = v_vehicle_id;
  else
    v_existing_vin := null;
    v_comp_make := null;
    v_comp_model := null;
  end if;

  v_completeness := private.compute_intake_completeness(
    v_existing_phone,
    v_existing_email,
    v_existing_vin,
    v_comp_make,
    v_comp_model
  );

  v_status := v_completeness ->> 'status';
  v_missing := v_completeness -> 'missing_fields';
  v_next_action := v_completeness ->> 'next_action';

  if v_identity_quarantine then
    v_attention_reason :=
      'Preveri ujemanje stranke ali vozila iz spletnega povpraševanja.';
  else
    v_attention_reason := null;
  end if;

  insert into public.service_requests (
    organization_id,
    customer_id,
    vehicle_id,
    status,
    summary,
    problem_description,
    service_wanted,
    brings_own_material,
    mileage_reported_km,
    source,
    channel,
    missing_fields,
    next_action,
    attention_needed,
    attention_reason,
    has_error,
    assigned_profile_id,
    intake_request_id
  ) values (
    v_org_id,
    v_customer_id,
    v_vehicle_id,
    v_status,
    v_summary,
    v_problem_description,
    v_service_wanted,
    coalesce(p_brings_own_material, false),
    p_mileage_reported_km,
    'web_form',
    'web',
    case
      when jsonb_typeof(v_missing) = 'array' then (
        select array_agg(x)
        from jsonb_array_elements_text(v_missing) as t(x)
      )
      else null
    end,
    v_next_action,
    v_identity_quarantine,
    v_attention_reason,
    false,
    null,
    p_client_request_id
  );

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    -- Replay of the same client_request_id must look like success.
    -- Vehicle VIN uniqueness is trapped on insert and quarantined (no oracle).
    select sr.id
      into v_replay_id
    from public.service_requests as sr
    where sr.organization_id = v_org_id
      and sr.intake_request_id = p_client_request_id;
    if found then
      return jsonb_build_object('ok', true);
    end if;
    return jsonb_build_object('ok', false, 'error_code', 'intake_unavailable');
  when others then
    -- Never surface raw DB errors to anon callers.
    return jsonb_build_object('ok', false, 'error_code', 'intake_unavailable');
end;
$$;
