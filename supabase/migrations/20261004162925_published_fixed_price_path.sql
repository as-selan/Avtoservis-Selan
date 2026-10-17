-- Published final-price exception. This is an internal manual record; it
-- creates neither a Quibi document nor a MyPlanly reservation.
create table public.published_fixed_price_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  service_request_id uuid not null,
  service_label text not null check (char_length(btrim(service_label)) between 4 and 200),
  final_price_eur numeric(12,2) not null check (final_price_eur > 0),
  published_url text not null check (published_url ~ '^https://[^[:space:]]{4,500}$'),
  status text not null default 'prepared'
    check (status in ('prepared','approved','communicated','accepted','rejected')),
  prepared_by_profile_id uuid not null,
  approved_by_profile_id uuid,
  approved_at timestamptz,
  communication_reference text,
  communicated_at timestamptz,
  decision_reference text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, service_request_id),
  foreign key (organization_id, service_request_id)
    references public.service_requests(organization_id,id) on delete restrict,
  foreign key (organization_id, prepared_by_profile_id)
    references public.organization_memberships(organization_id,profile_id) on delete restrict,
  foreign key (organization_id, approved_by_profile_id)
    references public.organization_memberships(organization_id,profile_id) on delete restrict,
  check ((status = 'prepared' and approved_by_profile_id is null and approved_at is null)
    or (status <> 'prepared' and approved_by_profile_id is not null and approved_at is not null)),
  check ((status in ('prepared','approved') and communication_reference is null and communicated_at is null)
    or (status in ('communicated','accepted','rejected')
      and char_length(btrim(communication_reference)) between 4 and 200 and communicated_at is not null)),
  check ((status in ('prepared','approved','communicated') and decision_reference is null and decided_at is null)
    or (status in ('accepted','rejected')
      and char_length(btrim(decision_reference)) between 4 and 200 and decided_at is not null))
);
create trigger published_fixed_price_cases_set_updated_at before update
  on public.published_fixed_price_cases for each row execute function public.set_updated_at();
alter table public.published_fixed_price_cases enable row level security;
revoke all on public.published_fixed_price_cases from public, anon, authenticated;
grant select on public.published_fixed_price_cases to authenticated;
create policy published_fixed_price_cases_select_staff
  on public.published_fixed_price_cases for select to authenticated
  using (private.has_org_role(organization_id, array['owner','admin','reception']::text[]));

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
       or p_published_url is null or p_published_url !~ '^https://[^[:space:]]{4,500}$' then
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

-- Preserve the established Quibi quote path and add an equally evidenced
-- published-price path to the two existing status guards.
create or replace function private.guard_phase9_service_request_status_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
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
    ) then raise exception 'customer approval requires evidenced communication'
      using errcode='23514'; end if;
  end if;
  if new.status='awaiting_slot_selection' then
    if old.status <> 'awaiting_customer_approval' or not (
      exists (select 1 from public.published_fixed_price_cases f
        where f.organization_id=new.organization_id and f.service_request_id=new.id
          and f.status='accepted' and f.decision_reference is not null)
      or exists (select 1 from public.customer_approvals ca join public.quotes q
        on q.organization_id=ca.organization_id and q.id=ca.quote_id
          and q.service_request_id=ca.service_request_id and q.content_sha256=ca.content_sha256
        where ca.organization_id=new.organization_id and ca.service_request_id=new.id
          and ca.delivery_status='delivered' and ca.customer_decision='approved'
          and ca.revoked_at is null and q.internal_review_status='approved_for_send'
          and not exists (select 1 from public.quotes newer
            where newer.organization_id=q.organization_id and newer.service_request_id=q.service_request_id
              and newer.version_no>q.version_no))
    ) then raise exception 'scheduling requires evidenced customer acceptance'
      using errcode='23514'; end if;
  end if;
  return new;
end;
$$;

-- A case may follow one price path only, even under concurrent requests.
create or replace function private.prevent_mixed_price_paths()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='quotes' and exists (
    select 1 from public.published_fixed_price_cases f
      where f.organization_id=new.organization_id and f.service_request_id=new.service_request_id
  ) then raise exception 'published final price already selected' using errcode='23514'; end if;
  if tg_table_name='preliminary_inspections' and exists (
    select 1 from public.published_fixed_price_cases f
      where f.organization_id=new.organization_id and f.service_request_id=new.service_request_id
  ) then raise exception 'published final price already selected' using errcode='23514'; end if;
  return new;
end;
$$;
revoke all on function private.prevent_mixed_price_paths() from public,anon,authenticated;
create trigger quotes_prevent_mixed_price_path before insert on public.quotes
  for each row execute function private.prevent_mixed_price_paths();
create trigger inspections_prevent_mixed_price_path before insert on public.preliminary_inspections
  for each row execute function private.prevent_mixed_price_paths();

-- Existing inspection RPC locks the request but previously did not check its
-- lifecycle stage. Guard direct and RPC writes alike so a closed case cannot
-- acquire a new inspection, while an existing inspection can record the later
-- actual repair decision after the customer's quote response.
create or replace function private.guard_preliminary_inspection_case_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select sr.status into v_status from public.service_requests sr
    where sr.organization_id = new.organization_id
      and sr.id = new.service_request_id and sr.archived_at is null
    for update;
  if not found then raise exception 'active service case required for inspection'
    using errcode = '23514'; end if;
  if tg_op = 'INSERT' then
    if v_status not in ('new','preparing_offer') then
      raise exception 'case stage does not allow a new inspection' using errcode = '23514';
    end if;
  elsif new.status is distinct from old.status and new.status = 'completed' then
    if v_status not in ('new','preparing_offer') then
      raise exception 'case stage does not allow inspection completion' using errcode = '23514';
    end if;
  elsif new.repair_decision is distinct from old.repair_decision then
    if v_status not in ('new','preparing_offer','awaiting_customer_approval',
                        'awaiting_slot_selection','declined') then
      raise exception 'case stage does not allow repair decision' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_preliminary_inspection_case_stage()
  from public,anon,authenticated;
create trigger inspections_guard_case_stage before insert or update
  on public.preliminary_inspections for each row
  execute function private.guard_preliminary_inspection_case_stage();
