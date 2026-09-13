-- =============================================================================
-- M3 PREP — vehicles (after customers)
--
-- PREPARE ONLY — do not apply until explicitly approved.
-- Prerequisite: public.customers with unique (organization_id, id).
-- Scope: public.vehicles only. No service_requests, appointments, or seed data.
-- Mechanic access is deferred (restricted vs full workshop — not implemented).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) vehicles
-- VIN optional (phone-first intake); unique per org when present/non-empty,
-- normalized as upper(btrim(vin)) — no 17-character DB constraint.
-- registration_current is the current plate, not unique, not lifetime identity.
-- mileage_latest_* is a cache only — visit/request mileage lives later on
-- service_requests (and later intake/order), not as vehicle history.
-- Composite FK (organization_id, customer_id) keeps the vehicle in the same
-- tenant as its current customer. unique (organization_id, id) is the target
-- for same-org FKs. customer_id is mutable (sale/transfer); historical
-- service_requests keep the customer at the time of the request.
-- -----------------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  customer_id uuid not null,
  registration_current text,
  vin text,
  make text,
  model text,
  year integer,
  power_kw integer,
  engine text,
  engine_type text,
  fuel text,
  notes text,
  mileage_latest_km integer,
  mileage_latest_recorded_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_customer_same_org_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id)
    on delete restrict,
  constraint vehicles_org_id_id_unique
    unique (organization_id, id),
  constraint vehicles_year_check
    check (year is null or year between 1886 and 2100),
  constraint vehicles_power_kw_check
    check (power_kw is null or power_kw > 0),
  constraint vehicles_mileage_check
    check (mileage_latest_km is null or mileage_latest_km >= 0),
  constraint vehicles_vin_nonempty
    check (vin is null or char_length(btrim(vin)) > 0),
  constraint vehicles_fuel_check
    check (
      fuel is null
      or fuel in (
        'petrol',
        'diesel',
        'hybrid',
        'plug_in_hybrid',
        'electric',
        'lpg',
        'cng',
        'hydrogen',
        'other'
      )
    )
);

create unique index vehicles_organization_id_vin_normalized_unique
  on public.vehicles (organization_id, (upper(btrim(vin))))
  where vin is not null and char_length(btrim(vin)) > 0;

create index vehicles_organization_id_registration_current_idx
  on public.vehicles (organization_id, registration_current)
  where registration_current is not null;

create index vehicles_customer_id_idx
  on public.vehicles (customer_id);

create index vehicles_organization_id_archived_at_idx
  on public.vehicles (organization_id, archived_at);

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row
  execute function public.set_updated_at();

alter table public.vehicles enable row level security;

revoke all on table public.vehicles from public;
revoke all on table public.vehicles from anon;
revoke all on table public.vehicles from authenticated;
grant select on table public.vehicles to authenticated;
grant insert (
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
) on table public.vehicles to authenticated;
grant update (
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
  mileage_latest_recorded_at,
  archived_at
) on table public.vehicles to authenticated;
-- delete: not granted — archive via archived_at
-- column INSERT limited: id/created_at/updated_at from defaults/triggers only
-- column UPDATE limited: id/organization_id/created_at/updated_at not updatable by browser
-- revoke-from-authenticated first clears any default table-wide privileges

-- -----------------------------------------------------------------------------
-- 2) RLS — authenticated only; no anon policies
-- SELECT / INSERT / UPDATE: owner / admin / reception only.
-- Do NOT use private.is_active_org_member — that would include mechanic.
-- Mechanic: excluded until Tadej's restricted vs full-workshop modes exist.
-- DELETE: none for clients.
-- -----------------------------------------------------------------------------
create policy vehicles_select_advisor_plus
  on public.vehicles
  for select
  to authenticated
  using (
    private.has_org_role(
      organization_id,
      array['owner', 'admin', 'reception']::text[]
    )
  );

create policy vehicles_insert_advisor_plus
  on public.vehicles
  for insert
  to authenticated
  with check (
    private.has_org_role(
      organization_id,
      array['owner', 'admin', 'reception']::text[]
    )
  );

create policy vehicles_update_advisor_plus
  on public.vehicles
  for update
  to authenticated
  using (
    private.has_org_role(
      organization_id,
      array['owner', 'admin', 'reception']::text[]
    )
  )
  with check (
    private.has_org_role(
      organization_id,
      array['owner', 'admin', 'reception']::text[]
    )
  );

-- =============================================================================
-- End M3 PREP — vehicles
-- =============================================================================
