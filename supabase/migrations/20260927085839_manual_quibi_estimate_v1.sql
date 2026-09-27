-- A verified server read may register the ID and digest of an existing Quibi
-- estimate. No document contents, prices or Quibi write credentials are stored.
-- Only the application service role may call this after a live read and
-- ownership check; browser/authenticated clients cannot manufacture evidence.
create or replace function public.register_manual_quibi_estimate(
  p_organization_id uuid,
  p_service_request_id uuid,
  p_quibi_customer_id text,
  p_external_id text,
  p_content_sha256 text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_prep_id uuid;
  v_latest public.quotes%rowtype;
  v_quote_id uuid;
  v_version integer;
begin
  if p_organization_id is null or p_service_request_id is null or p_actor_id is null
     or p_quibi_customer_id !~ '^[0-9]+$'
     or p_external_id !~ '^[0-9]+$'
     or p_content_sha256 !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid');
  end if;

  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id and m.profile_id = p_actor_id
      and m.is_active and m.role in ('owner', 'admin', 'reception')
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  -- Serialize both the external document identity and this case's versions.
  perform pg_advisory_xact_lock(910010, hashtext(p_organization_id::text || ':' || p_external_id));
  perform pg_advisory_xact_lock(910011, hashtext(p_organization_id::text || ':' || p_service_request_id::text));

  select sr.customer_id into v_customer_id
  from public.service_requests sr
  where sr.organization_id = p_organization_id and sr.id = p_service_request_id
    and sr.archived_at is null and sr.status = 'preparing_offer'
  for update;
  if not found or v_customer_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'case_not_ready');
  end if;

  select prep.id into v_prep_id
  from public.offer_preparations prep
  where prep.organization_id = p_organization_id
    and prep.service_request_id = p_service_request_id
    and prep.status = 'ready_for_provider';
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'prep_not_ready');
  end if;

  if not exists (
    select 1 from public.integration_links l
    where l.organization_id = p_organization_id and l.provider = 'quibi'
      and l.entity_type = 'customer' and l.entity_id = v_customer_id
      and l.external_id = p_quibi_customer_id
      and l.sync_status in ('ok', 'never_checked')
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'customer_link_unavailable');
  end if;

  if exists (
    select 1 from public.quotes q
    where q.organization_id = p_organization_id
      and q.evidence_kind = 'quibi_manual_estimate'
      and q.evidence_payload ->> 'external_id' = p_external_id
      and q.service_request_id <> p_service_request_id
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'document_already_linked');
  end if;

  select q.* into v_latest
  from public.quotes q
  where q.organization_id = p_organization_id
    and q.service_request_id = p_service_request_id
  order by q.version_no desc limit 1;

  if found and v_latest.evidence_kind = 'quibi_manual_estimate'
     and v_latest.evidence_payload ->> 'external_id' = p_external_id
     and v_latest.content_sha256 = p_content_sha256 then
    return jsonb_build_object('ok', true, 'quote_id', v_latest.id,
      'version_no', v_latest.version_no, 'idempotent', true);
  end if;

  v_version := coalesce(v_latest.version_no, 0) + 1;
  insert into public.quotes (
    organization_id, service_request_id, offer_preparation_id,
    version_no, content_sha256, evidence_kind, evidence_payload,
    created_by_profile_id
  ) values (
    p_organization_id, p_service_request_id, v_prep_id,
    v_version, p_content_sha256, 'quibi_manual_estimate',
    jsonb_build_object('external_id', p_external_id, 'customer_external_id', p_quibi_customer_id),
    p_actor_id
  ) returning id into v_quote_id;

  return jsonb_build_object('ok', true, 'quote_id', v_quote_id,
    'version_no', v_version, 'idempotent', false);
end;
$$;

revoke all on function public.register_manual_quibi_estimate(uuid, uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.register_manual_quibi_estimate(uuid, uuid, text, text, text, uuid)
  to service_role;

-- Earlier PREP review RPCs did not verify a live Quibi document. They must no
-- longer be callable directly by browser tokens after real evidence exists.
revoke execute on function public.approve_quote_for_send(uuid, text) from public, anon, authenticated;
revoke execute on function public.reject_quote_for_revision(uuid, text) from public, anon, authenticated;

create or replace function public.review_verified_manual_quote(
  p_organization_id uuid,
  p_quote_id uuid,
  p_content_sha256 text,
  p_actor_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
  v_status text;
  v_target text;
begin
  if p_decision not in ('approve', 'reject')
     or p_content_sha256 !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid');
  end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id and m.profile_id = p_actor_id
      and m.is_active and m.role in ('owner', 'admin')
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  select q.* into v_quote from public.quotes q
  where q.organization_id = p_organization_id and q.id = p_quote_id;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'not_found'); end if;
  perform pg_advisory_xact_lock(910008, hashtext(p_organization_id::text || chr(31) || v_quote.service_request_id::text));
  select q.* into v_quote from public.quotes q
  where q.organization_id = p_organization_id and q.id = p_quote_id for update;
  select sr.status into v_status from public.service_requests sr
  where sr.organization_id = p_organization_id and sr.id = v_quote.service_request_id
    and sr.archived_at is null for update;
  if v_status is distinct from 'preparing_offer'
     or v_quote.evidence_kind <> 'quibi_manual_estimate'
     or v_quote.content_sha256 <> p_content_sha256
     or not exists (
       select 1 from public.offer_preparations op
       where op.organization_id = p_organization_id and op.id = v_quote.offer_preparation_id
         and op.status = 'ready_for_provider'
     ) then
    return jsonb_build_object('ok', false, 'error_code', 'stale_or_invalid');
  end if;
  if exists (
    select 1 from public.quotes newer
    where newer.organization_id = p_organization_id
      and newer.service_request_id = v_quote.service_request_id
      and newer.version_no > v_quote.version_no
  ) then return jsonb_build_object('ok', false, 'error_code', 'stale_version'); end if;

  v_target := case when p_decision = 'approve' then 'approved_for_send'
    else 'rejected_for_revision' end;
  if v_quote.internal_review_status = v_target then
    return jsonb_build_object('ok', true, 'quote_id', p_quote_id, 'review_status', v_target, 'idempotent', true);
  end if;
  if v_quote.internal_review_status <> 'unreviewed' then
    return jsonb_build_object('ok', false, 'error_code', 'already_reviewed');
  end if;
  update public.quotes q set internal_review_status = v_target,
    reviewed_at = pg_catalog.now(), reviewed_by_profile_id = p_actor_id
  where q.organization_id = p_organization_id and q.id = p_quote_id;
  return jsonb_build_object('ok', true, 'quote_id', p_quote_id, 'review_status', v_target, 'idempotent', false);
end;
$$;

revoke all on function public.review_verified_manual_quote(uuid, uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.review_verified_manual_quote(uuid, uuid, text, uuid, text)
  to service_role;

-- A staff attestation is an audit record of a completed manual delivery, not
-- an automatic transport receipt. It is bound to the exact reviewed version.
alter table public.customer_approvals
  add column delivery_evidence_reference text,
  add column decision_evidence_reference text;
alter table public.customer_approvals
  add constraint customer_approvals_delivery_reference_check
    check (delivery_evidence_reference is null or
      char_length(btrim(delivery_evidence_reference)) between 4 and 200),
  add constraint customer_approvals_decision_reference_check
    check (decision_evidence_reference is null or
      char_length(btrim(decision_evidence_reference)) between 4 and 200),
  add constraint customer_approvals_delivery_reference_consistent
    check ((delivery_status = 'not_delivered' and delivery_evidence_reference is null)
      or (delivery_status = 'delivered' and delivery_evidence_reference is not null)),
  add constraint customer_approvals_decision_reference_consistent
    check ((customer_decision is null and decision_evidence_reference is null)
      or (customer_decision is not null and decision_evidence_reference is not null));
grant select (delivery_evidence_reference, decision_evidence_reference)
  on public.customer_approvals to authenticated;

create or replace function private.prevent_customer_approval_evidence_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.organization_id is distinct from new.organization_id
     or old.service_request_id is distinct from new.service_request_id
     or old.quote_id is distinct from new.quote_id
     or old.content_sha256 is distinct from new.content_sha256
     or old.created_by_profile_id is distinct from new.created_by_profile_id
     or old.created_at is distinct from new.created_at
     or old.viewed_at is distinct from new.viewed_at then
    raise exception 'customer approval binding fields are immutable' using errcode = '23514';
  end if;
  if old.delivery_status = 'delivered' and (
    old.delivery_status is distinct from new.delivery_status or
    old.delivered_at is distinct from new.delivered_at or
    old.delivery_channel is distinct from new.delivery_channel or
    old.delivery_evidence_reference is distinct from new.delivery_evidence_reference
  ) then
    raise exception 'manual delivery evidence is immutable' using errcode = '23514';
  end if;
  if old.customer_decision is not null and (
    old.customer_decision is distinct from new.customer_decision or
    old.decided_at is distinct from new.decided_at or
    old.decision_evidence_reference is distinct from new.decision_evidence_reference
  ) then
    raise exception 'customer decision evidence is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.record_manual_estimate_delivery(
  p_organization_id uuid, p_quote_id uuid, p_content_sha256 text,
  p_actor_id uuid, p_channel text, p_reference text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_quote public.quotes%rowtype; v_status text; v_approval public.customer_approvals%rowtype;
begin
  if p_channel not in ('email', 'sms', 'in_person', 'other')
     or char_length(btrim(coalesce(p_reference, ''))) not between 4 and 200
     or p_content_sha256 !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid');
  end if;
  if not exists (select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id and m.profile_id = p_actor_id
      and m.is_active and m.role in ('owner','admin','reception')) then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;
  select * into v_quote from public.quotes q
    where q.organization_id = p_organization_id and q.id = p_quote_id;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'not_found'); end if;
  perform pg_advisory_xact_lock(910008,
    hashtext(p_organization_id::text || chr(31) || v_quote.service_request_id::text));
  select * into v_quote from public.quotes q
    where q.organization_id = p_organization_id and q.id = p_quote_id for update;
  select sr.status into v_status from public.service_requests sr
    where sr.organization_id = p_organization_id and sr.id = v_quote.service_request_id
      and sr.archived_at is null for update;
  if v_quote.evidence_kind <> 'quibi_manual_estimate'
     or v_quote.content_sha256 <> p_content_sha256
     or v_quote.internal_review_status <> 'approved_for_send'
     or v_status not in ('preparing_offer','awaiting_customer_approval')
     or exists (select 1 from public.quotes newer
       where newer.organization_id = p_organization_id
         and newer.service_request_id = v_quote.service_request_id
         and newer.version_no > v_quote.version_no) then
    return jsonb_build_object('ok', false, 'error_code', 'stale_or_invalid');
  end if;
  select * into v_approval from public.customer_approvals ca
    where ca.organization_id = p_organization_id and ca.quote_id = p_quote_id for update;
  if found then
    if v_approval.delivery_status = 'delivered'
       and v_approval.delivery_channel = p_channel
       and v_approval.delivery_evidence_reference = btrim(p_reference) then
      return jsonb_build_object('ok', true, 'idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'error_code', 'already_delivered');
  end if;
  if v_status <> 'preparing_offer' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_status');
  end if;
  insert into public.customer_approvals (
    organization_id, service_request_id, quote_id, content_sha256,
    delivery_status, delivered_at, delivery_channel, delivery_evidence_reference,
    created_by_profile_id
  ) values (
    p_organization_id, v_quote.service_request_id, p_quote_id, p_content_sha256,
    'delivered', pg_catalog.now(), p_channel, btrim(p_reference), p_actor_id
  );
  update public.service_requests sr set status = 'awaiting_customer_approval'
    where sr.organization_id = p_organization_id and sr.id = v_quote.service_request_id;
  return jsonb_build_object('ok', true, 'idempotent', false);
end;
$$;
revoke all on function public.record_manual_estimate_delivery(uuid,uuid,text,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.record_manual_estimate_delivery(uuid,uuid,text,uuid,text,text)
  to service_role;

-- The customer decision refers to the delivered quote version. An accepted
-- quote may enter manual scheduling; rejection returns the case to revision.
create or replace function private.guard_phase9_service_request_status_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is not distinct from new.status then return new; end if;
  if new.status = 'awaiting_customer_approval' then
    if old.status <> 'preparing_offer' or not exists (
      select 1 from public.customer_approvals ca join public.quotes q
        on q.organization_id = ca.organization_id and q.id = ca.quote_id
       and q.service_request_id = ca.service_request_id
       and q.content_sha256 = ca.content_sha256
      where ca.organization_id = new.organization_id and ca.service_request_id = new.id
        and ca.delivery_status = 'delivered' and ca.customer_decision is null
        and ca.revoked_at is null and q.internal_review_status = 'approved_for_send'
        and not exists (select 1 from public.quotes newer
          where newer.organization_id = q.organization_id
            and newer.service_request_id = q.service_request_id
            and newer.version_no > q.version_no)
    ) then raise exception 'awaiting_customer_approval requires delivered approved latest quote'
      using errcode = '23514'; end if;
  end if;
  if new.status = 'awaiting_slot_selection' then
    if old.status <> 'awaiting_customer_approval' or not exists (
      select 1 from public.customer_approvals ca join public.quotes q
        on q.organization_id = ca.organization_id and q.id = ca.quote_id
       and q.service_request_id = ca.service_request_id
       and q.content_sha256 = ca.content_sha256
      where ca.organization_id = new.organization_id and ca.service_request_id = new.id
        and ca.delivery_status = 'delivered' and ca.customer_decision = 'approved'
        and ca.revoked_at is null and q.internal_review_status = 'approved_for_send'
        and not exists (select 1 from public.quotes newer
          where newer.organization_id = q.organization_id
            and newer.service_request_id = q.service_request_id
            and newer.version_no > q.version_no)
    ) then raise exception 'scheduling requires customer approval of delivered latest quote'
      using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.record_manual_estimate_decision(
  p_organization_id uuid, p_quote_id uuid, p_actor_id uuid,
  p_decision text, p_reference text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_quote public.quotes%rowtype; v_approval public.customer_approvals%rowtype; v_status text;
begin
  if p_decision not in ('approved','rejected')
     or char_length(btrim(coalesce(p_reference, ''))) not between 4 and 200 then
    return jsonb_build_object('ok', false, 'error_code', 'invalid');
  end if;
  if not exists (select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id and m.profile_id = p_actor_id
      and m.is_active and m.role in ('owner','admin','reception')) then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;
  select * into v_quote from public.quotes q
    where q.organization_id = p_organization_id and q.id = p_quote_id;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'not_found'); end if;
  perform pg_advisory_xact_lock(910008,
    hashtext(p_organization_id::text || chr(31) || v_quote.service_request_id::text));
  select * into v_quote from public.quotes q
    where q.organization_id = p_organization_id and q.id = p_quote_id for update;
  select sr.status into v_status from public.service_requests sr
    where sr.organization_id = p_organization_id and sr.id = v_quote.service_request_id
      and sr.archived_at is null for update;
  select * into v_approval from public.customer_approvals ca
    where ca.organization_id = p_organization_id and ca.quote_id = p_quote_id for update;
  if not found or v_approval.delivery_status <> 'delivered'
     or v_approval.revoked_at is not null
     or v_quote.internal_review_status <> 'approved_for_send'
     or exists (select 1 from public.quotes newer
       where newer.organization_id = p_organization_id
         and newer.service_request_id = v_quote.service_request_id
         and newer.version_no > v_quote.version_no) then
    return jsonb_build_object('ok', false, 'error_code', 'stale_or_invalid');
  end if;
  if v_approval.customer_decision is not null then
    if v_approval.customer_decision = p_decision
       and v_approval.decision_evidence_reference = btrim(p_reference) then
      return jsonb_build_object('ok', true, 'idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'error_code', 'already_decided');
  end if;
  if v_status <> 'awaiting_customer_approval' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_status');
  end if;
  update public.customer_approvals ca set customer_decision = p_decision,
    decided_at = pg_catalog.now(), decision_evidence_reference = btrim(p_reference)
    where ca.organization_id = p_organization_id and ca.quote_id = p_quote_id;
  update public.service_requests sr set status = case p_decision
    when 'approved' then 'awaiting_slot_selection' else 'preparing_offer' end
    where sr.organization_id = p_organization_id and sr.id = v_quote.service_request_id;
  return jsonb_build_object('ok', true, 'idempotent', false);
end;
$$;
revoke all on function public.record_manual_estimate_decision(uuid,uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.record_manual_estimate_decision(uuid,uuid,uuid,text,text)
  to service_role;
