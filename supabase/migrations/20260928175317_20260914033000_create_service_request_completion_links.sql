-- =============================================================================
-- PHASE 7 PREP — missing-data completion links
--
-- PREPARE ONLY — do not apply until explicitly approved.
-- Prerequisite: Phase 6 website intake + M3/M4.
-- No hosted apply / db push from this slice.
--
-- Capability tokens authorize narrowly scoped completion of the SAME
-- service_request. Raw bearer tokens are NEVER stored; only SHA-256 hex.
-- Quibi / offers / appointments / MyPlanly / Calendar are NOT implemented.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Completion link table (token lifecycle separate from service_requests)
-- -----------------------------------------------------------------------------
create table public.service_request_completion_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  service_request_id uuid not null,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  completed_at timestamptz,
  last_used_at timestamptz,
  created_by_profile_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_request_completion_links_token_hash_hex
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint service_request_completion_links_token_hash_unique
    unique (token_hash),
  constraint service_request_completion_links_org_id_id_unique
    unique (organization_id, id),
  constraint service_request_completion_links_request_same_org_fk
    foreign key (organization_id, service_request_id)
    references public.service_requests (organization_id, id)
    on delete restrict,
  constraint service_request_completion_links_created_by_same_org_fk
    foreign key (organization_id, created_by_profile_id)
    references public.organization_memberships (organization_id, profile_id)
    on delete restrict
);

create index service_request_completion_links_request_active_idx
  on public.service_request_completion_links (organization_id, service_request_id)
  where revoked_at is null and completed_at is null;

create trigger service_request_completion_links_set_updated_at
  before update on public.service_request_completion_links
  for each row
  execute function public.set_updated_at();

alter table public.service_request_completion_links enable row level security;

revoke all on table public.service_request_completion_links from public;
revoke all on table public.service_request_completion_links from anon;
revoke all on table public.service_request_completion_links from authenticated;

-- No token_hash column grant. No INSERT/UPDATE/DELETE for clients.
grant select (
  id,
  organization_id,
  service_request_id,
  expires_at,
  revoked_at,
  completed_at,
  last_used_at,
  created_by_profile_id,
  created_at,
  updated_at
) on table public.service_request_completion_links to authenticated;

create policy service_request_completion_links_select_advisor_plus
  on public.service_request_completion_links
  for select
  to authenticated
  using (
    private.has_org_role(
      organization_id,
      array['owner', 'admin', 'reception']::text[]
    )
  );

-- -----------------------------------------------------------------------------
-- 2) Public generic failure (same shape for unknown/expired/revoked)
-- -----------------------------------------------------------------------------
create or replace function private.completion_public_unavailable()
returns jsonb
language sql
immutable
parallel safe
set search_path = ''
as $$
  select jsonb_build_object('ok', false);
$$;

revoke all on function private.completion_public_unavailable() from public;
revoke all on function private.completion_public_unavailable() from anon;
revoke all on function private.completion_public_unavailable() from authenticated;

create or replace function private.completion_public_ok(
  p_completed boolean,
  p_missing jsonb
)
returns jsonb
language sql
immutable
parallel safe
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'completed', p_completed,
    'missing_fields', coalesce(p_missing, '[]'::jsonb)
  );
$$;

revoke all on function private.completion_public_ok(boolean, jsonb) from public;
revoke all on function private.completion_public_ok(boolean, jsonb) from anon;
revoke all on function private.completion_public_ok(boolean, jsonb) from authenticated;

-- -----------------------------------------------------------------------------
-- 3) Issue hashed token (authenticated owner/admin/reception)
-- Lock 910005 serializes regeneration for the same service_request BEFORE
-- any identity locks used by submit.
-- -----------------------------------------------------------------------------
create or replace function public.issue_service_request_completion_link(
  p_service_request_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
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
begin
  v_org_id := private.resolve_manual_intake_org();
  if v_uid is null or v_org_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  if p_service_request_id is null
     or p_token_hash is null
     or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at is null
     or p_expires_at <= pg_catalog.now()
     or p_expires_at > pg_catalog.now() + interval '7 days 5 minutes' then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(
    910005,
    hashtext(v_org_id::text || chr(31) || p_service_request_id::text)
  );

  select sr.status, sr.archived_at
    into v_status, v_archived
  from public.service_requests as sr
  where sr.organization_id = v_org_id
    and sr.id = p_service_request_id;

  if not found or v_archived is not null then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  if v_status is distinct from 'needs_data' then
    return jsonb_build_object('ok', false, 'error_code', 'not_needs_data');
  end if;

  -- Regeneration revokes prior still-active links for the SAME request.
  update public.service_request_completion_links as l
  set revoked_at = pg_catalog.now()
  where l.organization_id = v_org_id
    and l.service_request_id = p_service_request_id
    and l.revoked_at is null
    and l.completed_at is null
    and l.expires_at > pg_catalog.now();

  insert into public.service_request_completion_links (
    organization_id,
    service_request_id,
    token_hash,
    expires_at,
    created_by_profile_id
  ) values (
    v_org_id,
    p_service_request_id,
    p_token_hash,
    p_expires_at,
    v_uid
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.issue_service_request_completion_link(uuid, text, timestamptz)
  from public;
revoke all on function public.issue_service_request_completion_link(uuid, text, timestamptz)
  from anon;
revoke all on function public.issue_service_request_completion_link(uuid, text, timestamptz)
  from authenticated;
grant execute on function public.issue_service_request_completion_link(uuid, text, timestamptz)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 4) Resolve hashed token — missing field names only (no IDs / PII)
-- -----------------------------------------------------------------------------
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

  v_comp := private.compute_intake_completeness(
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

revoke all on function public.resolve_service_request_completion(text) from public;
revoke all on function public.resolve_service_request_completion(text) from anon;
revoke all on function public.resolve_service_request_completion(text) from authenticated;
grant execute on function public.resolve_service_request_completion(text) to anon;
grant execute on function public.resolve_service_request_completion(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5) Submit completion — UPDATE the SAME service_request (never INSERT another)
--
-- Advisory locks (deadlock-safe with M4 / Phase 6):
--   0) token hash           910006
--   1) service_request      910005
--   2) customer phone       910001
--   3) customer email       910002
--   4) vehicle VIN          910003
-- Registration (910004) is not touched by completion.
-- Then row locks: customer, then vehicle.
-- Re-read authoritative state after locks before mutation.
-- -----------------------------------------------------------------------------
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

  v_comp := private.compute_intake_completeness(
    v_existing_phone,
    v_existing_email,
    v_existing_vin,
    v_existing_make,
    v_existing_model
  );

  if coalesce(jsonb_array_length(v_comp -> 'missing_fields'), 0) = 0 then
    v_status := 'preparing_offer';
    v_missing := '{}';
    v_next_action := 'Pripravi ponudbo za pregled.';
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

  if v_status = 'preparing_offer' then
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

revoke all on function public.submit_service_request_completion(text, text, text, text, text, text)
  from public;
revoke all on function public.submit_service_request_completion(text, text, text, text, text, text)
  from anon;
revoke all on function public.submit_service_request_completion(text, text, text, text, text, text)
  from authenticated;
grant execute on function public.submit_service_request_completion(text, text, text, text, text, text)
  to anon;
grant execute on function public.submit_service_request_completion(text, text, text, text, text, text)
  to authenticated;

-- No anon table grants. No SELECT/INSERT/UPDATE/DELETE on the table for anon.
-- Existing RLS on customers/vehicles/service_requests remains unchanged.
-- Mechanic has no policy access (owner/admin/reception only).

-- =============================================================================
-- End PHASE 7 PREP — missing-data completion
-- =============================================================================
