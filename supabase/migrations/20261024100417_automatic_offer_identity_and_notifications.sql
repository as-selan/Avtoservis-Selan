-- Refresh input when party links are resolved, and notify existing service-request realtime subscribers.
create or replace function public.automatic_offer_job(p_case uuid,p_actor uuid,p_action text,p_run uuid default null,p_draft jsonb default null,p_state text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.service_requests; j public.offer_preparations; src jsonb;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'forbidden'; end if;
 select * into r from public.service_requests where id=p_case and archived_at is null for update;
 if not found or r.status not in ('new','needs_data','preparing_offer') then return null; end if;
 if not exists(select 1 from public.organization_memberships where organization_id=r.organization_id and profile_id=p_actor and is_active and role in ('owner','admin')) then raise exception 'forbidden'; end if;
 if exists(select 1 from public.quotes where organization_id=r.organization_id and service_request_id=p_case) or exists(select 1 from public.published_fixed_price_cases where organization_id=r.organization_id and service_request_id=p_case) then return null; end if;
 select jsonb_build_object('customerId',r.customer_id,'vehicleId',r.vehicle_id,'wanted',r.service_wanted,'description',r.problem_description,'customerChanged',c.updated_at,'vehicleChanged',v.updated_at,'customerLink',(select jsonb_build_array(l.external_id,l.sync_status,l.quibi_environment) from public.integration_links l where l.organization_id=r.organization_id and l.entity_id=r.customer_id and l.provider='quibi' and l.entity_type='customer'),'vehicleLink',(select jsonb_build_array(l.quibi_vehicle_id,l.sync_status,l.quibi_environment) from public.quibi_vehicle_links l where l.organization_id=r.organization_id and l.vehicle_id=r.vehicle_id)) into src from public.customers c left join public.vehicles v on v.id=r.vehicle_id and v.organization_id=r.organization_id and v.customer_id=c.id where c.id=r.customer_id and c.organization_id=r.organization_id and c.archived_at is null;
 if src is null then return null; end if;
 insert into public.offer_preparations(organization_id,service_request_id,created_by_profile_id) values(r.organization_id,p_case,p_actor) on conflict(organization_id,service_request_id) do nothing;
 select * into j from public.offer_preparations where organization_id=r.organization_id and service_request_id=p_case for update;
 if p_action='claim' then
  if j.auto_input=src and j.auto_state in ('ready','missing_price','ambiguous','needs_data') then return null; end if;
  if j.auto_state='preparing' and j.auto_started_at>now()-interval '5 minutes' then return null; end if;
  if j.auto_input=src and j.auto_state='blocked' and j.auto_started_at>now()-interval '5 minutes' then return null; end if;
  if j.auto_input=src and j.auto_state='failed' and j.auto_started_at>now()-interval '1 minute' then return null; end if;
  update public.offer_preparations set auto_input=src,auto_state='preparing',auto_draft=null,auto_run=gen_random_uuid(),auto_started_at=now() where id=j.id returning * into j;
  return jsonb_build_object('run',j.auto_run,'input',src);
 elsif p_action='finish' then
  if j.auto_run is distinct from p_run then return null; end if;
  if j.auto_input is distinct from src then
   update public.offer_preparations set auto_state='failed',auto_started_at=null where id=j.id; return null;
  end if;
  if p_state is null or p_state not in ('ready','missing_price','ambiguous','needs_data','blocked','failed') or (p_draft is not null and pg_column_size(p_draft)>524288) then raise exception 'invalid draft'; end if;
  update public.offer_preparations set auto_state=p_state,auto_draft=p_draft where id=j.id;
  update public.service_requests set next_action=case p_state when 'ready' then 'Predračun je pripravljen – Preglej in potrdi.' when 'ambiguous' then 'Ujemanje ni jasno – Izberi storitev.' when 'missing_price' then 'Manjka cena – Vnesi ceno.' else 'Dopolnite podatke za pripravo predračuna.' end where id=r.id;
  return jsonb_build_object('saved',true);
 end if;
 raise exception 'invalid action';
end; $$;

create or replace function public.save_automatic_offer_rows(p_case uuid,p_run uuid,p_expected_updated_at timestamptz,p_rows jsonb,p_options jsonb,p_state text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.service_requests; j public.offer_preparations;
begin
 select * into r from public.service_requests where id=p_case and archived_at is null for update;
 if not found or r.status not in ('new','preparing_offer') or not exists(select 1 from public.organization_memberships where organization_id=r.organization_id and profile_id=(select auth.uid()) and is_active and role in ('owner','admin')) then return null; end if;
 if exists(select 1 from public.quotes where organization_id=r.organization_id and service_request_id=p_case) then return null; end if;
 select * into j from public.offer_preparations where organization_id=r.organization_id and service_request_id=p_case for update;
 if j.auto_run is distinct from p_run or j.updated_at is distinct from p_expected_updated_at or j.auto_draft is null then return null; end if;
 if j.auto_input->>'wanted' is distinct from r.service_wanted or j.auto_input->>'description' is distinct from r.problem_description or j.auto_input->>'customerId' is distinct from r.customer_id::text or j.auto_input->>'vehicleId' is distinct from r.vehicle_id::text then return null; end if;
 if p_rows is null or p_options is null or p_state is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>100 or jsonb_array_length(p_rows)<1 or pg_column_size(p_rows)>64000 or jsonb_typeof(p_options)<>'array' or pg_column_size(p_options)>524288 or p_state not in ('ready','ambiguous','missing_price') then raise exception 'invalid draft'; end if;
 update public.offer_preparations set auto_draft=jsonb_set(jsonb_set(auto_draft,'{rows}',p_rows),'{options}',p_options),auto_state=p_state where id=j.id returning * into j;
 update public.service_requests set next_action=case p_state when 'ready' then 'Predračun je pripravljen – Preglej in potrdi.' when 'ambiguous' then 'Ujemanje ni jasno – Izberi storitev.' when 'missing_price' then 'Manjka cena – Vnesi ceno.' else 'Dopolnite podatke za pripravo predračuna.' end where id=r.id;
 return jsonb_build_object('updatedAt',j.updated_at);
end; $$;
