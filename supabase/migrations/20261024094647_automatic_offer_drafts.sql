-- Persistent automatic preparation on the existing canonical row. No RLS changes.
alter table public.offer_preparations add column auto_draft jsonb, add column auto_input jsonb,
 add column auto_state text check(auto_state in ('preparing','ready','missing_price','ambiguous','needs_data','blocked','failed')),
 add column auto_run uuid, add column auto_started_at timestamptz;

create function public.automatic_offer_job(p_case uuid,p_actor uuid,p_action text,p_run uuid default null,p_draft jsonb default null,p_state text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.service_requests; j public.offer_preparations; src jsonb; actor_org uuid;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'forbidden'; end if;
 select * into r from public.service_requests where id=p_case and archived_at is null for update;
 if not found or r.status not in ('new','needs_data','preparing_offer') then return null; end if;
 if not exists(select 1 from public.organization_memberships where organization_id=r.organization_id and profile_id=p_actor and is_active and role in ('owner','admin')) then raise exception 'forbidden'; end if;
 if exists(select 1 from public.quotes where organization_id=r.organization_id and service_request_id=p_case) or exists(select 1 from public.published_fixed_price_cases where organization_id=r.organization_id and service_request_id=p_case) then return null; end if;
 select jsonb_build_object('customerId',r.customer_id,'vehicleId',r.vehicle_id,'wanted',r.service_wanted,'description',r.problem_description,'customerChanged',c.updated_at,'vehicleChanged',v.updated_at) into src from public.customers c left join public.vehicles v on v.id=r.vehicle_id and v.organization_id=r.organization_id and v.customer_id=c.id where c.id=r.customer_id and c.organization_id=r.organization_id and c.archived_at is null;
 if src is null then return null; end if;
 insert into public.offer_preparations(organization_id,service_request_id,created_by_profile_id) values(r.organization_id,p_case,p_actor) on conflict(organization_id,service_request_id) do nothing;
 select * into j from public.offer_preparations where organization_id=r.organization_id and service_request_id=p_case for update;
 if p_action='claim' then
  if j.auto_input=src and j.auto_state in ('ready','missing_price','ambiguous','needs_data') then return null; end if;
  if j.auto_state='preparing' and j.auto_started_at>now()-interval '5 minutes' then return null; end if;
  if j.auto_state='blocked' and j.auto_started_at>now()-interval '5 minutes' then return null; end if;
  if j.auto_state='failed' and j.auto_started_at>now()-interval '1 minute' then return null; end if;
  update public.offer_preparations set auto_input=src,auto_state='preparing',auto_draft=null,auto_run=gen_random_uuid(),auto_started_at=now() where id=j.id returning * into j;
  return jsonb_build_object('run',j.auto_run,'input',src);
 elsif p_action='finish' then
  if j.auto_run is distinct from p_run then return null; end if;
  if j.auto_input is distinct from src then
   update public.offer_preparations set auto_state='failed',auto_started_at=null where id=j.id; return null;
  end if;
  if p_state not in ('ready','missing_price','ambiguous','needs_data','blocked','failed') or (p_draft is not null and pg_column_size(p_draft)>524288) then raise exception 'invalid draft'; end if;
  update public.offer_preparations set auto_state=p_state,auto_draft=p_draft where id=j.id;
  return jsonb_build_object('saved',true);
 end if;
 raise exception 'invalid action';
end; $$;
revoke all on function public.automatic_offer_job(uuid,uuid,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.automatic_offer_job(uuid,uuid,text,uuid,jsonb,text) to service_role;

create function public.pending_automatic_offers(p_actor uuid) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(q.id),'[]'::jsonb) from (
 select r.id from public.service_requests r
 join public.organization_memberships m on m.organization_id=r.organization_id and m.profile_id=p_actor and m.is_active and m.role in ('owner','admin')
 left join public.offer_preparations j on j.organization_id=r.organization_id and j.service_request_id=r.id
 where (select auth.role())='service_role' and r.archived_at is null and r.status in ('new','needs_data','preparing_offer')
 and (j.auto_state is null or j.auto_state in ('preparing','blocked') and j.auto_started_at<now()-interval '5 minutes' or j.auto_state='failed' and (j.auto_started_at is null or j.auto_started_at<now()-interval '1 minute'))
 and not exists(select 1 from public.quotes where organization_id=r.organization_id and service_request_id=r.id)
 and not exists(select 1 from public.published_fixed_price_cases where organization_id=r.organization_id and service_request_id=r.id)
 order by r.created_at limit 10) q;
$$;
revoke all on function public.pending_automatic_offers(uuid) from public,anon,authenticated;
grant execute on function public.pending_automatic_offers(uuid) to service_role;
