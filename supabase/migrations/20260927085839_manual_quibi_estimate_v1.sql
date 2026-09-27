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
