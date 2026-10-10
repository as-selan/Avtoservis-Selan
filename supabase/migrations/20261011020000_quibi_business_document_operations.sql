-- Forward-only. No hosted application without explicit approval.
-- Extend the existing journals; retain their immutable request, actor and case guards.
do $$
declare table_name text;
begin
 foreach table_name in array array['quibi_dev_operation_journal','quibi_production_operation_journal'] loop
  execute format('alter table public.%I drop constraint %I',table_name,table_name||'_kind_check');
  execute format('alter table public.%I drop constraint %I',table_name,table_name||'_check');
  execute format('alter table public.%I add constraint %I check (kind in (''customer'',''vehicle'',''estimate'',''estimate_update'',''send'',''work_order'',''invoice'',''customer_update'',''vehicle_update''))',table_name,table_name||'_kind_check');
  execute format('alter table public.%I add constraint %I check ((kind = ''estimate'' and service_request_id = local_entity_id and external_id is not null) or (kind = ''customer'' and external_id = local_entity_id::text) or (kind in (''vehicle'',''estimate_update'',''send'',''customer_update'',''vehicle_update'') and external_id is null) or (kind in (''work_order'',''invoice'') and external_id = ''selan-work-order:'' || local_entity_id::text || '':'' || kind))',table_name,table_name||'_check');
 end loop;
end $$;
