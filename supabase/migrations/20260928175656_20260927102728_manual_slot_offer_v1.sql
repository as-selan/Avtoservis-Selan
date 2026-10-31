-- Three manually checked options are proposals only. No hold or MyPlanly API
-- synchronization is claimed. A confirmed internal appointment requires a
-- separate reference to an actual booking made by staff in MyPlanly.
create table public.manual_slot_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  service_request_id uuid not null,
  appointment_type text not null check (appointment_type in ('diagnosis','service')),
  version_no integer not null check (version_no > 0),
  slot_1 timestamptz not null,
  slot_2 timestamptz not null,
  slot_3 timestamptz not null,
  status text not null default 'proposed'
    check (status in ('proposed','offered','selected','confirmed','cancelled')),
  availability_reference text not null check (char_length(btrim(availability_reference)) between 4 and 200),
  offer_reference text,
  selected_slot smallint check (selected_slot between 1 and 3),
  response_reference text,
  booking_reference text,
  appointment_id uuid,
  cancellation_reference text,
  created_by_profile_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,service_request_id,appointment_type,version_no),
  unique (organization_id,appointment_id),
  foreign key (organization_id,service_request_id)
    references public.service_requests(organization_id,id) on delete restrict,
  foreign key (organization_id,appointment_id)
    references public.appointments(organization_id,id) on delete restrict,
  foreign key (organization_id,created_by_profile_id)
    references public.organization_memberships(organization_id,profile_id) on delete restrict,
  check (slot_1 <> slot_2 and slot_1 <> slot_3 and slot_2 <> slot_3),
  check (offer_reference is null or char_length(btrim(offer_reference)) between 4 and 200),
  check (response_reference is null or char_length(btrim(response_reference)) between 4 and 200),
  check (booking_reference is null or char_length(btrim(booking_reference)) between 4 and 200),
  check (cancellation_reference is null or char_length(btrim(cancellation_reference)) between 4 and 200),
  check (status = 'proposed' or offer_reference is not null or status = 'cancelled'),
  check (status not in ('selected','confirmed') or
    (selected_slot is not null and response_reference is not null)),
  check (status <> 'confirmed' or
    (booking_reference is not null and appointment_id is not null)),
  check (status <> 'cancelled' or cancellation_reference is not null)
);
create unique index manual_slot_offers_one_active
  on public.manual_slot_offers(organization_id,service_request_id,appointment_type)
  where status <> 'cancelled';
create trigger manual_slot_offers_set_updated_at before update
  on public.manual_slot_offers for each row execute function public.set_updated_at();
alter table public.manual_slot_offers enable row level security;
revoke all on public.manual_slot_offers from public,anon,authenticated;
grant select on public.manual_slot_offers to authenticated;
create policy manual_slot_offers_select_advisor_plus
  on public.manual_slot_offers for select to authenticated
  using (private.has_org_role(organization_id,array['owner','admin','reception']::text[]));

-- Direct browser writes to appointment foundation could manufacture a
-- confirmed booking without manual evidence. Staff now use the guarded RPC.
revoke insert (organization_id,service_request_id,customer_id,vehicle_id,status,
  appointment_type,starts_at,ends_at,hold_expires_at,notes,cancelled_at)
  on public.appointments from authenticated;
revoke update (status,appointment_type,starts_at,ends_at,hold_expires_at,notes,cancelled_at)
  on public.appointments from authenticated;

create or replace function public.propose_manual_slots(
  p_service_request_id uuid, p_appointment_type text,
  p_slot_1 timestamptz, p_slot_2 timestamptz, p_slot_3 timestamptz,
  p_availability_reference text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_org uuid; v_request public.service_requests%rowtype;
  v_offer public.manual_slot_offers%rowtype; v_version integer;
begin
  v_org := private.resolve_manual_intake_org();
  if v_actor is null or v_org is null or p_service_request_id is null
     or p_appointment_type is null or p_appointment_type not in ('diagnosis','service')
     or p_slot_1 is null or p_slot_2 is null or p_slot_3 is null
     or p_slot_1 <= pg_catalog.now() or p_slot_2 <= pg_catalog.now() or p_slot_3 <= pg_catalog.now()
     or p_slot_1 = p_slot_2 or p_slot_1 = p_slot_3 or p_slot_2 = p_slot_3
     or char_length(btrim(coalesce(p_availability_reference,''))) not between 4 and 200 then
    return jsonb_build_object('ok',false,'error_code','invalid');
  end if;
  perform pg_advisory_xact_lock(910013,
    hashtext(v_org::text || chr(31) || p_service_request_id::text || ':' || p_appointment_type));
  select * into v_request from public.service_requests sr
    where sr.organization_id = v_org and sr.id = p_service_request_id
      and sr.archived_at is null for update;
  if not found or v_request.customer_id is null then
    return jsonb_build_object('ok',false,'error_code','case_not_ready');
  end if;
  if (p_appointment_type = 'service' and v_request.status <> 'awaiting_slot_selection')
     or (p_appointment_type = 'diagnosis' and not exists (
       select 1 from public.preliminary_inspections pi
       where pi.organization_id = v_org and pi.service_request_id = p_service_request_id
         and pi.status = 'requested')) then
    return jsonb_build_object('ok',false,'error_code','stage_not_ready');
  end if;
  select * into v_offer from public.manual_slot_offers o
    where o.organization_id = v_org and o.service_request_id = p_service_request_id
      and o.appointment_type = p_appointment_type and o.status <> 'cancelled'
    for update;
  if found then
    if v_offer.slot_1 = p_slot_1 and v_offer.slot_2 = p_slot_2 and v_offer.slot_3 = p_slot_3
       and v_offer.availability_reference = btrim(p_availability_reference) then
      return jsonb_build_object('ok',true,'offer_id',v_offer.id,'idempotent',true);
    end if;
    return jsonb_build_object('ok',false,'error_code','active_offer_exists');
  end if;
  select coalesce(max(o.version_no),0)+1 into v_version from public.manual_slot_offers o
    where o.organization_id = v_org and o.service_request_id = p_service_request_id
      and o.appointment_type = p_appointment_type;
  insert into public.manual_slot_offers(organization_id,service_request_id,appointment_type,
    version_no,slot_1,slot_2,slot_3,availability_reference,created_by_profile_id)
    values(v_org,p_service_request_id,p_appointment_type,v_version,
      p_slot_1,p_slot_2,p_slot_3,btrim(p_availability_reference),v_actor)
    returning * into v_offer;
  return jsonb_build_object('ok',true,'offer_id',v_offer.id,'idempotent',false);
end;
$$;
revoke all on function public.propose_manual_slots(uuid,text,timestamptz,timestamptz,timestamptz,text)
  from public,anon,authenticated;
grant execute on function public.propose_manual_slots(uuid,text,timestamptz,timestamptz,timestamptz,text)
  to authenticated;

create or replace function public.advance_manual_slot_offer(
  p_offer_id uuid, p_action text, p_reference text, p_selected_slot integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_org uuid; v_offer public.manual_slot_offers%rowtype;
  v_request public.service_requests%rowtype; v_start timestamptz; v_appointment_id uuid;
begin
  v_org := private.resolve_manual_intake_org();
  if v_actor is null or v_org is null or p_offer_id is null or p_action is null
     or p_action not in ('send','select','confirm','cancel')
     or char_length(btrim(coalesce(p_reference,''))) not between 4 and 200 then
    return jsonb_build_object('ok',false,'error_code','invalid');
  end if;
  select * into v_offer from public.manual_slot_offers o
    where o.organization_id = v_org and o.id = p_offer_id;
  if not found then return jsonb_build_object('ok',false,'error_code','not_found'); end if;
  perform pg_advisory_xact_lock(910013,
    hashtext(v_org::text || chr(31) || v_offer.service_request_id::text || ':' || v_offer.appointment_type));
  select * into v_request from public.service_requests sr
    where sr.organization_id = v_org and sr.id = v_offer.service_request_id
      and sr.archived_at is null for update;
  if not found then return jsonb_build_object('ok',false,'error_code','case_unavailable'); end if;
  select * into v_offer from public.manual_slot_offers o
    where o.organization_id = v_org and o.id = p_offer_id for update;
  if p_action <> 'cancel' and v_offer.appointment_type = 'service'
     and v_request.status <> 'awaiting_slot_selection'
     and v_offer.status <> 'confirmed' then
    return jsonb_build_object('ok',false,'error_code','stage_changed');
  end if;
  if p_action <> 'cancel' and v_offer.appointment_type = 'diagnosis'
     and not exists (select 1 from public.preliminary_inspections pi
       where pi.organization_id = v_org and pi.service_request_id = v_offer.service_request_id
         and pi.status = 'requested') and v_offer.status <> 'confirmed' then
    return jsonb_build_object('ok',false,'error_code','stage_changed');
  end if;
  if p_action = 'send' then
    if v_offer.status = 'offered' and v_offer.offer_reference = btrim(p_reference) then
      return jsonb_build_object('ok',true,'idempotent',true); end if;
    if v_offer.status <> 'proposed' then return jsonb_build_object('ok',false,'error_code','invalid_status'); end if;
    if least(v_offer.slot_1,v_offer.slot_2,v_offer.slot_3) <= pg_catalog.now() then
      return jsonb_build_object('ok',false,'error_code','slot_expired'); end if;
    update public.manual_slot_offers set status='offered',offer_reference=btrim(p_reference)
      where organization_id=v_org and id=p_offer_id;
  elsif p_action = 'select' then
    if p_selected_slot is null or p_selected_slot not between 1 and 3 then
      return jsonb_build_object('ok',false,'error_code','invalid_slot'); end if;
    if v_offer.status = 'selected' and v_offer.selected_slot=p_selected_slot
       and v_offer.response_reference=btrim(p_reference) then
      return jsonb_build_object('ok',true,'idempotent',true); end if;
    if v_offer.status <> 'offered' then return jsonb_build_object('ok',false,'error_code','invalid_status'); end if;
    if (case p_selected_slot when 1 then v_offer.slot_1 when 2 then v_offer.slot_2
       else v_offer.slot_3 end) <= pg_catalog.now() then
      return jsonb_build_object('ok',false,'error_code','slot_expired'); end if;
    update public.manual_slot_offers set status='selected',selected_slot=p_selected_slot,
      response_reference=btrim(p_reference) where organization_id=v_org and id=p_offer_id;
  elsif p_action = 'confirm' then
    if v_offer.status = 'confirmed' and v_offer.booking_reference=btrim(p_reference) then
      return jsonb_build_object('ok',true,'appointment_id',v_offer.appointment_id,'idempotent',true); end if;
    if v_offer.status <> 'selected' or v_request.customer_id is null then
      return jsonb_build_object('ok',false,'error_code','invalid_status'); end if;
    if v_offer.appointment_type = 'service' and v_request.status <> 'awaiting_slot_selection' then
      return jsonb_build_object('ok',false,'error_code','stage_changed'); end if;
    v_start := case v_offer.selected_slot when 1 then v_offer.slot_1
      when 2 then v_offer.slot_2 else v_offer.slot_3 end;
    if v_start <= pg_catalog.now() then
      return jsonb_build_object('ok',false,'error_code','slot_expired'); end if;
    insert into public.appointments(organization_id,service_request_id,customer_id,
      vehicle_id,status,appointment_type,starts_at,notes)
      values(v_org,v_offer.service_request_id,v_request.customer_id,v_request.vehicle_id,
        'confirmed',v_offer.appointment_type,v_start,
        'Ročno potrjeno v MyPlanlyju; referenca je pri ponudbi terminov.')
      returning id into v_appointment_id;
    update public.manual_slot_offers set status='confirmed',booking_reference=btrim(p_reference),
      appointment_id=v_appointment_id where organization_id=v_org and id=p_offer_id;
    if v_offer.appointment_type = 'service' then
      update public.service_requests set status='appointment_confirmed'
        where organization_id=v_org and id=v_offer.service_request_id;
    end if;
    return jsonb_build_object('ok',true,'appointment_id',v_appointment_id,'idempotent',false);
  else
    if v_offer.status = 'cancelled' and v_offer.cancellation_reference=btrim(p_reference) then
      return jsonb_build_object('ok',true,'idempotent',true); end if;
    if v_offer.status = 'confirmed' then return jsonb_build_object('ok',false,'error_code','booking_already_confirmed'); end if;
    update public.manual_slot_offers set status='cancelled',cancellation_reference=btrim(p_reference)
      where organization_id=v_org and id=p_offer_id;
  end if;
  return jsonb_build_object('ok',true,'idempotent',false);
end;
$$;
revoke all on function public.advance_manual_slot_offer(uuid,text,text,integer)
  from public,anon,authenticated;
grant execute on function public.advance_manual_slot_offer(uuid,text,text,integer)
  to authenticated;

create or replace function private.guard_manual_appointment_confirmation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status and new.status = 'appointment_confirmed' then
    if old.status <> 'awaiting_slot_selection' or not exists (
      select 1 from public.manual_slot_offers o
      join public.appointments a on a.organization_id=o.organization_id and a.id=o.appointment_id
      where o.organization_id=new.organization_id and o.service_request_id=new.id
        and o.appointment_type='service' and o.status='confirmed'
        and o.booking_reference is not null and a.status='confirmed'
    ) then
      raise exception 'confirmed service appointment requires manual booking evidence'
        using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_manual_appointment_confirmation() from public,anon,authenticated;
create trigger service_requests_guard_manual_appointment_confirmation
  before update on public.service_requests for each row
  execute function private.guard_manual_appointment_confirmation();
