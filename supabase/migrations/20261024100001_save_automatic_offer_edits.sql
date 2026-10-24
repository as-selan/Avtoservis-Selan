create function public.save_automatic_offer_rows(p_case uuid,p_run uuid,p_expected_updated_at timestamptz,p_rows jsonb,p_options jsonb,p_state text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.service_requests; j public.offer_preparations;
begin
 select * into r from public.service_requests where id=p_case and archived_at is null for update;
 if not found or r.status not in ('new','preparing_offer') or not exists(select 1 from public.organization_memberships where organization_id=r.organization_id and profile_id=(select auth.uid()) and is_active and role in ('owner','admin')) then return null; end if;
 if exists(select 1 from public.quotes where organization_id=r.organization_id and service_request_id=p_case) then return null; end if;
 select * into j from public.offer_preparations where organization_id=r.organization_id and service_request_id=p_case for update;
 if j.auto_run is distinct from p_run or j.updated_at is distinct from p_expected_updated_at or j.auto_draft is null then return null; end if;
 if j.auto_input->>'wanted' is distinct from r.service_wanted or j.auto_input->>'description' is distinct from r.problem_description or j.auto_input->>'customerId' is distinct from r.customer_id::text or j.auto_input->>'vehicleId' is distinct from r.vehicle_id::text then return null; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>100 or jsonb_array_length(p_rows)<1 or pg_column_size(p_rows)>64000 or jsonb_typeof(p_options)<>'array' or pg_column_size(p_options)>524288 or p_state not in ('ready','ambiguous','missing_price') then raise exception 'invalid draft'; end if;
 update public.offer_preparations set auto_draft=jsonb_set(jsonb_set(auto_draft,'{rows}',p_rows),'{options}',p_options),auto_state=p_state where id=j.id returning * into j;
 return jsonb_build_object('updatedAt',j.updated_at);
end; $$;
revoke all on function public.save_automatic_offer_rows(uuid,uuid,timestamptz,jsonb,jsonb,text) from public,anon;
grant execute on function public.save_automatic_offer_rows(uuid,uuid,timestamptz,jsonb,jsonb,text) to authenticated;
