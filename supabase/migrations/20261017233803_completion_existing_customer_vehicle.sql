-- Pending approval: replace only the completion RPC; no data backfill, grants, or RLS changes.
-- Preserves token/request/VIN serialization, customer-before-vehicle locks and staff review.
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
  v_matching_vehicle_ids uuid[];
  v_candidate public.vehicles%rowtype;
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
    -- Registration is not lifetime identity. Only a unique normalized VIN may
    -- attach an existing vehicle, and only under this request's current customer.
    -- Include archived and foreign-owner matches: neither permits a duplicate.
    v_matching_vehicle_ids := '{}';
    if v_vin_in is not null then
      select coalesce(array_agg(v.id), '{}'::uuid[])
        into v_matching_vehicle_ids
      from public.vehicles as v
      where v.organization_id = v_org_id
        and private.normalize_intake_vin(v.vin) = v_vin_in;
    end if;

    if cardinality(v_matching_vehicle_ids) > 1 then
      v_attention := true;
    elsif cardinality(v_matching_vehicle_ids) = 1 then
      -- Customer is already locked. Lock and recheck the vehicle before linking;
      -- a concurrent ownership transfer must not attach somebody else's vehicle.
      select v.* into v_candidate
      from public.vehicles as v
      where v.organization_id = v_org_id
        and v.id = v_matching_vehicle_ids[1]
      for update;

      if not found
         or v_candidate.customer_id is distinct from v_customer_id
         or v_candidate.archived_at is not null
         or private.normalize_intake_vin(v_candidate.vin) is distinct from v_vin_in
         or (v_make_in is not null and nullif(btrim(v_candidate.make), '') is not null
             and lower(btrim(v_candidate.make)) <> lower(v_make_in))
         or (v_model_in is not null and nullif(btrim(v_candidate.model), '') is not null
             and lower(btrim(v_candidate.model)) <> lower(v_model_in)) then
        v_attention := true;
      else
        -- Fill only absent descriptive data; never overwrite vehicle identity,
        -- registration, ownership, or a nonempty make/model.
        update public.vehicles as v
        set make = coalesce(nullif(btrim(v.make), ''), v_make_in),
            model = coalesce(nullif(btrim(v.model), ''), v_model_in)
        where v.organization_id = v_org_id and v.id = v_candidate.id
          and (nullif(btrim(v.make), '') is null and v_make_in is not null
            or nullif(btrim(v.model), '') is null and v_model_in is not null);

        update public.service_requests as sr
        set vehicle_id = v_candidate.id
        where sr.organization_id = v_org_id
          and sr.id = v_request_id and sr.vehicle_id is null;
        v_vehicle_id := v_candidate.id;
      end if;
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
