-- Preliminary inspection belongs to the same service case. The billing state
-- is derived from the actual repair decision; no price or invoice is invented.
create table public.preliminary_inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  service_request_id uuid not null,
  status text not null default 'requested'
    check (status in ('requested','completed')),
  findings text,
  completed_at timestamptz,
  repair_decision text not null default 'pending'
    check (repair_decision in ('pending','ordered','not_ordered')),
  decided_at timestamptz,
  created_by_profile_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, service_request_id),
  foreign key (organization_id, service_request_id)
    references public.service_requests(organization_id,id) on delete restrict,
  foreign key (organization_id, created_by_profile_id)
    references public.organization_memberships(organization_id,profile_id) on delete restrict,
  check ((status = 'requested' and findings is null and completed_at is null)
    or (status = 'completed' and findings is not null
      and char_length(btrim(findings)) between 4 and 2000
      and completed_at is not null)),
  check ((repair_decision = 'pending' and decided_at is null)
    or (repair_decision <> 'pending' and status = 'completed' and decided_at is not null))
);
create trigger preliminary_inspections_set_updated_at before update
  on public.preliminary_inspections for each row execute function public.set_updated_at();
alter table public.preliminary_inspections enable row level security;
revoke all on public.preliminary_inspections from public, anon, authenticated;
grant select on public.preliminary_inspections to authenticated;
create policy preliminary_inspections_select_advisor_plus
  on public.preliminary_inspections for select to authenticated
  using (private.has_org_role(organization_id,
    array['owner','admin','reception']::text[]));

create or replace function public.record_preliminary_inspection(
  p_service_request_id uuid, p_action text, p_findings text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_org uuid; v_row public.preliminary_inspections%rowtype;
begin
  v_org := private.resolve_manual_intake_org();
  if v_actor is null or v_org is null or p_service_request_id is null
     or p_action is null
     or p_action not in ('request','complete','repair_ordered','repair_not_ordered') then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden_or_invalid');
  end if;
  if not exists (select 1 from public.organization_memberships m
    where m.organization_id = v_org and m.profile_id = v_actor and m.is_active
      and m.role in ('owner','admin','reception')) then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;
  perform pg_advisory_xact_lock(910012,
    hashtext(v_org::text || chr(31) || p_service_request_id::text));
  perform 1 from public.service_requests sr
    where sr.organization_id = v_org and sr.id = p_service_request_id
      and sr.archived_at is null for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;
  select * into v_row from public.preliminary_inspections pi
    where pi.organization_id = v_org and pi.service_request_id = p_service_request_id
    for update;
  if p_action = 'request' then
    if found then return jsonb_build_object('ok', true, 'idempotent', true); end if;
    insert into public.preliminary_inspections
      (organization_id, service_request_id, created_by_profile_id)
      values (v_org, p_service_request_id, v_actor);
    return jsonb_build_object('ok', true, 'idempotent', false);
  end if;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'inspection_not_requested'); end if;
  if p_action = 'complete' then
    if char_length(btrim(coalesce(p_findings,''))) not between 4 and 2000 then
      return jsonb_build_object('ok', false, 'error_code', 'findings_required');
    end if;
    if v_row.status = 'completed' then
      if v_row.findings = btrim(p_findings) then
        return jsonb_build_object('ok', true, 'idempotent', true);
      end if;
      return jsonb_build_object('ok', false, 'error_code', 'already_completed');
    end if;
    update public.preliminary_inspections pi set status = 'completed',
      findings = btrim(p_findings), completed_at = pg_catalog.now()
      where pi.organization_id = v_org and pi.service_request_id = p_service_request_id;
    return jsonb_build_object('ok', true, 'idempotent', false);
  end if;
  if v_row.status <> 'completed' then
    return jsonb_build_object('ok', false, 'error_code', 'inspection_not_completed');
  end if;
  if v_row.repair_decision <> 'pending' then
    if v_row.repair_decision = (case p_action when 'repair_ordered' then 'ordered' else 'not_ordered' end) then
      return jsonb_build_object('ok', true, 'idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'error_code', 'decision_already_recorded');
  end if;
  update public.preliminary_inspections pi set
    repair_decision = case p_action when 'repair_ordered' then 'ordered' else 'not_ordered' end,
    decided_at = pg_catalog.now()
    where pi.organization_id = v_org and pi.service_request_id = p_service_request_id;
  return jsonb_build_object('ok', true, 'idempotent', false);
end;
$$;
revoke all on function public.record_preliminary_inspection(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.record_preliminary_inspection(uuid,text,text)
  to authenticated;
