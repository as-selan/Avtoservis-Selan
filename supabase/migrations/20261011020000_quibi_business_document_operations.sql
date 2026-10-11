-- Forward-only. No hosted application without explicit approval.
-- Extend the existing journals; retain their immutable request, actor and case guards.
do $$
declare table_name text;
begin
 foreach table_name in array array['quibi_dev_operation_journal','quibi_production_operation_journal'] loop
  execute format('alter table public.%I drop constraint %I',table_name,table_name||'_kind_check');
  execute format('alter table public.%I drop constraint %I',table_name,table_name||'_check');
  execute format('alter table public.%I add constraint %I check (kind in (''customer'',''vehicle'',''estimate'',''estimate_update'',''send'',''work_order'',''invoice'',''customer_update'',''vehicle_update'',''work_order_update'',''invoice_update''))',table_name,table_name||'_kind_check');
  execute format('alter table public.%I add constraint %I check ((kind = ''estimate'' and service_request_id = local_entity_id and external_id is not null) or (kind = ''customer'' and external_id = local_entity_id::text) or (kind in (''vehicle'',''estimate_update'',''send'',''customer_update'',''vehicle_update'',''work_order_update'',''invoice_update'') and external_id is null) or (kind in (''work_order'',''invoice'') and external_id = ''selan-work-order:'' || local_entity_id::text || '':'' || kind))',table_name,table_name||'_check');
 end loop;
end $$;

-- One business CREATE per service case, even when callers switch internal/direct scopes.
-- Existing conflicts must be reviewed before approval; index failure must roll back migration.
create unique index quibi_dev_one_business_create_per_case on public.quibi_dev_operation_journal(organization_id,service_request_id,kind)
 where kind in ('work_order','invoice');

-- An unresolved timeout blocks every other revision of the same document.
create unique index quibi_dev_active_business_update on public.quibi_dev_operation_journal(organization_id,quibi_id)
 where kind in ('work_order_update','invoice_update') and quibi_id is not null and state in ('prepared','dispatching','uncertain');
create unique index quibi_production_active_business_update on public.quibi_production_operation_journal(organization_id,quibi_id)
 where kind in ('work_order_update','invoice_update') and quibi_id is not null and state in ('prepared','dispatching','uncertain');

-- Optional compatibility for existing internal-task document references.
-- Direct case operations require only the existing journal; never create internal tasks here.
do $optional_legacy$
begin
 if to_regclass('public.work_order_quibi_documents') is not null and to_regclass('public.work_orders') is not null then
  execute $legacy_sql$
-- References and hashes only; business content remains in Quibi and its immutable operation journal.
create table public.work_order_quibi_document_revisions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 reference_id uuid not null references public.work_order_quibi_documents(id),
 operation_id uuid not null, previous_confirmed_by_profile_id uuid not null, previous_confirmed_at timestamptz not null, previous_sha256 text not null check(previous_sha256 ~ '^[a-f0-9]{64}$'),
 content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
 confirmed_by_profile_id uuid not null, confirmed_at timestamptz not null default now(),
 unique(organization_id,operation_id),
 foreign key(organization_id,confirmed_by_profile_id) references public.organization_memberships(organization_id,profile_id)
);
alter table public.work_order_quibi_document_revisions enable row level security;
revoke all on public.work_order_quibi_document_revisions from public,anon,authenticated,service_role;
grant select on public.work_order_quibi_document_revisions to authenticated,service_role;
create policy work_order_quibi_document_revisions_read on public.work_order_quibi_document_revisions for select to authenticated
 using(private.has_org_role(organization_id,array['owner','admin','reception']::text[]));
create function public.confirm_work_order_quibi_document_revision(p_reference_id uuid,p_operation_id uuid)
 returns void language plpgsql security definer set search_path='' as $$
declare r public.work_order_quibi_documents%rowtype; w public.work_orders%rowtype; j record; h jsonb;
begin
 select * into r from public.work_order_quibi_documents where id=p_reference_id for update;
 if not found or not private.has_org_role(r.organization_id,array['owner','admin']::text[]) then raise exception 'Authorized reference required';end if;
 select * into w from public.work_orders where organization_id=r.organization_id and id=r.work_order_id for update;
 if not found or w.status='closed' or (r.document_kind='invoice' and w.status<>'ready_for_collection') then raise exception 'Open eligible work order required';end if;
 if r.quibi_environment='dev' then select * into j from public.quibi_dev_operation_journal where id=p_operation_id and organization_id=r.organization_id;
 else select * into j from public.quibi_production_operation_journal where id=p_operation_id and organization_id=r.organization_id;end if;
 if not found or j.state<>'verified' or j.kind<>r.document_kind||'_update' or j.created_by_profile_id<>auth.uid() or j.service_request_id<>w.service_request_id or j.quibi_id<>r.quibi_document_id or j.quibi_content_sha256 is null then raise exception 'Verified matching update required';end if;
 h=j.request_body::jsonb;
 if h#>>'{body,Glavadokumenta,external_id}' is distinct from ('selan-work-order:'||w.id::text||':'||r.document_kind)
 or h#>>'{body,Glavadokumenta,id}' is distinct from r.quibi_document_id
 or h#>>'{body,Glavadokumenta,stranka_id}' is distinct from r.quibi_customer_id
 or h#>>'{body,Glavadokumenta,vozila_id}' is distinct from r.quibi_vehicle_id then raise exception 'Document identity cannot change';end if;
 if exists(select 1 from public.work_order_quibi_document_revisions where organization_id=r.organization_id and operation_id=j.id and reference_id=r.id and content_sha256=r.content_sha256) then return;end if;
 if h->>'baselineSha' is distinct from r.content_sha256 or j.quibi_content_sha256=r.content_sha256 then raise exception 'Reference changed or no verified change';end if;
 insert into public.work_order_quibi_document_revisions(organization_id,reference_id,operation_id,previous_confirmed_by_profile_id,previous_confirmed_at,previous_sha256,content_sha256,confirmed_by_profile_id)
 values(r.organization_id,r.id,j.id,r.confirmed_by_profile_id,r.confirmed_at,r.content_sha256,j.quibi_content_sha256,auth.uid());
 update public.work_order_quibi_documents set content_sha256=j.quibi_content_sha256,confirmed_by_profile_id=auth.uid(),confirmed_at=now() where id=r.id;
end $$;
revoke all on function public.confirm_work_order_quibi_document_revision(uuid,uuid) from public,anon,service_role;
grant execute on function public.confirm_work_order_quibi_document_revision(uuid,uuid) to authenticated;
  $legacy_sql$;
 else
  raise notice 'Internal task reference audit skipped: direct case journal remains authoritative';
 end if;
end $optional_legacy$;
notify pgrst,'reload schema';

-- Serialize SEND and UPDATE for the same remote document without rewriting historical journal rows.
create function private.guard_quibi_business_document_dispatch() returns trigger
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
revoke all on function private.guard_quibi_business_document_dispatch() from public,anon,authenticated,service_role;
create trigger quibi_business_dispatch_guard before update on public.quibi_dev_operation_journal for each row execute function private.guard_quibi_business_document_dispatch();
create trigger quibi_business_dispatch_guard before update on public.quibi_production_operation_journal for each row execute function private.guard_quibi_business_document_dispatch();
