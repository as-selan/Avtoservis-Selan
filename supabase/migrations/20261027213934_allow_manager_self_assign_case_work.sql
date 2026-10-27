begin;
-- A manager may take their own work; assignment of other users still requires an active mechanic.
create or replace function public.assign_service_case(p_case uuid,p_mechanic uuid,p_document text,p_sha text,p_environment text) returns void language plpgsql security definer set search_path='' as $$declare s public.service_requests; v_customer text; v_vehicle text; v_journal text; v_verified boolean;begin
 select * into s from public.service_requests where id=p_case and archived_at is null for update;
 if not found or not public.team_has_role(s.organization_id,array['owner','admin']) then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from public.organization_memberships where organization_id=s.organization_id and profile_id=p_mechanic and is_active and (role='mechanic' or (profile_id=auth.uid() and role in ('owner','admin')))) then raise exception 'MECHANIC_UNAVAILABLE';end if;
 if p_environment is null or p_environment not in ('dev','production') then raise exception 'INVALID_ENVIRONMENT';end if;
 v_journal:=case p_environment when 'dev' then 'quibi_dev_operation_journal' else 'quibi_production_operation_journal' end;
 select quibi_customer_id,quibi_vehicle_id into v_customer,v_vehicle from public.quibi_vehicle_links where organization_id=s.organization_id and vehicle_id=s.vehicle_id and customer_id=s.customer_id and sync_status='ok' and quibi_environment=p_environment;
 if not found then raise exception 'VEHICLE_LINK_UNVERIFIED';end if;
 execute format('select exists(select 1 from public.%I j where j.organization_id=$1 and j.service_request_id=$2 and j.kind in (''work_order'',''work_order_update'') and j.state=''verified'' and j.quibi_id=$3 and j.quibi_content_sha256=$4 and coalesce(j.request_body::jsonb->''body'',j.request_body::jsonb)->''Glavadokumenta''->>''stranka_id''=$5 and coalesce(j.request_body::jsonb->''body'',j.request_body::jsonb)->''Glavadokumenta''->>''vozila_id''=$6)',v_journal) into v_verified using s.organization_id,p_case,p_document,p_sha,v_customer,v_vehicle;
 if not v_verified then raise exception 'QUIBI_REFERENCE_UNVERIFIED';end if;
 insert into public.service_case_assignments(case_id,organization_id,mechanic_id,assigned_by,quibi_work_order_id,quibi_content_sha256,vehicle_id,quibi_customer_id,quibi_vehicle_id) values(p_case,s.organization_id,p_mechanic,auth.uid(),p_document,p_sha,s.vehicle_id,v_customer,v_vehicle)
 on conflict(case_id) do update set mechanic_id=excluded.mechanic_id,assigned_by=auth.uid(),updated_at=now() where service_case_assignments.vehicle_id=excluded.vehicle_id and service_case_assignments.quibi_customer_id=excluded.quibi_customer_id and service_case_assignments.quibi_vehicle_id=excluded.quibi_vehicle_id and service_case_assignments.quibi_work_order_id=excluded.quibi_work_order_id and service_case_assignments.quibi_content_sha256=excluded.quibi_content_sha256;
 if not found then raise exception 'QUIBI_REFERENCE_CHANGED';end if;end;$$;
revoke all on function public.assign_service_case(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.assign_service_case(uuid,uuid,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
