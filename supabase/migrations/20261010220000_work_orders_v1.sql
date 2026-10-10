-- Forward-only. Apply locally; hosted deployment requires explicit approval.
-- Internal work execution; creates no Quibi document, message or MyPlanly booking.
create table public.work_orders (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 service_request_id uuid not null, customer_id uuid not null, vehicle_id uuid not null,
 status text not null default 'open' check(status in ('open','in_progress','awaiting_parts','ready_for_collection','closed')),
 inspection_charge_policy text not null check(inspection_charge_policy in ('waived','not_applicable')),
 invoice_reference text, handover_reference text, invoice_verification text,
 created_by_profile_id uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), closed_at timestamptz,
 unique(organization_id,id), unique(organization_id,service_request_id),
 foreign key(organization_id,service_request_id) references public.service_requests(organization_id,id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),
 foreign key(organization_id,vehicle_id) references public.vehicles(organization_id,id),
 foreign key(organization_id,created_by_profile_id) references public.organization_memberships(organization_id,profile_id),
 check((status<>'closed' and closed_at is null and invoice_reference is null and handover_reference is null and invoice_verification is null)
 or (status='closed' and closed_at is not null and char_length(btrim(invoice_reference)) between 4 and 200
 and char_length(btrim(handover_reference)) between 4 and 200 and invoice_verification='manual_staff_confirmation'))
);
alter table public.work_orders add constraint work_orders_close_evidence_required check(status<>'closed' or (invoice_reference is not null and handover_reference is not null and invoice_verification is not null));
create index work_orders_status on public.work_orders(organization_id,status,updated_at desc);
create trigger work_orders_updated before update on public.work_orders for each row execute function public.set_updated_at();
create table public.work_order_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, work_order_id uuid not null,
 command_id uuid not null, kind text not null check(kind in ('note','transition')), body text not null check(char_length(btrim(body)) between 4 and 4000),
 payload jsonb not null, created_by_profile_id uuid not null, created_at timestamptz not null default now(),
 unique(organization_id,work_order_id,command_id),
 foreign key(organization_id,work_order_id) references public.work_orders(organization_id,id),
 foreign key(organization_id,created_by_profile_id) references public.organization_memberships(organization_id,profile_id)
);
create index work_order_events_order on public.work_order_events(organization_id,work_order_id,created_at);
alter table public.work_orders enable row level security;
alter table public.work_order_events enable row level security;
revoke all on public.work_orders,public.work_order_events from public,anon,authenticated;
grant select on public.work_orders,public.work_order_events to authenticated;
create policy work_orders_read on public.work_orders for select to authenticated using(private.has_org_role(organization_id,array['owner','admin','reception']::text[]));
create policy work_order_events_read on public.work_order_events for select to authenticated using(private.has_org_role(organization_id,array['owner','admin','reception']::text[]));

create function public.create_work_order(p_service_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.service_requests%rowtype; w public.work_orders%rowtype; q public.quotes%rowtype; decision text; actor uuid:=auth.uid();
begin
 select * into r from public.service_requests where id=p_service_request_id and archived_at is null for update;
 if not found or not private.has_org_role(r.organization_id,array['owner','admin','reception']::text[]) then return jsonb_build_object('ok',false,'error_code','forbidden'); end if;
 select * into w from public.work_orders where organization_id=r.organization_id and service_request_id=r.id;
 if found then return jsonb_build_object('ok',true,'id',w.id,'replayed',true); end if;
 if r.status<>'appointment_confirmed' then return jsonb_build_object('ok',false,'error_code','confirmed_appointment_required'); end if;
 if r.customer_id is null or r.vehicle_id is null or not exists(select 1 from public.vehicles v where v.id=r.vehicle_id and v.organization_id=r.organization_id
 and v.archived_at is null and char_length(btrim(coalesce(v.vin,'')))=17 and char_length(btrim(coalesce(v.registration_current,'')))>0
 and char_length(btrim(coalesce(v.make,'')))>0 and char_length(btrim(coalesce(v.model,'')))>0)
 or not exists(select 1 from public.customers c where c.id=r.customer_id and c.organization_id=r.organization_id and c.archived_at is null
 and (char_length(btrim(coalesce(c.phone,'')))>0 or char_length(btrim(coalesce(c.email,'')))>0))
 then return jsonb_build_object('ok',false,'error_code','vehicle_contact_required'); end if;
 if not exists(select 1 from public.service_request_intake_reviews i where i.organization_id=r.organization_id and i.service_request_id=r.id)
 then return jsonb_build_object('ok',false,'error_code','intake_review_required'); end if;
 if not exists(select 1 from public.appointments a where a.organization_id=r.organization_id and a.service_request_id=r.id and a.appointment_type='service' and a.status='confirmed')
 then return jsonb_build_object('ok',false,'error_code','confirmed_appointment_required'); end if;
 select * into q from public.quotes where organization_id=r.organization_id and service_request_id=r.id order by version_no desc limit 1;
 if not (q.id is not null and q.internal_review_status='approved_for_send' and exists(select 1 from public.customer_approvals a
 where a.organization_id=r.organization_id and a.service_request_id=r.id and a.quote_id=q.id and a.content_sha256=q.content_sha256 and a.customer_decision='approved' and a.delivery_status='delivered' and a.revoked_at is null))
 and not exists(select 1 from public.published_fixed_price_cases f where f.organization_id=r.organization_id and f.service_request_id=r.id and f.status='accepted')
 then return jsonb_build_object('ok',false,'error_code','customer_approval_required'); end if;
 select repair_decision into decision from public.preliminary_inspections where organization_id=r.organization_id and service_request_id=r.id;
 if decision is not null and decision<>'ordered' then return jsonb_build_object('ok',false,'error_code','inspection_decision_required'); end if;
 insert into public.work_orders(organization_id,service_request_id,customer_id,vehicle_id,inspection_charge_policy,created_by_profile_id)
 values(r.organization_id,r.id,r.customer_id,r.vehicle_id,case when decision='ordered' then 'waived' else 'not_applicable' end,actor) returning * into w;
 update public.service_requests set status='converted',next_action='Opravi delo v servisnem nalogu.',attention_needed=false where id=r.id and organization_id=r.organization_id;
 return jsonb_build_object('ok',true,'id',w.id);
end $$;
revoke all on function public.create_work_order(uuid) from public,anon;
grant execute on function public.create_work_order(uuid) to authenticated;

create function public.record_work_order(p_order_id uuid,p_expected_status text,p_next_status text,p_note text,p_command_id uuid,
 p_invoice_reference text default null,p_handover_reference text default null,p_close_confirmed boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.work_orders%rowtype; existing public.work_order_events%rowtype; payload jsonb; actor uuid:=auth.uid(); allowed boolean;
begin
 select * into w from public.work_orders where id=p_order_id for update;
 if not found or not private.has_org_role(w.organization_id,array['owner','admin','reception']::text[]) then return jsonb_build_object('ok',false,'error_code','forbidden'); end if;
 if p_command_id is null or p_note is null or char_length(btrim(p_note)) not between 4 and 4000 then return jsonb_build_object('ok',false,'error_code','invalid_input'); end if;
 payload:=jsonb_build_object('expected',p_expected_status,'next',p_next_status,'note',btrim(p_note),'invoice',p_invoice_reference,'handover',p_handover_reference,'confirmed',p_close_confirmed);
 select * into existing from public.work_order_events where organization_id=w.organization_id and work_order_id=w.id and command_id=p_command_id;
 if found then
  if existing.payload<>payload then return jsonb_build_object('ok',false,'error_code','idempotency_conflict'); end if;
  return jsonb_build_object('ok',true,'replayed',true);
 end if;
 if w.status='closed' or w.status is distinct from p_expected_status then return jsonb_build_object('ok',false,'error_code','stale_status'); end if;
 if p_next_status is not null then
  allowed:=(w.status='open' and p_next_status='in_progress') or (w.status='in_progress' and p_next_status in ('awaiting_parts','ready_for_collection'))
   or (w.status='awaiting_parts' and p_next_status='in_progress') or (w.status='ready_for_collection' and p_next_status in ('in_progress','closed'));
  if not allowed then return jsonb_build_object('ok',false,'error_code','invalid_transition'); end if;
  if p_next_status='closed' and (not private.has_org_role(w.organization_id,array['owner','admin']::text[]) or not coalesce(p_close_confirmed,false)
   or p_invoice_reference is null or char_length(btrim(p_invoice_reference)) not between 4 and 200
   or p_handover_reference is null or char_length(btrim(p_handover_reference)) not between 4 and 200)
  then return jsonb_build_object('ok',false,'error_code','invoice_handover_required'); end if;
  update public.work_orders set status=p_next_status,
   invoice_reference=case when p_next_status='closed' then btrim(p_invoice_reference) end,
   handover_reference=case when p_next_status='closed' then btrim(p_handover_reference) end,
   invoice_verification=case when p_next_status='closed' then 'manual_staff_confirmation' end,
   closed_at=case when p_next_status='closed' then now() end where id=w.id and organization_id=w.organization_id;
  if p_next_status='closed' then update public.service_requests set status='closed',next_action='Primer in delovni nalog sta zaključena.' where id=w.service_request_id and organization_id=w.organization_id; end if;
 end if;
 insert into public.work_order_events(organization_id,work_order_id,command_id,kind,body,payload,created_by_profile_id)
 values(w.organization_id,w.id,p_command_id,case when p_next_status is null then 'note' else 'transition' end,btrim(p_note),payload,actor);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.record_work_order(uuid,text,text,text,uuid,text,text,boolean) from public,anon;
grant execute on function public.record_work_order(uuid,text,text,text,uuid,text,text,boolean) to authenticated;
notify pgrst,'reload schema';
