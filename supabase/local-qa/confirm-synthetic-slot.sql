-- LOCAL QA ONLY. Never apply to hosted/production Supabase.
-- Uses existing tables/RPC; no MyPlanly operation or production function is changed.
alter database postgres set "selan.local_qa" = '1';
create or replace function public.confirm_local_synthetic_slot_offer(p_offer_id uuid,p_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.manual_slot_offers%rowtype; result jsonb;
begin
 if current_setting('selan.local_qa',true) is distinct from '1' or p_reference is null or p_reference !~* '^QA-SIM-[A-Z0-9-]{4,190}$' then
  return jsonb_build_object('ok',false,'error_code','synthetic_qa_disabled');
 end if;
 select * into o from public.manual_slot_offers where id=p_offer_id for update;
 if not found or not private.has_org_role(o.organization_id,array['owner','admin']::text[])
 or not exists(select 1 from public.service_requests r join public.customers c on c.id=r.customer_id and c.organization_id=r.organization_id
 join public.integration_links l on l.entity_id=c.id and l.organization_id=c.organization_id and l.provider='quibi' and l.entity_type='customer'
 where r.id=o.service_request_id and r.organization_id=o.organization_id and c.display_name='TEST-SELAN-AI'
 and c.email='test-selan-ai@example.test' and l.external_id='405957' and l.quibi_environment='dev')
 or coalesce(o.availability_reference,'') !~* '^QA-SIM-' or coalesce(o.offer_reference,'') !~* '^QA-SIM-' or coalesce(o.response_reference,'') !~* '^QA-SIM-' then
  return jsonb_build_object('ok',false,'error_code','synthetic_case_required');
 end if;
 result:=public.advance_manual_slot_offer(p_offer_id,'confirm',p_reference,null);
 if coalesce((result->>'ok')::boolean,false) then
  update public.appointments set notes='QA-SIM: sintetični lokalni termin; NI rezervacija v MyPlanlyju. Referenca: '||p_reference
   where id=(result->>'appointment_id')::uuid and organization_id=o.organization_id;
 end if;
 return result || jsonb_build_object('simulated',true,'external_booking',false);
end $$;
revoke all on function public.confirm_local_synthetic_slot_offer(uuid,text) from public,anon;
grant execute on function public.confirm_local_synthetic_slot_offer(uuid,text) to authenticated;
notify pgrst,'reload schema';
