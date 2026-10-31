-- Exact effective DDL installed on Supabase project verxxsjbewmkgoxwqvxo.
-- Registered in Supabase schema_migrations as version 20261012171839,
-- name allow_recorded_customer_decision_without_delivery.
-- DO NOT APPLY AGAIN to the existing database; this file synchronizes the repo.

ALTER TABLE public.customer_approvals
  DROP CONSTRAINT IF EXISTS customer_approvals_decision_requires_delivery;

CREATE OR REPLACE FUNCTION public.record_manual_estimate_decision(p_organization_id uuid, p_quote_id uuid, p_actor_id uuid, p_decision text, p_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quote public.quotes%rowtype;
  v_approval public.customer_approvals%rowtype;
  v_approval_found boolean;
  v_case_status text;
  v_case_archived timestamptz;
  v_reference text := btrim(coalesce(p_reference, ''));
begin
  if p_organization_id is null or p_quote_id is null or p_actor_id is null
     or p_decision is null or p_decision not in ('approved','rejected')
     or char_length(v_reference) not between 4 and 200 then
    return jsonb_build_object('ok', false, 'error_code', 'invalid');
  end if;

  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id and m.profile_id = p_actor_id
      and m.is_active and m.role in ('owner','admin','reception')
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  select q.* into v_quote
  from public.quotes q
  where q.organization_id = p_organization_id and q.id = p_quote_id;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  perform pg_advisory_xact_lock(
    910008,
    hashtext(p_organization_id::text || chr(31) || v_quote.service_request_id::text)
  );

  select q.* into v_quote
  from public.quotes q
  where q.organization_id = p_organization_id and q.id = p_quote_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  select sr.status, sr.archived_at
    into v_case_status, v_case_archived
  from public.service_requests sr
  where sr.organization_id = p_organization_id
    and sr.id = v_quote.service_request_id
  for update;
  if not found or v_case_archived is not null then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  if v_quote.evidence_kind is distinct from 'quibi_manual_estimate'
     or v_quote.internal_review_status is distinct from 'approved_for_send'
     or v_quote.content_sha256 !~ '^[0-9a-f]{64}$'
     or not exists (
       select 1 from public.offer_preparations prep
       where prep.organization_id = p_organization_id
         and prep.id = v_quote.offer_preparation_id
         and prep.status = 'ready_for_provider'
     )
     or exists (
       select 1 from public.quotes newer
       where newer.organization_id = p_organization_id
         and newer.service_request_id = v_quote.service_request_id
         and newer.version_no > v_quote.version_no
     ) then
    return jsonb_build_object('ok', false, 'error_code', 'stale_or_invalid');
  end if;

  select ca.* into v_approval
  from public.customer_approvals ca
  where ca.organization_id = p_organization_id and ca.quote_id = p_quote_id
  for update;
  v_approval_found := found;

  if v_approval_found then
    if v_approval.revoked_at is not null
       or v_approval.service_request_id is distinct from v_quote.service_request_id
       or v_approval.content_sha256 is distinct from v_quote.content_sha256 then
      return jsonb_build_object('ok', false, 'error_code', 'stale_or_invalid');
    end if;
    if v_approval.customer_decision is not null then
      if v_approval.customer_decision = p_decision
         and v_approval.decision_evidence_reference = v_reference then
        return jsonb_build_object('ok', true, 'idempotent', true);
      end if;
      return jsonb_build_object('ok', false, 'error_code', 'already_decided');
    end if;
  end if;

  if v_case_status not in ('preparing_offer','awaiting_customer_approval') then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_status');
  end if;

  if v_approval_found then
    update public.customer_approvals ca
    set customer_decision = p_decision,
        decided_at = pg_catalog.now(),
        decision_evidence_reference = v_reference
    where ca.organization_id = p_organization_id and ca.quote_id = p_quote_id;
  else
    insert into public.customer_approvals (
      organization_id, service_request_id, quote_id, content_sha256,
      delivery_status, customer_decision, decided_at,
      decision_evidence_reference, created_by_profile_id
    ) values (
      p_organization_id, v_quote.service_request_id, p_quote_id, v_quote.content_sha256,
      'not_delivered', p_decision, pg_catalog.now(),
      v_reference, p_actor_id
    );
  end if;

  update public.service_requests sr
  set status = case p_decision
    when 'approved' then 'awaiting_slot_selection'
    else 'preparing_offer' end
  where sr.organization_id = p_organization_id
    and sr.id = v_quote.service_request_id;

  return jsonb_build_object('ok', true, 'idempotent', false);
end;
$function$;

CREATE OR REPLACE FUNCTION private.guard_phase9_service_request_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.status is not distinct from new.status then return new; end if;

  if new.status='awaiting_customer_approval' then
    if old.status <> 'preparing_offer' or not (
      exists (select 1 from public.published_fixed_price_cases f
        where f.organization_id=new.organization_id and f.service_request_id=new.id
          and f.status='communicated' and f.communication_reference is not null)
      or exists (select 1 from public.customer_approvals ca join public.quotes q
        on q.organization_id=ca.organization_id and q.id=ca.quote_id
          and q.service_request_id=ca.service_request_id and q.content_sha256=ca.content_sha256
        where ca.organization_id=new.organization_id and ca.service_request_id=new.id
          and ca.delivery_status='delivered' and ca.customer_decision is null
          and ca.revoked_at is null and q.internal_review_status='approved_for_send'
          and not exists (select 1 from public.quotes newer
            where newer.organization_id=q.organization_id and newer.service_request_id=q.service_request_id
              and newer.version_no>q.version_no))
    ) then
      raise exception 'customer approval requires evidenced communication' using errcode='23514';
    end if;
  end if;

  if new.status='awaiting_slot_selection' then
    if old.status not in ('awaiting_customer_approval','preparing_offer') or not (
      (old.status='awaiting_customer_approval' and exists (
        select 1 from public.published_fixed_price_cases f
        where f.organization_id=new.organization_id and f.service_request_id=new.id
          and f.status='accepted' and f.decision_reference is not null
      ))
      or exists (
        select 1 from public.customer_approvals ca join public.quotes q
          on q.organization_id=ca.organization_id and q.id=ca.quote_id
            and q.service_request_id=ca.service_request_id and q.content_sha256=ca.content_sha256
        where ca.organization_id=new.organization_id and ca.service_request_id=new.id
          and ca.customer_decision='approved'
          and ca.decided_at is not null
          and char_length(btrim(ca.decision_evidence_reference)) between 4 and 200
          and ca.revoked_at is null
          and q.evidence_kind='quibi_manual_estimate'
          and q.internal_review_status='approved_for_send'
          and not exists (select 1 from public.quotes newer
            where newer.organization_id=q.organization_id and newer.service_request_id=q.service_request_id
              and newer.version_no>q.version_no)
      )
    ) then
      raise exception 'scheduling requires evidenced customer acceptance' using errcode='23514';
    end if;
  end if;
  return new;
end;
$function$;
