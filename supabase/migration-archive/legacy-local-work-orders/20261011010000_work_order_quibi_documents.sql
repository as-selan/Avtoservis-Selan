-- Reference only: Quibi owns business documents. No document or state duplication.
create table public.work_order_quibi_documents (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 work_order_id uuid not null, document_kind text not null check(document_kind in ('work_order','invoice')),
 quibi_environment text not null check(quibi_environment in ('dev','production')),
 quibi_document_id text not null check(quibi_document_id ~ '^[1-9][0-9]*$'),
 quibi_customer_id text not null check(quibi_customer_id ~ '^[1-9][0-9]*$'),
 quibi_vehicle_id text not null check(quibi_vehicle_id ~ '^[1-9][0-9]*$'),
 content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
 confirmed_by_profile_id uuid not null, confirmed_at timestamptz not null default now(),
 unique(organization_id,work_order_id,document_kind),
 unique(organization_id,quibi_environment,document_kind,quibi_document_id),
 foreign key(organization_id,work_order_id) references public.work_orders(organization_id,id),
 foreign key(organization_id,confirmed_by_profile_id) references public.organization_memberships(organization_id,profile_id)
);
alter table public.work_order_quibi_documents enable row level security;
revoke all on public.work_order_quibi_documents from public,anon,authenticated;
grant select on public.work_order_quibi_documents to authenticated;
-- Only the authenticated server action may persist fresh API-verified associations.
revoke all on public.work_order_quibi_documents from service_role;
grant select,insert on public.work_order_quibi_documents to service_role;
create policy work_order_quibi_documents_read on public.work_order_quibi_documents for select to authenticated
 using(private.has_org_role(organization_id,array['owner','admin','reception']::text[]));
create function private.guard_work_order_quibi_document_link() returns trigger language plpgsql security definer set search_path='' as $$
declare w public.work_orders%rowtype;
begin
 select * into w from public.work_orders where organization_id=new.organization_id and id=new.work_order_id for update;
 if not found or w.status='closed' or not exists(select 1 from public.organization_memberships m where m.organization_id=new.organization_id and m.profile_id=new.confirmed_by_profile_id and m.is_active and m.role in ('owner','admin')) then raise exception 'Authorized open work order required' using errcode='23514';end if;
 if not exists(select 1 from public.integration_links c join public.quibi_vehicle_links v on v.organization_id=c.organization_id and v.customer_id=c.entity_id
 where c.organization_id=new.organization_id and c.provider='quibi' and c.entity_type='customer' and c.entity_id=w.customer_id and c.external_id=new.quibi_customer_id and c.quibi_environment=new.quibi_environment and c.sync_status='ok'
 and v.vehicle_id=w.vehicle_id and v.quibi_customer_id=new.quibi_customer_id and v.quibi_vehicle_id=new.quibi_vehicle_id and v.quibi_environment=new.quibi_environment and v.sync_status='ok') then raise exception 'Current customer and vehicle links required' using errcode='23514';end if;
 return new;
end $$;
revoke all on function private.guard_work_order_quibi_document_link() from public,anon,authenticated;
create trigger work_order_quibi_document_guard before insert on public.work_order_quibi_documents for each row execute function private.guard_work_order_quibi_document_link();

notify pgrst,'reload schema';
