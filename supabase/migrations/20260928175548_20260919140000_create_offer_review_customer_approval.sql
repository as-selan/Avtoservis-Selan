-- =============================================================================
-- PHASE 9 PREP — Tadej offer review + customer approval foundations
--
-- PREPARE ONLY — do not apply until explicitly approved.
-- Prerequisite: Phase 8 offer_preparations (20260917100000) + M3/M4 helpers.
-- No hosted apply / db push from this slice.
--
-- PREP ONLY: no live Quibi API, no invented endpoints/payloads/auth,
-- no fabricated prices/parts/labour/VAT/provider IDs, no MyPlanly,
-- no Calendar, no appointments/slots/holds, no automatic email send,
-- no synthesized viewed/sent state, no activity_events subsystem.
--
-- Quotes are owned by service_request (+ offer_preparation), NOT service_order.
-- Phase 1 pre-appointment flow: offer exists before any workshop order.
-- Quibi remains non-canonical. Human review is mandatory.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Phase 8 candidate key for exact quote → offer_preparation binding
-- Do not edit the Phase 8 migration. Composite UNIQUE enables a composite FK
-- so quote.service_request_id and quote.offer_preparation_id cannot diverge.
-- -----------------------------------------------------------------------------
alter table public.offer_preparations
  add constraint offer_preparations_org_request_id_unique
  unique (organization_id, service_request_id, id);

-- -----------------------------------------------------------------------------
-- 1) Immutable offer version evidence (provider-neutral)
-- No public/staff INSERT RPC in this PREP — fabricating a quote row to
-- continue the workflow is forbidden. A future real evidence writer inserts.
-- -----------------------------------------------------------------------------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  service_request_id uuid not null,
  offer_preparation_id uuid not null,
  version_no integer not null,
  content_sha256 text not null,
  evidence_kind text not null,
  evidence_payload jsonb not null,
  internal_review_status text not null default 'unreviewed',
  reviewed_at timestamptz,
  reviewed_by_profile_id uuid,
  created_by_profile_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_org_id_id_unique
    unique (organization_id, id),
  constraint quotes_request_version_unique
    unique (organization_id, service_request_id, version_no),
  -- Candidate key for customer_approvals exact version/hash binding.
  constraint quotes_org_request_id_hash_unique
    unique (organization_id, service_request_id, id, content_sha256),
  constraint quotes_request_same_org_fk
    foreign key (organization_id, service_request_id)
    references public.service_requests (organization_id, id)
    on delete restrict,
  -- Exact prep binding: same org + same service_request + prep id.
  constraint quotes_prep_same_request_fk
    foreign key (organization_id, service_request_id, offer_preparation_id)
    references public.offer_preparations (organization_id, service_request_id, id)
    on delete restrict,
  constraint quotes_created_by_same_org_fk
    foreign key (organization_id, created_by_profile_id)
    references public.organization_memberships (organization_id, profile_id)
    on delete restrict,
  constraint quotes_reviewed_by_same_org_fk
    foreign key (organization_id, reviewed_by_profile_id)
    references public.organization_memberships (organization_id, profile_id)
    on delete restrict,
  constraint quotes_version_positive
    check (version_no >= 1),
  constraint quotes_content_sha256_hex
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint quotes_evidence_kind_nonempty
    check (char_length(btrim(evidence_kind)) > 0),
  constraint quotes_evidence_payload_object
    check (
      jsonb_typeof(evidence_payload) = 'object'
      and evidence_payload <> '{}'::jsonb
    ),
  constraint quotes_internal_review_status_check
    check (
      internal_review_status in (
        'unreviewed',
        'approved_for_send',
        'rejected_for_revision'
      )
    ),
  constraint quotes_review_fields_consistent
    check (
      (
        internal_review_status = 'unreviewed'
        and reviewed_at is null
        and reviewed_by_profile_id is null
      )
      or (
        internal_review_status in ('approved_for_send', 'rejected_for_revision')
        and reviewed_at is not null
        and reviewed_by_profile_id is not null
      )
    )
);

create index quotes_organization_id_idx
  on public.quotes (organization_id);

create index quotes_service_request_id_idx
  on public.quotes (organization_id, service_request_id);

create trigger quotes_set_updated_at
  before update on public.quotes
  for each row
  execute function public.set_updated_at();

-- Evidence identity is immutable. Changing offer content requires a new version.
create or replace function private.prevent_quote_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.organization_id is distinct from new.organization_id
     or old.service_request_id is distinct from new.service_request_id
     or old.offer_preparation_id is distinct from new.offer_preparation_id
     or old.version_no is distinct from new.version_no
     or old.content_sha256 is distinct from new.content_sha256
     or old.evidence_kind is distinct from new.evidence_kind
     or old.evidence_payload is distinct from new.evidence_payload
     or old.created_by_profile_id is distinct from new.created_by_profile_id
     or old.created_at is distinct from new.created_at then
    raise exception 'quote evidence fields are immutable'
      using errcode = '23514';
  end if;

  -- Reviewed decisions are terminal for that version (no silent reopen).
  if old.internal_review_status in ('approved_for_send', 'rejected_for_revision')
     and new.internal_review_status is distinct from old.internal_review_status then
    raise exception 'quote internal review decision is immutable'
      using errcode = '23514';
  end if;

  if old.internal_review_status in ('approved_for_send', 'rejected_for_revision')
     and (
       old.reviewed_at is distinct from new.reviewed_at
       or old.reviewed_by_profile_id is distinct from new.reviewed_by_profile_id
     ) then
    raise exception 'quote review provenance is immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_quote_evidence_mutation() from public;
revoke all on function private.prevent_quote_evidence_mutation() from anon;
revoke all on function private.prevent_quote_evidence_mutation() from authenticated;

create trigger quotes_prevent_evidence_mutation
  before update on public.quotes
  for each row
  execute function private.prevent_quote_evidence_mutation();

alter table public.quotes enable row level security;

revoke all on table public.quotes from public;
revoke all on table public.quotes from anon;
revoke all on table public.quotes from authenticated;

grant select on table public.quotes to authenticated;

create policy quotes_select_advisor_plus
  on public.quotes
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
-- 2) Customer delivery + decision foundation (bound to exact quote version)
-- viewed_at is nullable and must not be synthesized in this PREP.
-- -----------------------------------------------------------------------------
create table public.customer_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  service_request_id uuid not null,
  quote_id uuid not null,
  content_sha256 text not null,
  delivery_status text not null default 'not_delivered',
  delivered_at timestamptz,
  delivery_channel text,
  viewed_at timestamptz,
  customer_decision text,
  decided_at timestamptz,
  expires_at timestamptz,
  token_hash text,
  revoked_at timestamptz,
  created_by_profile_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_approvals_org_id_id_unique
    unique (organization_id, id),
  constraint customer_approvals_quote_unique
    unique (organization_id, quote_id),
  constraint customer_approvals_request_same_org_fk
    foreign key (organization_id, service_request_id)
    references public.service_requests (organization_id, id)
    on delete restrict,
  -- Exact tuple binding: org + request + quote + content_sha256.
  -- Prevents request A + quote from request B, and quote_id + wrong hash.
  constraint customer_approvals_quote_version_fk
    foreign key (
      organization_id,
      service_request_id,
      quote_id,
      content_sha256
    )
    references public.quotes (
      organization_id,
      service_request_id,
      id,
      content_sha256
    )
    on delete restrict,
  constraint customer_approvals_created_by_same_org_fk
    foreign key (organization_id, created_by_profile_id)
    references public.organization_memberships (organization_id, profile_id)
    on delete restrict,
  constraint customer_approvals_content_sha256_hex
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint customer_approvals_token_hash_hex
    check (
      token_hash is null
      or token_hash ~ '^[0-9a-f]{64}$'
    ),
  constraint customer_approvals_delivery_status_check
    check (delivery_status in ('not_delivered', 'delivered')),
  constraint customer_approvals_customer_decision_check
    check (
      customer_decision is null
      or customer_decision in ('approved', 'rejected', 'expired')
    ),
  constraint customer_approvals_delivery_fields_consistent
    check (
      (
        delivery_status = 'not_delivered'
        and delivered_at is null
        and delivery_channel is null
      )
      or (
        delivery_status = 'delivered'
        and delivered_at is not null
        and delivery_channel is not null
        and char_length(btrim(delivery_channel)) > 0
      )
    ),
  constraint customer_approvals_decision_requires_delivery
    check (
      customer_decision is null
      or (
        delivery_status = 'delivered'
        and decided_at is not null
      )
    ),
  constraint customer_approvals_decision_timestamp_consistent
    check (
      (customer_decision is null and decided_at is null)
      or (customer_decision is not null and decided_at is not null)
    )
);

create index customer_approvals_organization_id_idx
  on public.customer_approvals (organization_id);

create index customer_approvals_service_request_id_idx
  on public.customer_approvals (organization_id, service_request_id);

create unique index customer_approvals_token_hash_unique
  on public.customer_approvals (token_hash)
  where token_hash is not null;

create trigger customer_approvals_set_updated_at
  before update on public.customer_approvals
  for each row
  execute function public.set_updated_at();

-- Bind customer row fingerprint/identity; close delivery/decision/viewed holes.
-- token_hash / revoked_at / expires_at remain mutable for future lifecycle.
create or replace function private.prevent_customer_approval_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.organization_id is distinct from new.organization_id
     or old.service_request_id is distinct from new.service_request_id
     or old.quote_id is distinct from new.quote_id
     or old.content_sha256 is distinct from new.content_sha256
     or old.created_by_profile_id is distinct from new.created_by_profile_id
     or old.created_at is distinct from new.created_at then
    raise exception 'customer approval binding fields are immutable'
      using errcode = '23514';
  end if;

  -- Phase 9 does not support viewed_at. Block any mutation (set/clear/rewrite).
  -- A future real view-signal migration may deliberately replace this rule.
  if old.viewed_at is distinct from new.viewed_at then
    raise exception 'viewed_at is immutable in this PREP'
      using errcode = '23514';
  end if;

  -- Once delivery is canonical, delivery fields cannot revert or change.
  if old.delivery_status = 'delivered' then
    if new.delivery_status is distinct from old.delivery_status then
      raise exception 'delivered status is immutable'
        using errcode = '23514';
    end if;
    if old.delivered_at is distinct from new.delivered_at then
      raise exception 'delivered_at is immutable'
        using errcode = '23514';
    end if;
    if old.delivery_channel is distinct from new.delivery_channel then
      raise exception 'delivery_channel is immutable after delivery'
        using errcode = '23514';
    end if;
  end if;

  -- Also block delivered_at changes if somehow set while not_delivered → delivered
  -- is in progress only via consistent check; once non-null and status delivered,
  -- above covers it. Guard non-null delivered_at rewrite regardless:
  if old.delivered_at is not null
     and old.delivered_at is distinct from new.delivered_at then
    raise exception 'delivered_at is immutable'
      using errcode = '23514';
  end if;

  -- Once customer_decision is non-null, decision + decided_at are terminal.
  if old.customer_decision is not null then
    if new.customer_decision is distinct from old.customer_decision then
      raise exception 'customer decision is immutable'
        using errcode = '23514';
    end if;
    if old.decided_at is distinct from new.decided_at then
      raise exception 'decided_at is immutable after customer decision'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_customer_approval_evidence_mutation() from public;
revoke all on function private.prevent_customer_approval_evidence_mutation() from anon;
revoke all on function private.prevent_customer_approval_evidence_mutation() from authenticated;

create trigger customer_approvals_prevent_evidence_mutation
  before update on public.customer_approvals
  for each row
  execute function private.prevent_customer_approval_evidence_mutation();

alter table public.customer_approvals enable row level security;

revoke all on table public.customer_approvals from public;
revoke all on table public.customer_approvals from anon;
revoke all on table public.customer_approvals from authenticated;

-- token_hash never granted to clients.
grant select (
  id,
  organization_id,
  service_request_id,
  quote_id,
  content_sha256,
  delivery_status,
  delivered_at,
  delivery_channel,
  viewed_at,
  customer_decision,
  decided_at,
  expires_at,
  revoked_at,
  created_by_profile_id,
  created_at,
  updated_at
) on table public.customer_approvals to authenticated;

create policy customer_approvals_select_advisor_plus
  on public.customer_approvals
  for select
  to authenticated
  using (
    private.has_org_role(
      organization_id,
      array['owner', 'admin', 'reception']::text[]
    )
  );

-- -----------------------------------------------------------------------------
-- 2b) DB-level service_requests.status transition guards (Phase 9)
-- M3 advisor+ UPDATE policy alone cannot enforce business invariants.
-- Do not edit the M3 migration. Phase 10 may replace/extend the
-- awaiting_slot_selection stop-boundary below.
-- -----------------------------------------------------------------------------
create or replace function private.guard_phase9_service_request_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Unrelated column updates / status-unchanged updates must pass.
  if old.status is not distinct from new.status then
    return new;
  end if;

  -- Phase 9 STOP boundary: premature awaiting_slot_selection is blocked until
  -- Phase 10 owns that transition. Smallest safe guard; Phase 10 may replace.
  if new.status = 'awaiting_slot_selection' then
    raise exception
      'awaiting_slot_selection is blocked until Phase 10 owns that transition'
      using errcode = '23514';
  end if;

  -- Entering awaiting_customer_approval means: real delivered offer, still
  -- awaiting an active customer decision. Allowed ONLY from preparing_offer
  -- with non-revoked, undecided delivery evidence for the exact approved quote.
  -- Phase 9 has no delivery writer, so this transition is correctly impossible
  -- through normal/direct client updates. Do not fabricate delivery here.
  if new.status = 'awaiting_customer_approval' then
    if old.status is distinct from 'preparing_offer'
       or not exists (
      select 1
      from public.customer_approvals as ca
      inner join public.quotes as q
        on q.organization_id = ca.organization_id
       and q.service_request_id = ca.service_request_id
       and q.id = ca.quote_id
       and q.content_sha256 = ca.content_sha256
      where ca.organization_id = new.organization_id
        and ca.service_request_id = new.id
        and ca.delivery_status = 'delivered'
        and ca.customer_decision is null
        and ca.revoked_at is null
        and q.internal_review_status = 'approved_for_send'
    ) then
      raise exception
        'awaiting_customer_approval requires preparing_offer plus active delivered approved quote evidence'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_phase9_service_request_status_transition() from public;
revoke all on function private.guard_phase9_service_request_status_transition() from anon;
revoke all on function private.guard_phase9_service_request_status_transition() from authenticated;

create trigger service_requests_guard_phase9_status_transition
  before update on public.service_requests
  for each row
  execute function private.guard_phase9_service_request_status_transition();

-- -----------------------------------------------------------------------------
-- 3) Staff RPCs — fail closed without real quote evidence / delivery transport
-- Lock 910008 serializes review/delivery for the same service_request.
-- Does NOT insert quotes. Does NOT flip service_requests.status in this PREP.
-- -----------------------------------------------------------------------------

create or replace function public.approve_quote_for_send(
  p_quote_id uuid,
  p_content_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org_id uuid;
  v_request_id uuid;
  v_prep_id uuid;
  v_prep_status text;
  v_status text;
  v_archived timestamptz;
  v_hash text;
  v_review text;
  v_reviewed_at timestamptz;
begin
  v_org_id := private.resolve_manual_intake_org();
  if v_uid is null or v_org_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  if p_quote_id is null
     or p_content_sha256 is null
     or p_content_sha256 !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  -- Resolve request id for lock key without mutating yet.
  select q.service_request_id
    into v_request_id
  from public.quotes as q
  where q.organization_id = v_org_id
    and q.id = p_quote_id;

  if not found then
    -- No fabricated quote path: missing evidence fails closed.
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  perform pg_advisory_xact_lock(
    910008,
    hashtext(v_org_id::text || chr(31) || v_request_id::text)
  );

  select sr.status, sr.archived_at
    into v_status, v_archived
  from public.service_requests as sr
  where sr.organization_id = v_org_id
    and sr.id = v_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  if v_archived is not null then
    return jsonb_build_object('ok', false, 'error_code', 'archived');
  end if;

  -- Approve-for-send is only meaningful while still preparing the offer.
  -- Stale awaiting_customer_approval / later statuses fail closed.
  if v_status is distinct from 'preparing_offer' then
    return jsonb_build_object('ok', false, 'error_code', 'not_preparing_offer');
  end if;

  select q.content_sha256,
         q.internal_review_status,
         q.reviewed_at,
         q.offer_preparation_id
    into v_hash, v_review, v_reviewed_at, v_prep_id
  from public.quotes as q
  where q.organization_id = v_org_id
    and q.id = p_quote_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  if v_hash is distinct from p_content_sha256 then
    return jsonb_build_object('ok', false, 'error_code', 'hash_mismatch');
  end if;

  select p.status
    into v_prep_status
  from public.offer_preparations as p
  where p.organization_id = v_org_id
    and p.id = v_prep_id
  for share;

  if not found or v_prep_status is distinct from 'ready_for_provider' then
    return jsonb_build_object('ok', false, 'error_code', 'prep_not_ready');
  end if;

  -- Stale/newer-version check BEFORE idempotent success: an older version that
  -- was previously approved must still fail closed once superseded.
  if exists (
    select 1
    from public.quotes as newer
    where newer.organization_id = v_org_id
      and newer.service_request_id = v_request_id
      and newer.version_no > (
        select q2.version_no
        from public.quotes as q2
        where q2.organization_id = v_org_id
          and q2.id = p_quote_id
      )
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'stale_version');
  end if;

  -- Idempotent retry: already approved for this exact version/hash.
  if v_review = 'approved_for_send' then
    return jsonb_build_object(
      'ok', true,
      'quote_id', p_quote_id,
      'internal_review_status', 'approved_for_send',
      'service_request_status', 'preparing_offer',
      'idempotent', true
    );
  end if;

  if v_review is distinct from 'unreviewed' then
    return jsonb_build_object('ok', false, 'error_code', 'not_unreviewed');
  end if;

  update public.quotes as q
  set internal_review_status = 'approved_for_send',
      reviewed_at = pg_catalog.now(),
      reviewed_by_profile_id = v_uid
  where q.organization_id = v_org_id
    and q.id = p_quote_id
    and q.internal_review_status = 'unreviewed'
    and q.content_sha256 = p_content_sha256;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_unreviewed');
  end if;

  -- MUST NOT change service_requests.status (no awaiting_customer_approval).
  return jsonb_build_object(
    'ok', true,
    'quote_id', p_quote_id,
    'internal_review_status', 'approved_for_send',
    'service_request_status', 'preparing_offer',
    'idempotent', false
  );
end;
$$;

revoke all on function public.approve_quote_for_send(uuid, text) from public;
revoke all on function public.approve_quote_for_send(uuid, text) from anon;
revoke all on function public.approve_quote_for_send(uuid, text) from authenticated;
grant execute on function public.approve_quote_for_send(uuid, text) to authenticated;

create or replace function public.reject_quote_for_revision(
  p_quote_id uuid,
  p_content_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org_id uuid;
  v_request_id uuid;
  v_prep_id uuid;
  v_prep_status text;
  v_status text;
  v_archived timestamptz;
  v_hash text;
  v_review text;
begin
  v_org_id := private.resolve_manual_intake_org();
  if v_uid is null or v_org_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  if p_quote_id is null
     or p_content_sha256 is null
     or p_content_sha256 !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  select q.service_request_id
    into v_request_id
  from public.quotes as q
  where q.organization_id = v_org_id
    and q.id = p_quote_id;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  perform pg_advisory_xact_lock(
    910008,
    hashtext(v_org_id::text || chr(31) || v_request_id::text)
  );

  select sr.status, sr.archived_at
    into v_status, v_archived
  from public.service_requests as sr
  where sr.organization_id = v_org_id
    and sr.id = v_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  if v_archived is not null then
    return jsonb_build_object('ok', false, 'error_code', 'archived');
  end if;

  if v_status is distinct from 'preparing_offer' then
    return jsonb_build_object('ok', false, 'error_code', 'not_preparing_offer');
  end if;

  select q.content_sha256, q.internal_review_status, q.offer_preparation_id
    into v_hash, v_review, v_prep_id
  from public.quotes as q
  where q.organization_id = v_org_id
    and q.id = p_quote_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  if v_hash is distinct from p_content_sha256 then
    return jsonb_build_object('ok', false, 'error_code', 'hash_mismatch');
  end if;

  select p.status
    into v_prep_status
  from public.offer_preparations as p
  where p.organization_id = v_org_id
    and p.id = v_prep_id
  for share;

  if not found or v_prep_status is distinct from 'ready_for_provider' then
    return jsonb_build_object('ok', false, 'error_code', 'prep_not_ready');
  end if;

  -- Stale/newer-version check BEFORE idempotent success: superseded quotes
  -- must not be newly rejected or return misleading idempotent success.
  if exists (
    select 1
    from public.quotes as newer
    where newer.organization_id = v_org_id
      and newer.service_request_id = v_request_id
      and newer.version_no > (
        select q2.version_no
        from public.quotes as q2
        where q2.organization_id = v_org_id
          and q2.id = p_quote_id
      )
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'stale_version');
  end if;

  if v_review = 'rejected_for_revision' then
    return jsonb_build_object(
      'ok', true,
      'quote_id', p_quote_id,
      'internal_review_status', 'rejected_for_revision',
      'service_request_status', 'preparing_offer',
      'idempotent', true
    );
  end if;

  if v_review is distinct from 'unreviewed' then
    return jsonb_build_object('ok', false, 'error_code', 'not_unreviewed');
  end if;

  update public.quotes as q
  set internal_review_status = 'rejected_for_revision',
      reviewed_at = pg_catalog.now(),
      reviewed_by_profile_id = v_uid
  where q.organization_id = v_org_id
    and q.id = p_quote_id
    and q.internal_review_status = 'unreviewed'
    and q.content_sha256 = p_content_sha256;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_unreviewed');
  end if;

  return jsonb_build_object(
    'ok', true,
    'quote_id', p_quote_id,
    'internal_review_status', 'rejected_for_revision',
    'service_request_status', 'preparing_offer',
    'idempotent', false
  );
end;
$$;

revoke all on function public.reject_quote_for_revision(uuid, text) from public;
revoke all on function public.reject_quote_for_revision(uuid, text) from anon;
revoke all on function public.reject_quote_for_revision(uuid, text) from authenticated;
grant execute on function public.reject_quote_for_revision(uuid, text) to authenticated;

-- Delivery contract only. No email/provider transport exists in this PREP.
-- Always fails closed with delivery_unavailable — does not fabricate delivered_at
-- and does not set service_requests.status = awaiting_customer_approval.
create or replace function public.deliver_approved_quote_to_customer(
  p_quote_id uuid,
  p_content_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org_id uuid;
  v_request_id uuid;
  v_status text;
  v_archived timestamptz;
  v_hash text;
  v_review text;
begin
  v_org_id := private.resolve_manual_intake_org();
  if v_uid is null or v_org_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  if p_quote_id is null
     or p_content_sha256 is null
     or p_content_sha256 !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  select q.service_request_id
    into v_request_id
  from public.quotes as q
  where q.organization_id = v_org_id
    and q.id = p_quote_id;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  perform pg_advisory_xact_lock(
    910008,
    hashtext(v_org_id::text || chr(31) || v_request_id::text)
  );

  select sr.status, sr.archived_at
    into v_status, v_archived
  from public.service_requests as sr
  where sr.organization_id = v_org_id
    and sr.id = v_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  if v_archived is not null then
    return jsonb_build_object('ok', false, 'error_code', 'archived');
  end if;

  select q.content_sha256, q.internal_review_status
    into v_hash, v_review
  from public.quotes as q
  where q.organization_id = v_org_id
    and q.id = p_quote_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  if v_hash is distinct from p_content_sha256 then
    return jsonb_build_object('ok', false, 'error_code', 'hash_mismatch');
  end if;

  if v_review is distinct from 'approved_for_send' then
    return jsonb_build_object('ok', false, 'error_code', 'not_approved_for_send');
  end if;

  -- Stale-version send: newer quote version exists for this request.
  if exists (
    select 1
    from public.quotes as newer
    where newer.organization_id = v_org_id
      and newer.service_request_id = v_request_id
      and newer.version_no > (
        select q2.version_no
        from public.quotes as q2
        where q2.organization_id = v_org_id
          and q2.id = p_quote_id
      )
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'stale_version');
  end if;

  -- Authoritative Phase 9 request state required before PREP delivery contract.
  -- Cancelled/closed/later statuses must not look like a valid delivery candidate.
  if v_status is distinct from 'preparing_offer' then
    return jsonb_build_object('ok', false, 'error_code', 'not_preparing_offer');
  end if;

  -- No trustworthy delivery transport / integration evidence in this PREP.
  -- Do not insert customer_approvals as delivered. Do not set viewed_at.
  -- Do not change service_requests.status to awaiting_customer_approval.
  return jsonb_build_object(
    'ok', false,
    'error_code', 'delivery_unavailable',
    'service_request_status', v_status
  );
end;
$$;

revoke all on function public.deliver_approved_quote_to_customer(uuid, text) from public;
revoke all on function public.deliver_approved_quote_to_customer(uuid, text) from anon;
revoke all on function public.deliver_approved_quote_to_customer(uuid, text) from authenticated;
grant execute on function public.deliver_approved_quote_to_customer(uuid, text) to authenticated;

-- =============================================================================
-- End PHASE 9 PREP — offer review + customer approval foundations
-- =============================================================================
