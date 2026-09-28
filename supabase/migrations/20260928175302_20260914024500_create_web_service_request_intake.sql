-- =============================================================================
-- PHASE 6 PREP — public.create_web_service_request_intake
--
-- PREPARE ONLY — do not apply until explicitly approved.
-- Prerequisite: M3 customers/vehicles/service_requests + M4 manual intake.
-- No hosted apply / db push from this slice.
--
-- Website and manual intake share:
--   - completeness contract (phone, email, VIN, make, model)
--   - normalization helpers
--   - intake_request_id idempotency
--   - advisory-lock namespaces/order 910000..910004
-- Website-specific:
--   - SECURITY DEFINER, callable by anon + authenticated
--   - organization resolved internally (slug avtoservis-selan)
--   - source = web_form, channel = web (never from the caller)
--   - no selected customer/vehicle IDs (no public search)
--   - response contains no internal IDs / match metadata
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Shared V1 completeness helper
-- M4 keeps private.compute_manual_intake_completeness as a wrapper.
-- Do not edit the old M4 migration file.
-- -----------------------------------------------------------------------------
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

revoke all on function private.compute_intake_completeness(text, text, text, text, text)
  from public;
revoke all on function private.compute_intake_completeness(text, text, text, text, text)
  from anon;
grant execute on function private.compute_intake_completeness(text, text, text, text, text)
  to authenticated;

drop function if exists private.compute_manual_intake_completeness(text, text, text, text, text);

create function private.compute_manual_intake_completeness(
  p_phone text,
  p_email text,
  p_vin text,
  p_make text,
  p_model text
)
returns jsonb
language sql
immutable
parallel safe
set search_path = ''
as $$
  select private.compute_intake_completeness(
    p_phone,
    p_email,
    p_vin,
    p_make,
    p_model
  );
$$;

revoke all on function private.compute_manual_intake_completeness(text, text, text, text, text)
  from public;
revoke all on function private.compute_manual_intake_completeness(text, text, text, text, text)
  from anon;
grant execute on function private.compute_manual_intake_completeness(text, text, text, text, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 2) Resolve canonical workshop internally (never from caller input)
-- -----------------------------------------------------------------------------
create or replace function private.resolve_web_intake_org()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_count integer;
begin
  select count(*)::integer
    into v_count
  from public.organizations as o
  where o.slug = 'avtoservis-selan'
    and o.archived_at is null;

  if v_count is distinct from 1 then
    return null;
  end if;

  select o.id
    into v_org_id
  from public.organizations as o
  where o.slug = 'avtoservis-selan'
    and o.archived_at is null;

  return v_org_id;
end;
$$;

revoke all on function private.resolve_web_intake_org() from public;
revoke all on function private.resolve_web_intake_org() from anon;
revoke all on function private.resolve_web_intake_org() from authenticated;

-- -----------------------------------------------------------------------------
-- 3) Public website intake RPC
--
-- Advisory locks — SAME namespaces/order as M4 (deadlock-safe with manual):
--   0) client request id  910000 + hashtext(org || unitsep || request_id)
--   1) customer phone     910001 + hashtext(org || unitsep || phone)
--   2) customer email     910002 + hashtext(org || unitsep || email)
--   3) vehicle VIN        910003 + hashtext(org || unitsep || vin)
--   4) vehicle registration 910004 + hashtext(org || unitsep || reg)
-- Then row locks: resolved customer, then resolved vehicle.
-- Re-read candidates after locks before writes.
--
-- CASE A: website + manual same phone/email/VIN → one waits; loser re-reads
--         and reuses safe existing rows (no blind duplicate).
-- CASE B: two website calls with same client_request_id → one canonical
--         service_request; replay/unique race returns ok without another row.
-- Identity conflicts (ambiguous/archived/incompatible) are quarantined into
-- fresh canonical rows + attention_needed. Public result stays { ok: true }.
-- intake_unavailable is reserved for org/infrastructure inability.
-- -----------------------------------------------------------------------------
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
  if v_phone is null and v_email is null then
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

revoke all on function public.create_web_service_request_intake(
  uuid, text, text, text, text, text, text, text, integer, integer,
  text, text, text, integer, text, text, boolean
) from public;
revoke all on function public.create_web_service_request_intake(
  uuid, text, text, text, text, text, text, text, integer, integer,
  text, text, text, integer, text, text, boolean
) from anon;
revoke all on function public.create_web_service_request_intake(
  uuid, text, text, text, text, text, text, text, integer, integer,
  text, text, text, integer, text, text, boolean
) from authenticated;
grant execute on function public.create_web_service_request_intake(
  uuid, text, text, text, text, text, text, text, integer, integer,
  text, text, text, integer, text, text, boolean
) to anon;
grant execute on function public.create_web_service_request_intake(
  uuid, text, text, text, text, text, text, text, integer, integer,
  text, text, text, integer, text, text, boolean
) to authenticated;

-- No anon table grants. No SELECT policies for anon.
-- Existing RLS on organizations/customers/vehicles/service_requests/appointments
-- remains unchanged.

-- =============================================================================
-- End PHASE 6 PREP — website intake RPC
-- =============================================================================
