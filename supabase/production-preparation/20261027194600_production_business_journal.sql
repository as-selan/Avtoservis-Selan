-- PREPARED ONLY: production requires separate explicit approval; never run automatically.
-- Apply after review of production schema, data, compatibility and backup.
-- Production journal preparation based on the existing DEV business-document rules.
-- Do not run db push: the six optional pending migrations are not prerequisites.
begin;
alter table public.quibi_production_operation_journal drop constraint if exists quibi_production_operation_journal_kind_check;
alter table public.quibi_production_operation_journal drop constraint if exists quibi_production_operation_journal_check;
alter table public.quibi_production_operation_journal add constraint quibi_production_operation_journal_kind_check check(kind in ('customer','vehicle','estimate','estimate_update','send','work_order','invoice','customer_update','vehicle_update','work_order_update','invoice_update'));
alter table public.quibi_production_operation_journal add constraint quibi_production_operation_journal_check check(
 (kind='estimate' and service_request_id=local_entity_id and external_id is not null)
 or (kind='customer' and external_id=local_entity_id::text)
 or (kind in ('vehicle','estimate_update','send','customer_update','vehicle_update','work_order_update','invoice_update') and external_id is null)
 or (kind in ('work_order','invoice') and external_id='selan-work-order:'||local_entity_id::text||':'||kind));
-- Existing conflicting records abort the transaction; no rows are removed or rewritten.
create unique index if not exists quibi_production_one_business_create_per_case on public.quibi_production_operation_journal(organization_id,service_request_id,kind) where kind in ('work_order','invoice');
create unique index if not exists quibi_production_active_business_update on public.quibi_production_operation_journal(organization_id,quibi_id) where kind in ('work_order_update','invoice_update') and quibi_id is not null and state in ('prepared','dispatching','uncertain');
-- Serialize SEND and UPDATE for the same remote document without rewriting historical journal rows.
create or replace function private.guard_quibi_production_business_document_dispatch() returns trigger
 language plpgsql security definer set search_path='' as $$
declare conflict boolean;
begin
 if new.quibi_id is null or new.kind not in ('send','work_order_update','invoice_update') then return new;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.organization_id::text||':'||new.quibi_id,0));
 if new.kind='send' then
  execute format('select exists(select 1 from public.%I where organization_id=$1 and quibi_id=$2 and id<>$3 and kind in (''work_order_update'',''invoice_update'') and state in (''prepared'',''dispatching'',''uncertain''))',tg_table_name) into conflict using new.organization_id,new.quibi_id,new.id;
 else
  execute format('select exists(select 1 from public.%I where organization_id=$1 and (quibi_id=$2 or request_body::jsonb->>''documentId''=$2) and id<>$3 and kind=''send'' and attempted_at is not null)',tg_table_name) into conflict using new.organization_id,new.quibi_id,new.id;
 end if;
 if conflict then raise exception 'Document has a conflicting send or unresolved update' using errcode='23514';end if;
 return new;
end $$;
revoke all on function private.guard_quibi_production_business_document_dispatch() from public,anon,authenticated,service_role;
drop trigger if exists quibi_business_dispatch_guard on public.quibi_production_operation_journal;
create trigger quibi_business_dispatch_guard before update on public.quibi_production_operation_journal for each row execute function private.guard_quibi_production_business_document_dispatch();

notify pgrst,'reload schema';
commit;
