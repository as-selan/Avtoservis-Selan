-- READ ONLY. Run before requesting approval; this is not a backup or migration.
-- Order: work_orders_v1 -> work_order_photos / work_order_quibi_documents
-- -> quibi_business_document_operations -> explicit_vehicle_with_shared_registration
-- -> assigned_mechanic_access (requires work orders and photos).
-- No hosted migration may run until a complete backup has passed restore verification.
begin transaction read only;
select to_regclass('public.work_orders') as work_orders,
       to_regclass('public.work_order_photos') as photos,
       to_regclass('public.work_order_quibi_documents') as quibi_links;
select version from supabase_migrations.schema_migrations order by version desc limit 10;
select role,count(*) as active_members from public.organization_memberships where is_active group by role;
select count(*) as storage_objects from storage.objects;
select conrelid::regclass as journal,conname from pg_constraint
where conrelid in ('public.quibi_dev_operation_journal'::regclass,'public.quibi_production_operation_journal'::regclass)
and conname in ('quibi_dev_operation_journal_kind_check','quibi_dev_operation_journal_check',
'quibi_production_operation_journal_kind_check','quibi_production_operation_journal_check');
select p.proname,position(E'    if coalesce(array_length(v_reg_vehicle_ids, 1), 0) > 1 then\n      return jsonb_build_object(''ok'', false, ''error_code'', ''ambiguous_vehicle'');\n    end if;'
 in replace(pg_get_functiondef(p.oid),E'\r\n',E'\n'))>0 as exact_intake_patch_anchor
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='create_manual_service_request_intake';
rollback;
