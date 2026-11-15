-- Only existing manual cases or a confirmed Quibi pair with a valid email use one-contact continuation.
create or replace function private.compute_request_intake_completeness(p_request_id uuid,p_phone text,p_email text,p_vin text,p_make text,p_model text)
returns jsonb language sql stable set search_path='' as $$
 select case when exists(select 1 from public.service_requests r where r.id=p_request_id and r.source='manual' and r.channel in ('manual','phone','sms'))
 or (btrim(coalesce(p_email,'')) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and exists(
 select 1 from public.service_requests r
 join public.integration_links c on c.organization_id=r.organization_id and c.entity_id=r.customer_id and c.provider='quibi' and c.entity_type='customer' and c.sync_status='ok'
 join public.quibi_vehicle_links v on v.organization_id=r.organization_id and v.customer_id=r.customer_id and v.vehicle_id=r.vehicle_id and v.quibi_customer_id=c.external_id and v.quibi_environment=c.quibi_environment and v.sync_status='ok'
 where r.id=p_request_id))
 then private.compute_manual_intake_completeness(p_phone,p_email,p_vin,p_make,p_model)
 else private.compute_intake_completeness(p_phone,p_email,p_vin,p_make,p_model) end;
$$;
