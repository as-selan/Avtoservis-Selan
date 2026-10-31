-- =============================================================================
-- APPOINTMENTS FOUNDATION PREP V1 (+ V2 identity integrity, V3 UPDATE grants)
--
-- PREPARE ONLY — do not apply until explicitly approved.
-- Canonical internal appointments storage + RLS.
-- Status values include hold-related states for a future availability/hold slice.
-- Concurrency, capacity, bay/resource exclusivity, automatic expiry, customer
-- slot selection, Google Calendar, and MyPlanly are NOT implemented here.
-- No service_order_id yet — service_orders table does not exist.
--
-- Identity invariant (V2/V3):
--   appointment.customer_id = service_request.customer_id
--   appointment.vehicle_id IS NOT DISTINCT FROM service_request.vehicle_id
-- Historical service_request pair is authoritative; vehicles.customer_id is not.
-- Authenticated clients set identity on INSERT only; UPDATE excludes identity
-- columns to avoid lock-order deadlock with request identity sync (V3).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) appointments
-- Tenant-scoped. Same-org FKs to service_requests, customers, vehicles.
-- vehicle_id nullable (incomplete request may lack vehicle).
-- MATCH SIMPLE on nullable vehicle FK: null vehicle_id skips that FK check.
-- -----------------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  service_request_id uuid not null,
  customer_id uuid not null,
  vehicle_id uuid,
  status text not null,
  appointment_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  hold_expires_at timestamptz,
  notes text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_org_id_id_unique
    unique (organization_id, id),
  constraint appointments_service_request_same_org_fk
    foreign key (organization_id, service_request_id)
    references public.service_requests (organization_id, id)
    on delete restrict,
  constraint appointments_customer_same_org_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id)
    on delete restrict,
  constraint appointments_vehicle_same_org_fk
    foreign key (organization_id, vehicle_id)
    references public.vehicles (organization_id, id)
    on delete restrict,
  constraint appointments_status_check
    check (
      status in (
        'proposed',
        'offered',
        'held',
        'selected',
        'confirmed',
        'released',
        'checked_in',
        'completed',
        'cancelled',
        'no_show'
      )
    ),
  constraint appointments_appointment_type_check
    check (
      appointment_type in (
        'intake',
        'service',
        'diagnosis'
      )
    ),
  constraint appointments_ends_after_starts_check
    check (ends_at is null or ends_at > starts_at),
  constraint appointments_held_requires_expiry_check
    check (
      status <> 'held'
      or hold_expires_at is not null
    )
);

comment on table public.appointments is
  'Canonical workshop appointments. Hold/capacity/concurrency enforcement is deferred to a dedicated availability slice. External calendars are integrations only.';

create index appointments_organization_id_starts_at_idx
  on public.appointments (organization_id, starts_at);

create index appointments_organization_id_status_starts_at_idx
  on public.appointments (organization_id, status, starts_at);

create index appointments_service_request_id_idx
  on public.appointments (service_request_id);

create index appointments_customer_id_idx
  on public.appointments (customer_id);

create index appointments_vehicle_id_idx
  on public.appointments (vehicle_id)
  where vehicle_id is not null;

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 1b) Align appointment customer/vehicle with the HISTORICAL service_request
-- pair (not vehicles.customer_id current ownership).
--
-- Identity ownership:
--   Appointment identity is derived from its service_request.
--   Authenticated clients may supply identity columns on INSERT only.
--   Authenticated clients cannot relink/reassign identity via UPDATE
--   (those columns are excluded from the UPDATE grant).
--   Corrections update service_request.customer_id / vehicle_id; the sync
--   trigger (1c) rewrites linked appointments atomically.
--   Future appointment reassignment (if ever needed) requires a controlled
--   workflow/RPC — not direct browser column updates.
--
-- Runs on INSERT, or UPDATE that changes service_request_id / customer_id /
-- vehicle_id (security definer sync path only for identity UPDATEs).
-- Locks the request row FOR SHARE so concurrent request identity updates
-- cannot race past INSERT validation.
-- Permanent invariant:
--   customer_id must equal request.customer_id
--   vehicle_id IS NOT DISTINCT FROM request.vehicle_id
-- -----------------------------------------------------------------------------
create or replace function private.appointments_require_request_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_customer_id uuid;
  v_request_vehicle_id uuid;
begin
  if tg_op = 'UPDATE'
     and new.service_request_id is not distinct from old.service_request_id
     and new.customer_id is not distinct from old.customer_id
     and new.vehicle_id is not distinct from old.vehicle_id then
    return new;
  end if;

  select sr.customer_id, sr.vehicle_id
    into v_request_customer_id, v_request_vehicle_id
  from public.service_requests as sr
  where sr.organization_id = new.organization_id
    and sr.id = new.service_request_id
  for share of sr;

  if not found then
    raise exception
      'appointment service_request_id must reference a same-org service_request'
      using errcode = '23503';
  end if;

  if v_request_customer_id is null then
    raise exception
      'appointment requires service_request.customer_id to be non-null'
      using errcode = '23514';
  end if;

  if new.customer_id is distinct from v_request_customer_id then
    raise exception
      'appointment.customer_id must equal service_request.customer_id'
      using errcode = '23514';
  end if;

  if new.vehicle_id is distinct from v_request_vehicle_id then
    raise exception
      'appointment.vehicle_id must match service_request.vehicle_id'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.appointments_require_request_identity()
  from public;
revoke all on function private.appointments_require_request_identity()
  from anon;
revoke all on function private.appointments_require_request_identity()
  from authenticated;

create trigger appointments_require_request_identity
  before insert or update on public.appointments
  for each row
  execute function private.appointments_require_request_identity();

-- -----------------------------------------------------------------------------
-- 1c) When service_request customer_id / vehicle_id changes, keep linked
-- appointments synchronized in the same transaction (same org + request only).
-- NULL customer is forbidden while appointments exist.
-- NULL → real vehicle enrichment updates linked appointment.vehicle_id.
-- vehicles.customer_id ownership transfers do NOT flow through this path.
-- -----------------------------------------------------------------------------
create or replace function private.service_requests_sync_appointment_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linked_count integer;
begin
  if new.customer_id is not distinct from old.customer_id
     and new.vehicle_id is not distinct from old.vehicle_id then
    return new;
  end if;

  select count(*)::integer
    into v_linked_count
  from public.appointments as a
  where a.organization_id = new.organization_id
    and a.service_request_id = new.id;

  if v_linked_count > 0 and new.customer_id is null then
    raise exception
      'cannot clear service_request.customer_id while appointments exist'
      using errcode = '23514';
  end if;

  if v_linked_count > 0 then
    update public.appointments as a
    set
      customer_id = new.customer_id,
      vehicle_id = new.vehicle_id
    where a.organization_id = new.organization_id
      and a.service_request_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.service_requests_sync_appointment_identity()
  from public;
revoke all on function private.service_requests_sync_appointment_identity()
  from anon;
revoke all on function private.service_requests_sync_appointment_identity()
  from authenticated;

create trigger service_requests_sync_appointment_identity
  after update of customer_id, vehicle_id on public.service_requests
  for each row
  execute function private.service_requests_sync_appointment_identity();

alter table public.appointments enable row level security;

revoke all on table public.appointments from public;
revoke all on table public.appointments from anon;
revoke all on table public.appointments from authenticated;
grant select on table public.appointments to authenticated;
grant insert (
  organization_id,
  service_request_id,
  customer_id,
  vehicle_id,
  status,
  appointment_type,
  starts_at,
  ends_at,
  hold_expires_at,
  notes,
  cancelled_at
) on table public.appointments to authenticated;
grant update (
  status,
  appointment_type,
  starts_at,
  ends_at,
  hold_expires_at,
  notes,
  cancelled_at
) on table public.appointments to authenticated;
-- delete: not granted
-- INSERT: organization_id + identity columns may be supplied; RLS has_org_role
--   prevents unauthorized orgs. Identity is validated against the locked request.
-- UPDATE (authenticated): identity columns are NOT granted — appointment identity
--   is owned by service_request. Corrections update the request; the SECURITY
--   DEFINER sync trigger rewrites linked appointment customer_id/vehicle_id.
--   Future relinking (if ever needed) must use a controlled workflow/RPC.
-- id / organization_id / created_at / updated_at: not client-updatable
-- id / created_at / updated_at come from defaults/triggers on INSERT

-- -----------------------------------------------------------------------------
-- 2) RLS — authenticated only; no anon policies
-- SELECT / INSERT / UPDATE: owner / admin / reception only.
-- Do NOT use private.is_active_org_member — that would include mechanic.
-- Mechanic: excluded until restricted vs full-workshop modes exist.
-- DELETE: none for clients.
-- -----------------------------------------------------------------------------
create policy appointments_select_advisor_plus
  on public.appointments
  for select
  to authenticated
  using (
    private.has_org_role(
      organization_id,
      array['owner', 'admin', 'reception']::text[]
    )
  );

create policy appointments_insert_advisor_plus
  on public.appointments
  for insert
  to authenticated
  with check (
    private.has_org_role(
      organization_id,
      array['owner', 'admin', 'reception']::text[]
    )
  );

create policy appointments_update_advisor_plus
  on public.appointments
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
-- End APPOINTMENTS FOUNDATION PREP V1
-- =============================================================================
