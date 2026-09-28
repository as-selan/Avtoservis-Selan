-- =============================================================================
-- PHASE 8 PREP — internal offer preparations (provider-neutral)
--
-- PREPARE ONLY — do not apply until explicitly approved.
-- Prerequisite: M3 service_requests + M4 org/role helpers + Phase 6
-- private.compute_intake_completeness.
-- No hosted apply / db push from this slice.
--
-- PREP ONLY: no live Quibi API, no invented endpoints/payloads/auth,
-- no fabricated external resource IDs, no MyPlanly, no send-to-customer,
-- no customer approval, no appointment/scheduling.
-- service_requests.status MUST remain preparing_offer (Phase 9 owns review/send).
-- Quibi / quotes / appointments / MyPlanly / Calendar are NOT implemented.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Canonical internal preparation (one row per service_request)
-- -----------------------------------------------------------------------------
create table public.offer_preparations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  service_request_id uuid not null,
  status text not null default 'ready_for_provider',
  created_by_profile_id uuid not null,
  prepared_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_preparations_org_id_id_unique
    unique (organization_id, id),
  constraint offer_preparations_request_unique
    unique (organization_id, service_request_id),
  constraint offer_preparations_request_same_org_fk
    foreign key (organization_id, service_request_id)
    references public.service_requests (organization_id, id)
    on delete restrict,
  constraint offer_preparations_created_by_same_org_fk
    foreign key (organization_id, created_by_profile_id)
    references public.organization_memberships (organization_id, profile_id)
    on delete restrict,
  constraint offer_preparations_status_check
    check (status in ('ready_for_provider'))
);

create index offer_preparations_organization_id_idx
  on public.offer_preparations (organization_id);

create trigger offer_preparations_set_updated_at
  before update on public.offer_preparations
  for each row
  execute function public.set_updated_at();

alter table public.offer_preparations enable row level security;

revoke all on table public.offer_preparations from public;
revoke all on table public.offer_preparations from anon;
revoke all on table public.offer_preparations from authenticated;

grant select on table public.offer_preparations to authenticated;

create policy offer_preparations_select_advisor_plus
  on public.offer_preparations
  for select
  to authenticated
  using (
    private.has_org_role(
      organization_id,
      array['owner', 'admin', 'reception']::text[]
    )
  );

-- No INSERT/UPDATE/DELETE policies or grants for clients.
-- Mechanic has no policy access (owner/admin/reception only).

-- -----------------------------------------------------------------------------
-- 2) Prepare or return the canonical row
-- Lock 910007 serializes preparation for the same service_request.
-- Then FOR UPDATE on the request, then FOR SHARE on canonical customer
-- then vehicle (same customer-before-vehicle row-lock convention).
-- Does not take identity locks (910001–910006) and does not mutate
-- customer/vehicle identity.
-- -----------------------------------------------------------------------------
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
  for share;

  if not found or v_vehicle_archived is not null then
    return jsonb_build_object('ok', false, 'error_code', 'incomplete_data');
  end if;

  v_comp := private.compute_intake_completeness(
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

revoke all on function public.prepare_service_request_offer(uuid) from public;
revoke all on function public.prepare_service_request_offer(uuid) from anon;
revoke all on function public.prepare_service_request_offer(uuid) from authenticated;
grant execute on function public.prepare_service_request_offer(uuid) to authenticated;
