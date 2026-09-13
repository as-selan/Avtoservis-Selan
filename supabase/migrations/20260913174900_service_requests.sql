-- =============================================================================
-- M3 PREP — service_requests (after customers + vehicles)
--
-- PREPARE ONLY — do not apply until explicitly approved.
-- Canonical Phase 1 inquiry/case. All intake sources create this same entity.
-- Mechanic access is deferred (restricted vs full workshop — not implemented).
-- assigned_profile_id is tenant-safe (same-org membership) but does not grant
-- mechanic access in this slice.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) service_requests
-- customer_id / vehicle_id nullable: incomplete inquiries stay one row.
-- MATCH SIMPLE: if customer_id or vehicle_id is null, composite FKs that
-- include that column are not checked (data may attach later to SAME request).
-- Same-org FKs only — not same-customer. vehicles.customer_id is the CURRENT
-- owner and may change (sale/transfer). service_requests.customer_id is
-- historical: who owned/brought the vehicle at request time. Changing a
-- vehicle's current customer must not rewrite or block old requests.
-- Attaching both IDs on INSERT, or changing them on UPDATE, is checked by
-- private.service_requests_require_current_vehicle_customer against the
-- vehicle's CURRENT customer. Other UPDATEs leave the historical pair intact.
-- assigned_profile_id nullable; composite FK to memberships, ON DELETE RESTRICT
-- (do not SET NULL on a multi-column FK — that would null organization_id).
-- mileage_reported_km is this request's historical reading; do not treat
-- vehicles.mileage_latest_km as history.
-- priority: nullable text, no invented enum.
-- -----------------------------------------------------------------------------
create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  customer_id uuid,
  vehicle_id uuid,
  status text not null default 'new',
  priority text,
  summary text not null,
  problem_description text,
  service_wanted text,
  brings_own_material boolean,
  mileage_reported_km integer,
  source text not null,
  channel text,
  missing_fields text[],
  next_action text,
  attention_needed boolean not null default false,
  attention_reason text,
  has_error boolean not null default false,
  error_reason text,
  assigned_profile_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_requests_org_id_id_unique
    unique (organization_id, id),
  constraint service_requests_customer_same_org_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id)
    on delete restrict,
  constraint service_requests_vehicle_same_org_fk
    foreign key (organization_id, vehicle_id)
    references public.vehicles (organization_id, id)
    on delete restrict,
  constraint service_requests_assigned_same_org_fk
    foreign key (organization_id, assigned_profile_id)
    references public.organization_memberships (organization_id, profile_id)
    on delete restrict,
  constraint service_requests_summary_nonempty
    check (char_length(btrim(summary)) > 0),
  constraint service_requests_status_check
    check (
      status in (
        'new',
        'needs_data',
        'preparing_offer',
        'awaiting_customer_approval',
        'awaiting_slot_selection',
        'appointment_confirmed',
        'admin_completed',
        'converted',
        'declined',
        'cancelled',
        'closed'
      )
    ),
  constraint service_requests_source_check
    check (source in ('web_form', 'phone', 'sms', 'manual', 'other')),
  constraint service_requests_mileage_check
    check (mileage_reported_km is null or mileage_reported_km >= 0)
);

create index service_requests_organization_id_status_updated_at_idx
  on public.service_requests (organization_id, status, updated_at desc);

create index service_requests_customer_id_idx
  on public.service_requests (customer_id);

create index service_requests_vehicle_id_idx
  on public.service_requests (vehicle_id);

create index service_requests_assigned_profile_id_idx
  on public.service_requests (assigned_profile_id);

create index service_requests_organization_id_archived_at_idx
  on public.service_requests (organization_id, archived_at);

create index service_requests_attention_needed_idx
  on public.service_requests (organization_id)
  where attention_needed = true;

create index service_requests_has_error_idx
  on public.service_requests (organization_id)
  where has_error = true;

create trigger service_requests_set_updated_at
  before update on public.service_requests
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 1b) Current-owner check when attaching customer + vehicle
-- INSERT, or UPDATE that changes customer_id / vehicle_id: both non-null
-- IDs must match the vehicle's CURRENT customer in the same org.
-- UPDATE that does not change those IDs: skip (historical pair stays valid
-- after a later vehicle transfer).
-- -----------------------------------------------------------------------------
create or replace function private.service_requests_require_current_vehicle_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_customer_id uuid;
begin
  if new.customer_id is null or new.vehicle_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.customer_id is not distinct from old.customer_id
     and new.vehicle_id is not distinct from old.vehicle_id then
    return new;
  end if;

  select v.customer_id
    into v_current_customer_id
  from public.vehicles as v
  where v.organization_id = new.organization_id
    and v.id = new.vehicle_id;

  if not found
     or v_current_customer_id is distinct from new.customer_id then
    raise exception
      'service_request customer_id must match the vehicle current customer_id'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.service_requests_require_current_vehicle_customer()
  from public;
revoke all on function private.service_requests_require_current_vehicle_customer()
  from anon;
revoke all on function private.service_requests_require_current_vehicle_customer()
  from authenticated;

create trigger service_requests_require_current_vehicle_customer
  before insert or update on public.service_requests
  for each row
  execute function private.service_requests_require_current_vehicle_customer();

alter table public.service_requests enable row level security;

revoke all on table public.service_requests from public;
revoke all on table public.service_requests from anon;
revoke all on table public.service_requests from authenticated;
grant select on table public.service_requests to authenticated;
grant insert (
  organization_id,
  customer_id,
  vehicle_id,
  status,
  priority,
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
  error_reason,
  assigned_profile_id
) on table public.service_requests to authenticated;
grant update (
  customer_id,
  vehicle_id,
  status,
  priority,
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
  error_reason,
  assigned_profile_id,
  archived_at
) on table public.service_requests to authenticated;
-- delete: not granted — archive via archived_at
-- column INSERT limited: id/created_at/updated_at from defaults/triggers only
-- column UPDATE limited: id/organization_id/created_at/updated_at not updatable by browser
-- revoke-from-authenticated first clears any default table-wide privileges

-- -----------------------------------------------------------------------------
-- 2) RLS — authenticated only; no anon policies
-- SELECT / INSERT / UPDATE: owner / admin / reception only.
-- Do NOT use private.is_active_org_member — that would include mechanic.
-- Mechanic: excluded until Tadej's restricted vs full-workshop modes exist.
-- assigned_profile_id does not grant access in this slice.
-- DELETE: none for clients.
-- -----------------------------------------------------------------------------
create policy service_requests_select_advisor_plus
  on public.service_requests
  for select
  to authenticated
  using (
    private.has_org_role(
      organization_id,
      array['owner', 'admin', 'reception']::text[]
    )
  );

create policy service_requests_insert_advisor_plus
  on public.service_requests
  for insert
  to authenticated
  with check (
    private.has_org_role(
      organization_id,
      array['owner', 'admin', 'reception']::text[]
    )
  );

create policy service_requests_update_advisor_plus
  on public.service_requests
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
-- End M3 PREP — service_requests
-- =============================================================================
