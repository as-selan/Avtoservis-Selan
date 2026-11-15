-- =============================================================================
-- M4 PREP — public.create_manual_service_request_intake
--              + public.search_manual_intake_candidates
--
-- PREPARE ONLY — do not apply until explicitly approved.
-- Prerequisite: M3 customers, vehicles, service_requests.
-- No hosted apply / db push from this slice.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Normalization helpers (deterministic V1)
--
-- Email: lower(trim)
-- VIN: upper(trim)
-- Registration (match key): upper + strip non-alphanumeric; stored plate stays
--   human-readable on vehicles.registration_current
-- Phone: keep optional leading +; strip spaces, dashes, dots, parentheses,
--   slashes; drop other chars. Equal examples:
--   "041 123 456" = "041123456" = "041-123-456" = "(041) 123 456"
--   Does NOT equate "+38641123456" with "041123456" (no country-code folding)
-- -----------------------------------------------------------------------------
create or replace function private.normalize_intake_email(p_email text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(lower(btrim(p_email)), '');
$$;

create or replace function private.normalize_intake_vin(p_vin text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(upper(btrim(p_vin)), '');
$$;

create or replace function private.normalize_intake_registration(p_registration text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    upper(regexp_replace(btrim(p_registration), '[^A-Za-z0-9]', '', 'g')),
    ''
  );
$$;

create or replace function private.normalize_intake_phone(p_phone text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_phone is null or btrim(p_phone) = '' then null
    when left(btrim(p_phone), 1) = '+' then
      nullif('+' || regexp_replace(btrim(p_phone), '[^\d]', '', 'g'), '+')
    else
      nullif(regexp_replace(btrim(p_phone), '[^\d]', '', 'g'), '')
  end;
$$;

revoke all on function private.normalize_intake_email(text) from public;
revoke all on function private.normalize_intake_email(text) from anon;
grant execute on function private.normalize_intake_email(text) to authenticated;

revoke all on function private.normalize_intake_vin(text) from public;
revoke all on function private.normalize_intake_vin(text) from anon;
grant execute on function private.normalize_intake_vin(text) to authenticated;

revoke all on function private.normalize_intake_registration(text) from public;
revoke all on function private.normalize_intake_registration(text) from anon;
grant execute on function private.normalize_intake_registration(text) to authenticated;

revoke all on function private.normalize_intake_phone(text) from public;
revoke all on function private.normalize_intake_phone(text) from anon;
grant execute on function private.normalize_intake_phone(text) to authenticated;

-- Email format gate (mirrors TS validateManualIntakeForm).
-- normalize_intake_email only lowercases/trims — it does not prove a usable address.
create or replace function private.is_valid_intake_email(p_email text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    p_email is not null
    and btrim(p_email) <> ''
    and btrim(p_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
$$;

revoke all on function private.is_valid_intake_email(text) from public;
revoke all on function private.is_valid_intake_email(text) from anon;
grant execute on function private.is_valid_intake_email(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 2) Completeness (server-authoritative V1 — adjust later when Quibi fields known)
--
-- status = new only when phone, email, vin, make, and model are all present.
-- Otherwise needs_data. registration/year/fuel/engine are not required for new.
-- Documented single place: this function (+ mirrored TS helper).
-- -----------------------------------------------------------------------------
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

revoke all on function private.compute_manual_intake_completeness(text, text, text, text, text)
  from public;
revoke all on function private.compute_manual_intake_completeness(text, text, text, text, text)
  from anon;
grant execute on function private.compute_manual_intake_completeness(text, text, text, text, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 3) Org + role gate for manual intake (Selan workshop slug)
-- -----------------------------------------------------------------------------
create or replace function private.resolve_manual_intake_org()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org_id uuid;
  v_role text;
begin
  if v_uid is null then
    return null;
  end if;

  select o.id
    into v_org_id
  from public.organizations as o
  where o.slug = 'avtoservis-selan'
  limit 1;

  if v_org_id is null then
    return null;
  end if;

  select m.role
    into v_role
  from public.organization_memberships as m
  where m.organization_id = v_org_id
    and m.profile_id = v_uid
    and m.is_active = true
  limit 1;

  if v_role is null or v_role not in ('owner', 'admin', 'reception') then
    return null;
  end if;

  return v_org_id;
end;
$$;

revoke all on function private.resolve_manual_intake_org() from public;
revoke all on function private.resolve_manual_intake_org() from anon;
grant execute on function private.resolve_manual_intake_org() to authenticated;

-- -----------------------------------------------------------------------------
-- 4) Discovery search (authenticated internal UX — not anonymous)
--
-- Searches display_name / phone / email / registration / VIN.
-- Name is discovery-only. Archived rows are omitted (not selectable).
-- Bounded result set (default 15, hard max 20).
-- Name/broad queries require length >= 3; shorter queries only match when the
-- trimmed query looks like email (@), phone (normalized length >= 6), VIN
-- (normalized length >= 8), or registration (normalized length >= 4).
-- -----------------------------------------------------------------------------
create or replace function public.search_manual_intake_candidates(
  p_query text,
  p_limit integer default 15
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_q text := nullif(btrim(p_query), '');
  v_limit integer;
  v_phone text;
  v_email text;
  v_vin text;
  v_reg text;
  v_allow_name boolean;
  v_allow_strong boolean;
  v_customer_ids uuid[] := '{}';
  v_result jsonb;
begin
  v_org_id := private.resolve_manual_intake_org();
  if v_org_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  if v_q is null then
    return jsonb_build_object('ok', true, 'candidates', '[]'::jsonb);
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 15), 20));
  v_phone := private.normalize_intake_phone(v_q);
  v_email := private.normalize_intake_email(v_q);
  v_vin := private.normalize_intake_vin(v_q);
  v_reg := private.normalize_intake_registration(v_q);

  v_allow_name := char_length(v_q) >= 3;
  v_allow_strong :=
    (v_email is not null and position('@' in v_q) > 0)
    or (v_phone is not null and char_length(v_phone) >= 6)
    or (v_vin is not null and char_length(v_vin) >= 8)
    or (v_reg is not null and char_length(v_reg) >= 4);

  if not v_allow_name and not v_allow_strong then
    return jsonb_build_object('ok', true, 'candidates', '[]'::jsonb);
  end if;

  select coalesce(array_agg(distinct x.id), '{}')
    into v_customer_ids
  from (
    select c.id
    from public.customers as c
    where c.organization_id = v_org_id
      and c.archived_at is null
      and v_allow_name
      and c.display_name ilike '%' || v_q || '%'

    union

    select c.id
    from public.customers as c
    where c.organization_id = v_org_id
      and c.archived_at is null
      and v_phone is not null
      and char_length(v_phone) >= 6
      and private.normalize_intake_phone(c.phone) = v_phone

    union

    select c.id
    from public.customers as c
    where c.organization_id = v_org_id
      and c.archived_at is null
      and v_email is not null
      and position('@' in v_q) > 0
      and private.normalize_intake_email(c.email) = v_email

    union

    select v.customer_id
    from public.vehicles as v
    where v.organization_id = v_org_id
      and v.archived_at is null
      and v_vin is not null
      and char_length(v_vin) >= 8
      and private.normalize_intake_vin(v.vin) = v_vin

    union

    select v.customer_id
    from public.vehicles as v
    where v.organization_id = v_org_id
      and v.archived_at is null
      and v_reg is not null
      and char_length(v_reg) >= 4
      and private.normalize_intake_registration(v.registration_current) = v_reg
  ) as x;

  select coalesce(jsonb_agg(row_data order by row_data ->> 'display_name'), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
      'customer_id', c.id,
      'display_name', c.display_name,
      'phone', c.phone,
      'email', c.email,
      'vehicles', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'vehicle_id', v.id,
            'make', v.make,
            'model', v.model,
            'registration_current', v.registration_current,
            'vin', v.vin
          )
          order by v.registration_current nulls last, v.make nulls last, v.model nulls last
        )
        from public.vehicles as v
        where v.organization_id = v_org_id
          and v.customer_id = c.id
          and v.archived_at is null
      ), '[]'::jsonb)
    ) as row_data
    from public.customers as c
    where c.organization_id = v_org_id
      and c.archived_at is null
      and c.id = any (v_customer_ids)
    order by c.display_name
    limit v_limit
  ) as limited;

  return jsonb_build_object('ok', true, 'candidates', coalesce(v_result, '[]'::jsonb));
end;
$$;

revoke all on function public.search_manual_intake_candidates(text, integer) from public;
revoke all on function public.search_manual_intake_candidates(text, integer) from anon;
grant execute on function public.search_manual_intake_candidates(text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 5) Idempotency key + private JSONB snapshot (M4 V2)
--
-- intake_request_id: client-supplied idempotency key on service_requests.
--   Written only by SECURITY DEFINER create_manual_service_request_intake.
--   No authenticated INSERT grant on this column (prevents orphan keys).
--
-- private.manual_intake_material_snapshots:
--   Canonical material JSONB for the original write (19 business fields).
--   PII — retain/erase with parent service_request (ON DELETE CASCADE).
--   Zero DML/DQL for anon/authenticated. Not in PostgREST schemas.
--   Never returned in RPC JSON or application logs.
--
-- Owner role analysis: a dedicated non-login DEFINER role cannot use existing
-- RLS policies (TO authenticated) without BYPASSRLS or policy rewrites.
-- Safest Supabase-supported alternative: postgres-owned SECURITY DEFINER RPC
-- with search_path locked, explicit auth.uid()/role/tenant checks on every
-- selected and written row, and no EXECUTE on snapshot helpers for end users.
-- -----------------------------------------------------------------------------
alter table public.service_requests
  add column if not exists intake_request_id uuid;

-- Remove prep-only public snapshot column / GUC write path if present from
-- earlier M4 drafts (column was never applied to hosted/prod).
alter table public.service_requests
  drop column if exists intake_material;

drop trigger if exists service_requests_intake_material_bi
  on public.service_requests;
drop trigger if exists service_requests_intake_material_bu
  on public.service_requests;
drop function if exists private.service_requests_intake_material_bi();
drop function if exists private.service_requests_intake_material_bu();

create unique index if not exists service_requests_organization_id_intake_request_id_unique
  on public.service_requests (organization_id, intake_request_id)
  where intake_request_id is not null;

-- Drop earlier draft grant that allowed authenticated to set orphan keys.
revoke insert (intake_request_id) on table public.service_requests from authenticated;

create table if not exists private.manual_intake_material_snapshots (
  service_request_id uuid not null,
  organization_id uuid not null
    references public.organizations (id),
  intake_request_id uuid not null,
  material jsonb not null,
  created_at timestamptz not null default now(),
  primary key (service_request_id),
  -- Composite FK ties snapshot org to the parent service_request org
  -- (uses existing M3 unique (organization_id, id); no M3 schema change).
  constraint manual_intake_material_snapshots_org_sr_fkey
    foreign key (organization_id, service_request_id)
    references public.service_requests (organization_id, id)
    on delete cascade,
  constraint manual_intake_material_snapshots_org_request_unique
    unique (organization_id, intake_request_id),
  constraint manual_intake_material_snapshots_material_object
    check (jsonb_typeof(material) = 'object')
);

-- Upgrade path if an earlier prep draft used a single-column FK only.
do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'private'
      and t.relname = 'manual_intake_material_snapshots'
      and c.conname = 'manual_intake_material_snapshots_service_request_id_fkey'
  ) then
    alter table private.manual_intake_material_snapshots
      drop constraint manual_intake_material_snapshots_service_request_id_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'private'
      and t.relname = 'manual_intake_material_snapshots'
      and c.conname = 'manual_intake_material_snapshots_org_sr_fkey'
  ) then
    alter table private.manual_intake_material_snapshots
      add constraint manual_intake_material_snapshots_org_sr_fkey
      foreign key (organization_id, service_request_id)
      references public.service_requests (organization_id, id)
      on delete cascade;
  end if;
end;
$$;

comment on table private.manual_intake_material_snapshots is
  'M4 private canonical intake material for idempotency. PII — cascade-delete with service_request; never expose via API/UI/logs.';

revoke all on table private.manual_intake_material_snapshots from public;
revoke all on table private.manual_intake_material_snapshots from anon;
revoke all on table private.manual_intake_material_snapshots from authenticated;
-- Intentionally no grants to authenticated/anon.

-- Drop prior 8-field signature if present.
drop function if exists private.canonical_manual_intake_material(
  text, text, uuid, uuid, text, text, text, integer
);

create or replace function private.canonical_manual_intake_material(
  p_service_wanted text,
  p_problem_description text,
  p_selected_customer_id uuid,
  p_selected_vehicle_id uuid,
  p_vin text,
  p_phone text,
  p_email text,
  p_mileage_reported_km integer,
  p_display_name text,
  p_channel text,
  p_registration text,
  p_make text,
  p_model text,
  p_year integer,
  p_power_kw integer,
  p_engine text,
  p_engine_type text,
  p_fuel text,
  p_brings_own_material boolean
)
returns jsonb
language sql
immutable
parallel safe
set search_path = ''
as $$
  -- Canonicalize once for first write and retries. Explicit selection IDs are
  -- stored as submitted (not resolved auto-match IDs). Registration uses the
  -- approved match-key normalizer to avoid false conflicts on plate formatting.
  select jsonb_build_object(
    'service_wanted', nullif(btrim(p_service_wanted), ''),
    'problem_description', nullif(btrim(p_problem_description), ''),
    'selected_customer_id', p_selected_customer_id,
    'selected_vehicle_id', p_selected_vehicle_id,
    'vin', private.normalize_intake_vin(p_vin),
    'phone', private.normalize_intake_phone(p_phone),
    'email', private.normalize_intake_email(p_email),
    'mileage_reported_km', p_mileage_reported_km,
    'display_name', nullif(btrim(p_display_name), ''),
    'channel', nullif(btrim(p_channel), ''),
    'registration', private.normalize_intake_registration(p_registration),
    'make', nullif(btrim(p_make), ''),
    'model', nullif(btrim(p_model), ''),
    'year', p_year,
    'power_kw', p_power_kw,
    'engine', nullif(btrim(p_engine), ''),
    'engine_type', nullif(btrim(p_engine_type), ''),
    'fuel', nullif(btrim(p_fuel), ''),
    'brings_own_material', coalesce(p_brings_own_material, false)
  );
$$;

-- Callable only by privileged DEFINER owner — not by authenticated SQL users.
revoke all on function private.canonical_manual_intake_material(
  text, text, uuid, uuid, text, text, text, integer,
  text, text, text, text, text, integer, integer, text, text, text, boolean
) from public;
revoke all on function private.canonical_manual_intake_material(
  text, text, uuid, uuid, text, text, text, integer,
  text, text, text, text, text, integer, integer, text, text, text, boolean
) from anon;
revoke all on function private.canonical_manual_intake_material(
  text, text, uuid, uuid, text, text, text, integer,
  text, text, text, text, text, integer, integer, text, text, text, boolean
) from authenticated;

-- Drop prior M4 signatures if present.
drop function if exists public.create_manual_service_request_intake(
  text, text, text, text, text, text, text, text, integer, integer,
  text, text, text, integer, text, text, boolean, uuid, uuid
);
drop function if exists public.create_manual_service_request_intake(
  text, text, text, text, text, text, text, text, integer, integer,
  text, text, text, integer, text, text, boolean, uuid, uuid, uuid
);

-- -----------------------------------------------------------------------------
-- 6) Atomic manual intake RPC (SECURITY DEFINER — this function only)
--
-- Privilege model:
--   Owner: migration role (postgres). Table-owner bypasses RLS → every
--   SELECT/INSERT/UPDATE re-checks organization_id = resolved Selan org and
--   auth.uid() membership via resolve_manual_intake_org.
--   End users: EXECUTE on this public RPC only. No private snapshot DML/DQL.
--   No user-controlled GUCs for authorization or snapshot writes.
--   Dedicated non-login owner role rejected: existing RLS policies are
--   TO authenticated; without BYPASSRLS or policy rewrites the custom role
--   cannot insert/select under those policies. postgres-owned DEFINER with
--   explicit tenant checks is the safest supported alternative.
--
-- Advisory locks (transaction-scoped), deterministic order to avoid deadlocks:
--   0) client request id  namespace 910000 + hashtext(org || unitsep || request_id)
--   1) customer phone     namespace 910001 + hashtext(org || unitsep || phone)
--   2) customer email     namespace 910002 + hashtext(org || unitsep || email)
--   3) vehicle VIN        namespace 910003 + hashtext(org || unitsep || vin)
--   4) vehicle registration namespace 910004 + hashtext(org || unitsep || reg)
-- Then row locks (FOR UPDATE), always:
--   resolved customer row (if existing)
--   resolved vehicle row (if existing)
-- Only non-null identity keys are advisory-locked, always in this order.
-- -----------------------------------------------------------------------------
create or replace function public.create_manual_service_request_intake(
  p_display_name text,
  p_phone text default null,
  p_email text default null,
  p_channel text default 'manual',
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
  p_brings_own_material boolean default false,
  p_selected_customer_id uuid default null,
  p_selected_vehicle_id uuid default null,
  p_client_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org_id uuid;
  v_display_name text;
  v_phone text;
  v_email text;
  v_phone_store text;
  v_channel text;
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

  v_selected_customer public.customers%rowtype;
  v_selected_vehicle public.vehicles%rowtype;
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
  v_customer_created boolean := false;
  v_vehicle_id uuid;
  v_vehicle_created boolean := false;
  v_service_request_id uuid;
  v_create_vehicle boolean;
  v_existing_phone text;
  v_existing_email text;
  v_existing_vin text;
  v_existing_reg text;
  v_comp_make text;
  v_comp_model text;
  v_replay public.service_requests%rowtype;
  v_material jsonb;
  v_stored_material jsonb;
  v_snapshot_found boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  v_org_id := private.resolve_manual_intake_org();
  if v_org_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  if p_client_request_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;

  -- Blank strings → null
  v_display_name := nullif(btrim(p_display_name), '');
  v_phone_store := nullif(btrim(p_phone), '');
  v_phone := private.normalize_intake_phone(p_phone);
  v_email := private.normalize_intake_email(p_email);
  v_channel := nullif(btrim(p_channel), '');
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

  -- Explicit vehicle requires explicit customer
  if p_selected_vehicle_id is not null and p_selected_customer_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;

  if v_display_name is null then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;

  -- Reject non-blank invalid email (direct RPC must not bypass app validation).
  -- Invalid email must not satisfy the contact requirement or completeness.
  if nullif(btrim(p_email), '') is not null
     and not private.is_valid_intake_email(v_email) then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;

  if v_phone is null and v_email is null then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;
  if v_service_wanted is null and v_problem_description is null then
    return jsonb_build_object('ok', false, 'error_code', 'validation_failed');
  end if;
  if v_channel is null or v_channel not in ('phone', 'sms', 'manual') then
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

  -- Canonical material from original RPC params only (never from mutable rows).
  v_material := private.canonical_manual_intake_material(
    v_service_wanted,
    v_problem_description,
    p_selected_customer_id,
    p_selected_vehicle_id,
    p_vin,
    p_phone,
    p_email,
    p_mileage_reported_km,
    v_display_name,
    v_channel,
    p_registration,
    v_make,
    v_model,
    p_year,
    p_power_kw,
    v_engine,
    v_engine_type,
    v_fuel,
    coalesce(p_brings_own_material, false)
  );

  -- 0) Idempotency lock BEFORE identity locks
  perform pg_advisory_xact_lock(
    910000,
    hashtext(v_org_id::text || E'\x1f' || p_client_request_id::text)
  );

  select *
    into v_replay
  from public.service_requests as sr
  where sr.organization_id = v_org_id
    and sr.intake_request_id = p_client_request_id;

  if found then
    select s.material
      into v_stored_material
    from private.manual_intake_material_snapshots as s
    where s.organization_id = v_org_id
      and s.intake_request_id = p_client_request_id
      and s.service_request_id = v_replay.id;

    v_snapshot_found := found;

    -- Missing/unreadable snapshot → fail closed (never silent replay).
    if not v_snapshot_found
       or v_stored_material is null
       or v_stored_material is distinct from v_material then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'idempotency_conflict',
        'service_request_id', v_replay.id
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'customer_id', v_replay.customer_id,
      'customer_created', false,
      'vehicle_id', v_replay.vehicle_id,
      'vehicle_created', false,
      'service_request_id', v_replay.id,
      'status', v_replay.status,
      'missing_fields', coalesce(to_jsonb(v_replay.missing_fields), '[]'::jsonb),
      'next_action', v_replay.next_action
    );
  end if;

  -- Identity locks (ordered)
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

  -- Verify explicit selection (untrusted IDs)
  if p_selected_customer_id is not null then
    select *
      into v_selected_customer
    from public.customers as c
    where c.id = p_selected_customer_id
      and c.organization_id = v_org_id;

    if not found then
      return jsonb_build_object('ok', false, 'error_code', 'selection_conflict');
    end if;
    if v_selected_customer.archived_at is not null then
      return jsonb_build_object('ok', false, 'error_code', 'archived_customer_match');
    end if;
  end if;

  if p_selected_vehicle_id is not null then
    select *
      into v_selected_vehicle
    from public.vehicles as v
    where v.id = p_selected_vehicle_id
      and v.organization_id = v_org_id;

    if not found then
      return jsonb_build_object('ok', false, 'error_code', 'selection_conflict');
    end if;
    if v_selected_vehicle.archived_at is not null then
      return jsonb_build_object('ok', false, 'error_code', 'archived_vehicle_match');
    end if;
    if v_selected_vehicle.customer_id is distinct from p_selected_customer_id then
      return jsonb_build_object('ok', false, 'error_code', 'vehicle_ownership_conflict');
    end if;
  end if;

  -- Auto customer candidates from phone / email (includes archived for detection)
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
    return jsonb_build_object('ok', false, 'error_code', 'ambiguous_customer');
  end if;

  if coalesce(array_length(v_phone_ids, 1), 0) = 1
     and coalesce(array_length(v_email_ids, 1), 0) = 1
     and v_phone_ids[1] is distinct from v_email_ids[1] then
    return jsonb_build_object('ok', false, 'error_code', 'ambiguous_customer');
  end if;

  if coalesce(array_length(v_phone_ids, 1), 0) = 1 then
    v_auto_customer_id := v_phone_ids[1];
  elsif coalesce(array_length(v_email_ids, 1), 0) = 1 then
    v_auto_customer_id := v_email_ids[1];
  else
    v_auto_customer_id := null;
  end if;

  if v_auto_customer_id is not null then
    select (c.archived_at is not null)
      into v_auto_customer_archived
    from public.customers as c
    where c.id = v_auto_customer_id
      and c.organization_id = v_org_id;

    if not found then
      return jsonb_build_object('ok', false, 'error_code', 'selection_conflict');
    end if;

    if v_auto_customer_archived then
      return jsonb_build_object('ok', false, 'error_code', 'archived_customer_match');
    end if;
  end if;

  -- Auto vehicle candidates (VIN authoritative; registration if unambiguous)
  if v_vin is not null then
    if (
      select count(*)::integer
      from public.vehicles as v
      where v.organization_id = v_org_id
        and private.normalize_intake_vin(v.vin) = v_vin
    ) > 1 then
      return jsonb_build_object('ok', false, 'error_code', 'ambiguous_vehicle');
    end if;

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

  if v_reg_match is not null then
    select coalesce(array_agg(v.id), '{}')
      into v_reg_vehicle_ids
    from public.vehicles as v
    where v.organization_id = v_org_id
      and private.normalize_intake_registration(v.registration_current) = v_reg_match;

    if coalesce(array_length(v_reg_vehicle_ids, 1), 0) > 1 then
      return jsonb_build_object('ok', false, 'error_code', 'ambiguous_vehicle');
    end if;

    if coalesce(array_length(v_reg_vehicle_ids, 1), 0) = 1 then
      if v_auto_vehicle_id is not null
         and v_auto_vehicle_id is distinct from v_reg_vehicle_ids[1] then
        return jsonb_build_object('ok', false, 'error_code', 'ambiguous_vehicle');
      end if;

      if v_auto_vehicle_id is null then
        select
          v.id,
          v.archived_at is not null,
          v.customer_id
        into
          v_auto_vehicle_id,
          v_auto_vehicle_archived,
          v_auto_vehicle_customer_id
        from public.vehicles as v
        where v.id = v_reg_vehicle_ids[1]
          and v.organization_id = v_org_id;

        if not found then
          return jsonb_build_object('ok', false, 'error_code', 'selection_conflict');
        end if;
      end if;
    end if;
  end if;

  if v_auto_vehicle_id is not null and v_auto_vehicle_archived then
    return jsonb_build_object('ok', false, 'error_code', 'archived_vehicle_match');
  end if;

  -- Reconcile explicit selection with strong-identifier auto candidates
  if p_selected_customer_id is not null then
    if v_auto_customer_id is not null
       and v_auto_customer_id is distinct from p_selected_customer_id then
      return jsonb_build_object('ok', false, 'error_code', 'selection_conflict');
    end if;
    v_customer_id := p_selected_customer_id;
  else
    v_customer_id := v_auto_customer_id;
  end if;

  if p_selected_vehicle_id is not null then
    if v_auto_vehicle_id is not null
       and v_auto_vehicle_id is distinct from p_selected_vehicle_id then
      return jsonb_build_object('ok', false, 'error_code', 'selection_conflict');
    end if;
    v_vehicle_id := p_selected_vehicle_id;
  else
    v_vehicle_id := v_auto_vehicle_id;
  end if;

  -- Joint ownership gate (pre-lock): vehicle without resolved customer is unsafe
  if v_vehicle_id is not null and v_customer_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'vehicle_ownership_conflict');
  end if;
  if v_vehicle_id is not null
     and v_auto_vehicle_customer_id is not null
     and v_auto_vehicle_customer_id is distinct from v_customer_id then
    return jsonb_build_object('ok', false, 'error_code', 'vehicle_ownership_conflict');
  end if;

  -- Row locks on final resolved existing rows (deterministic: customer then vehicle).
  -- Re-read authoritative values under FOR UPDATE — do not trust earlier snapshots
  -- (v_selected_*) for conflict / archived / ownership decisions.
  if v_customer_id is not null then
    select *
      into v_customer
    from public.customers as c
    where c.id = v_customer_id
      and c.organization_id = v_org_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'error_code', 'selection_conflict');
    end if;
    if v_customer.archived_at is not null then
      return jsonb_build_object('ok', false, 'error_code', 'archived_customer_match');
    end if;

    v_existing_phone := private.normalize_intake_phone(v_customer.phone);
    v_existing_email := private.normalize_intake_email(v_customer.email);

    if v_phone is not null
       and v_existing_phone is not null
       and v_existing_phone is distinct from v_phone then
      return jsonb_build_object('ok', false, 'error_code', 'selection_conflict');
    end if;
    if v_email is not null
       and v_existing_email is not null
       and v_existing_email is distinct from v_email then
      return jsonb_build_object('ok', false, 'error_code', 'selection_conflict');
    end if;
  end if;

  if v_vehicle_id is not null then
    select *
      into v_vehicle
    from public.vehicles as v
    where v.id = v_vehicle_id
      and v.organization_id = v_org_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'error_code', 'selection_conflict');
    end if;
    if v_vehicle.archived_at is not null then
      return jsonb_build_object('ok', false, 'error_code', 'archived_vehicle_match');
    end if;
    if v_vehicle.customer_id is distinct from v_customer_id then
      return jsonb_build_object('ok', false, 'error_code', 'vehicle_ownership_conflict');
    end if;

    v_existing_vin := private.normalize_intake_vin(v_vehicle.vin);
    v_existing_reg := private.normalize_intake_registration(v_vehicle.registration_current);

    if v_vin is not null
       and v_existing_vin is not null
       and v_existing_vin is distinct from v_vin then
      return jsonb_build_object('ok', false, 'error_code', 'selection_conflict');
    end if;
    if v_reg_match is not null
       and v_existing_reg is not null
       and v_existing_reg is distinct from v_reg_match then
      return jsonb_build_object('ok', false, 'error_code', 'selection_conflict');
    end if;
  end if;

  -- Writes only after required row locks + locked-row checks
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
      'manual'
    )
    returning id into v_customer_id;
    v_customer_created := true;
  else
    update public.customers as c
    set
      phone = case
        when c.phone is null and v_phone_store is not null then v_phone_store
        else c.phone
      end,
      email = case
        when c.email is null and v_email is not null then v_email
        else c.email
      end
    where c.id = v_customer_id
      and c.organization_id = v_org_id
      and (
        (c.phone is null and v_phone_store is not null)
        or (c.email is null and v_email is not null)
      );
  end if;

  v_create_vehicle :=
    v_vehicle_id is null
    and (
      v_vin is not null
      or v_reg_store is not null
      or (v_make is not null and v_model is not null)
    );

  if v_create_vehicle then
    -- First known reading may seed vehicles.mileage_latest_* cache.
    -- Subsequent manual intakes must not overwrite that cache (see UPDATE below).
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
      mileage_latest_km,
      mileage_latest_recorded_at
    ) values (
      v_org_id,
      v_customer_id,
      v_reg_store,
      v_vin,
      v_make,
      v_model,
      p_year,
      p_power_kw,
      v_engine,
      v_engine_type,
      v_fuel,
      p_mileage_reported_km,
      case when p_mileage_reported_km is not null then now() else null end
    )
    returning id into v_vehicle_id;
    v_vehicle_created := true;
  elsif v_vehicle_id is not null then
    update public.vehicles as v
    set
      vin = case
        when v.vin is null and v_vin is not null then v_vin
        else v.vin
      end,
      registration_current = case
        when v.registration_current is null and v_reg_store is not null then v_reg_store
        else v.registration_current
      end,
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
      -- mileage_latest_* is a cache only. Manual intake never overwrites it on
      -- an existing vehicle — reported mileage lives on service_requests only.
      -- New-vehicle INSERT above may seed the cache from the first reading.
    where v.id = v_vehicle_id
      and v.organization_id = v_org_id;
  end if;

  v_summary := coalesce(v_service_wanted, v_problem_description);

  -- Completeness from ACTUAL persisted values only
  select
    private.normalize_intake_phone(c.phone),
    private.normalize_intake_email(c.email)
  into v_existing_phone, v_existing_email
  from public.customers as c
  where c.id = v_customer_id
    and c.organization_id = v_org_id;

  if v_vehicle_id is not null then
    select
      private.normalize_intake_vin(v.vin),
      nullif(btrim(v.make), ''),
      nullif(btrim(v.model), '')
    into v_existing_vin, v_comp_make, v_comp_model
    from public.vehicles as v
    where v.id = v_vehicle_id
      and v.organization_id = v_org_id;
  else
    v_existing_vin := null;
    v_comp_make := null;
    v_comp_model := null;
  end if;

  v_completeness := private.compute_manual_intake_completeness(
    v_existing_phone,
    v_existing_email,
    v_existing_vin,
    v_comp_make,
    v_comp_model
  );

  v_status := v_completeness ->> 'status';
  v_missing := v_completeness -> 'missing_fields';
  v_next_action := v_completeness ->> 'next_action';

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
    'manual',
    v_channel,
    case
      when jsonb_typeof(v_missing) = 'array' then (
        select array_agg(x)
        from jsonb_array_elements_text(v_missing) as t(x)
      )
      else null
    end,
    v_next_action,
    false,
    false,
    null,
    p_client_request_id
  )
  returning id into v_service_request_id;

  insert into private.manual_intake_material_snapshots (
    service_request_id,
    organization_id,
    intake_request_id,
    material
  ) values (
    v_service_request_id,
    v_org_id,
    p_client_request_id,
    v_material
  );

  return jsonb_build_object(
    'ok', true,
    'replayed', false,
    'customer_id', v_customer_id,
    'customer_created', v_customer_created,
    'vehicle_id', v_vehicle_id,
    'vehicle_created', v_vehicle_created,
    'service_request_id', v_service_request_id,
    'status', v_status,
    'missing_fields', coalesce(v_missing, '[]'::jsonb),
    'next_action', v_next_action
  );
exception
  when unique_violation then
    -- Concurrent duplicate intake_request_id (or rare VIN race).
    -- Re-read under the held advisory lock and apply snapshot rules.
    select *
      into v_replay
    from public.service_requests as sr
    where sr.organization_id = v_org_id
      and sr.intake_request_id = p_client_request_id;

    if found then
      select s.material
        into v_stored_material
      from private.manual_intake_material_snapshots as s
      where s.organization_id = v_org_id
        and s.intake_request_id = p_client_request_id
        and s.service_request_id = v_replay.id;

      v_snapshot_found := found;

      if not v_snapshot_found
         or v_stored_material is null
         or v_stored_material is distinct from v_material then
        return jsonb_build_object(
          'ok', false,
          'error_code', 'idempotency_conflict',
          'service_request_id', v_replay.id
        );
      end if;
      return jsonb_build_object(
        'ok', true,
        'replayed', true,
        'customer_id', v_replay.customer_id,
        'customer_created', false,
        'vehicle_id', v_replay.vehicle_id,
        'vehicle_created', false,
        'service_request_id', v_replay.id,
        'status', v_replay.status,
        'missing_fields', coalesce(to_jsonb(v_replay.missing_fields), '[]'::jsonb),
        'next_action', v_replay.next_action
      );
    end if;

    return jsonb_build_object('ok', false, 'error_code', 'selection_conflict');
  when others then
    raise;
end;
$$;

revoke all on function public.create_manual_service_request_intake(
  text, text, text, text, text, text, text, text, integer, integer,
  text, text, text, integer, text, text, boolean, uuid, uuid, uuid
) from public;
revoke all on function public.create_manual_service_request_intake(
  text, text, text, text, text, text, text, text, integer, integer,
  text, text, text, integer, text, text, boolean, uuid, uuid, uuid
) from anon;
grant execute on function public.create_manual_service_request_intake(
  text, text, text, text, text, text, text, text, integer, integer,
  text, text, text, integer, text, text, boolean, uuid, uuid, uuid
) to authenticated;

-- =============================================================================
-- End M4 PREP — manual intake RPC + discovery
-- =============================================================================
