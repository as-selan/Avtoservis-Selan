-- Existing local QA database; synthetic linkage fixtures exist only until rollback.
begin;
do $$
declare r public.service_requests%rowtype; actor uuid; order_id uuid:=gen_random_uuid(); c public.integration_links%rowtype; v public.quibi_vehicle_links%rowtype;
begin
 select sr.* into r from public.service_requests sr join public.integration_links cl on cl.organization_id=sr.organization_id and cl.entity_id=sr.customer_id join public.quibi_vehicle_links vl on vl.organization_id=sr.organization_id and vl.vehicle_id=sr.vehicle_id where cl.sync_status='ok' and vl.sync_status='ok' and cl.quibi_environment=vl.quibi_environment and exists(select 1 from public.organization_memberships m where m.organization_id=sr.organization_id and m.role='owner' and m.is_active) limit 1;
 if r.id is null then raise exception 'Existing linked QA case required';end if;
 select profile_id into actor from public.organization_memberships where organization_id=r.organization_id and role='owner' and is_active limit 1;
 select * into c from public.integration_links where organization_id=r.organization_id and entity_id=r.customer_id;
 select * into v from public.quibi_vehicle_links where organization_id=r.organization_id and vehicle_id=r.vehicle_id;
 insert into public.work_orders(id,organization_id,service_request_id,customer_id,vehicle_id,inspection_charge_policy,created_by_profile_id) values(order_id,r.organization_id,r.id,r.customer_id,r.vehicle_id,'not_applicable',actor);
 insert into public.work_order_quibi_documents(organization_id,work_order_id,document_kind,quibi_environment,quibi_document_id,quibi_customer_id,quibi_vehicle_id,content_sha256,confirmed_by_profile_id) values(r.organization_id,order_id,'work_order',c.quibi_environment,'900000000',c.external_id,v.quibi_vehicle_id,repeat('a',64),actor);
 begin insert into public.work_order_quibi_documents(organization_id,work_order_id,document_kind,quibi_environment,quibi_document_id,quibi_customer_id,quibi_vehicle_id,content_sha256,confirmed_by_profile_id) values(r.organization_id,order_id,'work_order',c.quibi_environment,'900000000',c.external_id,v.quibi_vehicle_id,repeat('a',64),actor);raise exception 'Duplicate accepted';exception when unique_violation then null;end;
 begin insert into public.work_order_quibi_documents(organization_id,work_order_id,document_kind,quibi_environment,quibi_document_id,quibi_customer_id,quibi_vehicle_id,content_sha256,confirmed_by_profile_id) values(r.organization_id,order_id,'invoice',c.quibi_environment,'900000001',c.external_id,'999999999',repeat('a',64),actor);raise exception 'Wrong vehicle accepted';exception when check_violation then null;end;
 update public.work_orders set status='closed',closed_at=now(),invoice_reference='SQL FIXTURE ONLY',handover_reference='SQL FIXTURE ONLY',invoice_verification='manual_staff_confirmation' where id=order_id;
 begin insert into public.work_order_quibi_documents(organization_id,work_order_id,document_kind,quibi_environment,quibi_document_id,quibi_customer_id,quibi_vehicle_id,content_sha256,confirmed_by_profile_id) values(r.organization_id,order_id,'invoice',c.quibi_environment,'900000001',c.external_id,v.quibi_vehicle_id,repeat('a',64),actor);raise exception 'Closed order accepted new link';exception when check_violation then null;end;
 if has_table_privilege('authenticated','public.work_order_quibi_documents','INSERT') or has_table_privilege('service_role','public.work_order_quibi_documents','UPDATE') or has_table_privilege('anon','public.work_order_quibi_documents','SELECT') then raise exception 'Unsafe grants';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);execute 'set local role authenticated';
 if not exists(select 1 from public.work_order_quibi_documents where work_order_id=order_id) then raise exception 'Authorized read failed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 if exists(select 1 from public.work_order_quibi_documents) then raise exception 'RLS isolation failed';end if;execute 'reset role';
 raise notice 'Quibi references: duplicate protection, wrong vehicle rejection, immutable grants and organization RLS passed';
end $$;
rollback;
