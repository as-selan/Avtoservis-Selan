-- Local QA correction for Phase 1. Preserve every existing business row.
-- PostgreSQL ARE does not accept the {4,500} repetition bound used in V1.
alter table public.published_fixed_price_cases
  drop constraint published_fixed_price_cases_published_url_check;
alter table public.published_fixed_price_cases
  add constraint published_fixed_price_cases_published_url_check
  check (char_length(published_url) between 12 and 508
    and published_url ~ '^https://[^[:space:]]+$');

-- Record the staff review separately from user-editable case fields. Only the
-- security-definer RPC may insert; a direct UPDATE cannot forge review evidence.
create table public.service_request_intake_reviews (
  organization_id uuid not null,
  service_request_id uuid not null,
  reviewed_by_profile_id uuid not null,
  reviewed_at timestamptz not null default now(),
  primary key (organization_id, service_request_id),
  foreign key (organization_id, service_request_id)
    references public.service_requests(organization_id, id) on delete restrict,
  foreign key (organization_id, reviewed_by_profile_id)
    references public.organization_memberships(organization_id, profile_id) on delete restrict
);
alter table public.service_request_intake_reviews enable row level security;
revoke all on public.service_request_intake_reviews from public, anon, authenticated;
grant select on public.service_request_intake_reviews to authenticated;
create policy service_request_intake_reviews_select_staff
  on public.service_request_intake_reviews for select to authenticated
  using (private.has_org_role(organization_id, array['owner','admin','reception']::text[]));

create or replace function private.guard_reviewed_intake_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'new' and new.status = 'preparing_offer'
     and not exists (
       select 1 from public.service_request_intake_reviews r
       where r.organization_id = new.organization_id and r.service_request_id = new.id
     ) then
    raise exception 'case requires explicit staff intake review' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_reviewed_intake_transition() from public, anon, authenticated;
create trigger service_requests_guard_reviewed_intake_transition
  before update of status on public.service_requests for each row
  execute function private.guard_reviewed_intake_transition();

create or replace function public.review_service_request_intake(p_service_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_org uuid := private.resolve_manual_intake_org();
  v_request public.service_requests%rowtype;
  v_customer public.customers%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_completeness jsonb;
begin
  if v_actor is null or v_org is null or p_service_request_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden_or_invalid');
  end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = v_org and m.profile_id = v_actor and m.is_active
      and m.role in ('owner','admin')
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'owner_required');
  end if;
  perform pg_advisory_xact_lock(910015, hashtext(v_org::text || chr(31) || p_service_request_id::text));
  select * into v_request from public.service_requests sr
    where sr.organization_id = v_org and sr.id = p_service_request_id
      and sr.archived_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'not_found'); end if;
  if v_request.status = 'preparing_offer' and exists (
    select 1 from public.service_request_intake_reviews r
    where r.organization_id = v_org and r.service_request_id = p_service_request_id
  ) then
    return jsonb_build_object('ok', true, 'idempotent', true, 'status', 'preparing_offer');
  end if;
  if v_request.status <> 'new' then
    return jsonb_build_object('ok', false, 'error_code', 'stage_changed');
  end if;
  if v_request.customer_id is null or v_request.vehicle_id is null
     or cardinality(coalesce(v_request.missing_fields, array[]::text[])) > 0
     or exists (
       select 1 from public.preliminary_inspections i
       where i.organization_id = v_org and i.service_request_id = p_service_request_id
         and (i.status <> 'completed' or i.repair_decision = 'not_ordered')
     ) then
    return jsonb_build_object('ok', false, 'error_code', 'incomplete_data');
  end if;
  select * into v_customer from public.customers c
    where c.organization_id = v_org and c.id = v_request.customer_id
      and c.archived_at is null;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'incomplete_data'); end if;
  select * into v_vehicle from public.vehicles v
    where v.organization_id = v_org and v.id = v_request.vehicle_id
      and v.customer_id = v_customer.id and v.archived_at is null;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'incomplete_data'); end if;
  v_completeness := private.compute_intake_completeness(
    v_customer.phone, v_customer.email, v_vehicle.vin, v_vehicle.make, v_vehicle.model
  );
  if coalesce(jsonb_array_length(v_completeness -> 'missing_fields'), 0) > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'incomplete_data');
  end if;
  insert into public.service_request_intake_reviews
    (organization_id, service_request_id, reviewed_by_profile_id)
    values (v_org, p_service_request_id, v_actor);
  update public.service_requests set status = 'preparing_offer', missing_fields = '{}',
    next_action = 'Pripravi ponudbo za pregled.'
    where organization_id = v_org and id = p_service_request_id;
  return jsonb_build_object('ok', true, 'idempotent', false, 'status', 'preparing_offer');
end;
$$;
revoke all on function public.review_service_request_intake(uuid) from public, anon, authenticated;
grant execute on function public.review_service_request_intake(uuid) to authenticated;

-- Replace the broken URL predicate in the existing, otherwise unchanged RPC.
create or replace function public.advance_published_fixed_price_case(
  p_service_request_id uuid, p_action text, p_service_label text default null,
  p_final_price_eur numeric default null, p_published_url text default null,
  p_reference text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_org uuid := private.resolve_manual_intake_org();
  v_role text;
  v_request public.service_requests%rowtype;
  v_row public.published_fixed_price_cases%rowtype;
  v_has_row boolean;
  v_reference text := btrim(coalesce(p_reference,''));
begin
  if v_actor is null or v_org is null or p_service_request_id is null
     or p_action is null
     or p_action not in ('prepare','approve','communicate','accept','reject') then
    return jsonb_build_object('ok',false,'error_code','forbidden_or_invalid');
  end if;
  select m.role into v_role from public.organization_memberships m
    where m.organization_id=v_org and m.profile_id=v_actor and m.is_active
      and m.role in ('owner','admin','reception');
  if not found then return jsonb_build_object('ok',false,'error_code','forbidden'); end if;
  perform pg_advisory_xact_lock(910014,hashtext(v_org::text || chr(31) || p_service_request_id::text));
  select * into v_request from public.service_requests sr
    where sr.organization_id=v_org and sr.id=p_service_request_id and sr.archived_at is null
    for update;
  if not found then return jsonb_build_object('ok',false,'error_code','not_found'); end if;
  select * into v_row from public.published_fixed_price_cases f
    where f.organization_id=v_org and f.service_request_id=p_service_request_id for update;
  v_has_row := found;
  if p_action='prepare' then
    if v_request.status <> 'preparing_offer' or v_request.customer_id is null
       or v_request.vehicle_id is null or cardinality(coalesce(v_request.missing_fields,array[]::text[])) > 0
       or exists (select 1 from public.quotes q where q.organization_id=v_org and q.service_request_id=p_service_request_id)
       or exists (select 1 from public.preliminary_inspections i where i.organization_id=v_org and i.service_request_id=p_service_request_id)
       or char_length(btrim(coalesce(p_service_label,''))) not between 4 and 200
       or p_final_price_eur is null or p_final_price_eur <= 0
       or p_final_price_eur >= 10000000000
       or p_final_price_eur <> trunc(p_final_price_eur,2)
       or p_published_url is null or char_length(p_published_url) not between 12 and 508
       or p_published_url !~ '^https://[^[:space:]]+$'
       or not exists (select 1 from public.customers c join public.vehicles v
         on v.organization_id=c.organization_id and v.customer_id=c.id
         where c.organization_id=v_org and c.id=v_request.customer_id
           and v.id=v_request.vehicle_id and c.archived_at is null and v.archived_at is null) then
      return jsonb_build_object('ok',false,'error_code','not_eligible');
    end if;
    if v_has_row then
      if v_row.service_label=btrim(p_service_label) and v_row.final_price_eur=p_final_price_eur
         and v_row.published_url=btrim(p_published_url) then
        return jsonb_build_object('ok',true,'idempotent',true,'status',v_row.status);
      end if;
      return jsonb_build_object('ok',false,'error_code','already_prepared');
    end if;
    insert into public.published_fixed_price_cases
      (organization_id,service_request_id,service_label,final_price_eur,published_url,prepared_by_profile_id)
      values (v_org,p_service_request_id,btrim(p_service_label),p_final_price_eur,btrim(p_published_url),v_actor);
    return jsonb_build_object('ok',true,'idempotent',false,'status','prepared');
  end if;
  if not v_has_row then return jsonb_build_object('ok',false,'error_code','not_prepared'); end if;
  if p_action='approve' then
    if v_role not in ('owner','admin') then return jsonb_build_object('ok',false,'error_code','owner_required'); end if;
    if v_row.status='approved' then return jsonb_build_object('ok',true,'idempotent',true,'status','approved'); end if;
    if v_row.status <> 'prepared' or v_request.status <> 'preparing_offer' then
      return jsonb_build_object('ok',false,'error_code','stage_changed'); end if;
    update public.published_fixed_price_cases set status='approved',approved_by_profile_id=v_actor,
      approved_at=pg_catalog.now() where id=v_row.id;
    return jsonb_build_object('ok',true,'idempotent',false,'status','approved');
  end if;
  if char_length(v_reference) not between 4 and 200 then
    return jsonb_build_object('ok',false,'error_code','reference_required'); end if;
  if p_action='communicate' then
    if v_row.status='communicated' and v_row.communication_reference=v_reference then
      return jsonb_build_object('ok',true,'idempotent',true,'status','communicated'); end if;
    if v_row.status <> 'approved' or v_request.status <> 'preparing_offer' then
      return jsonb_build_object('ok',false,'error_code','stage_changed'); end if;
    update public.published_fixed_price_cases set status='communicated',
      communication_reference=v_reference,communicated_at=pg_catalog.now() where id=v_row.id;
    update public.service_requests set status='awaiting_customer_approval'
      where organization_id=v_org and id=p_service_request_id;
    return jsonb_build_object('ok',true,'idempotent',false,'status','communicated');
  end if;
  if v_row.status=(case p_action when 'accept' then 'accepted' else 'rejected' end)
     and v_row.decision_reference=v_reference then
    return jsonb_build_object('ok',true,'idempotent',true,'status',v_row.status); end if;
  if v_row.status <> 'communicated' or v_request.status <> 'awaiting_customer_approval' then
    return jsonb_build_object('ok',false,'error_code','stage_changed'); end if;
  update public.published_fixed_price_cases set
    status=(case p_action when 'accept' then 'accepted' else 'rejected' end),
    decision_reference=v_reference,decided_at=pg_catalog.now() where id=v_row.id;
  update public.service_requests set
    status=(case p_action when 'accept' then 'awaiting_slot_selection' else 'declined' end)
    where organization_id=v_org and id=p_service_request_id;
  return jsonb_build_object('ok',true,'idempotent',false,
    'status',(case p_action when 'accept' then 'accepted' else 'rejected' end));
end;
$$;
revoke all on function public.advance_published_fixed_price_case(uuid,text,text,numeric,text,text)
  from public,anon,authenticated;
grant execute on function public.advance_published_fixed_price_case(uuid,text,text,numeric,text,text)
  to authenticated;

-- Serialize even direct quote/inspection INSERTs with fixed-price preparation.
-- The fixed-price RPC already locks the service request before it checks for
-- these rows. This closes the check/insert gap between the two price paths.
create or replace function private.prevent_mixed_price_paths()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.service_requests sr
    where sr.organization_id = new.organization_id
      and sr.id = new.service_request_id for update;
  if not found then raise exception 'service case is missing' using errcode = '23514'; end if;
  if tg_table_name = 'quotes' and exists (
    select 1 from public.published_fixed_price_cases f
      where f.organization_id = new.organization_id and f.service_request_id = new.service_request_id
  ) then raise exception 'published final price already selected' using errcode = '23514'; end if;
  if tg_table_name = 'preliminary_inspections' and exists (
    select 1 from public.published_fixed_price_cases f
      where f.organization_id = new.organization_id and f.service_request_id = new.service_request_id
  ) then raise exception 'published final price already selected' using errcode = '23514'; end if;
  return new;
end;
$$;
revoke all on function private.prevent_mixed_price_paths() from public, anon, authenticated;
