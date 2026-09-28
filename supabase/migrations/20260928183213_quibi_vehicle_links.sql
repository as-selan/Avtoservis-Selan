-- Confirmed ID mapping only. Quibi remains the owner of vehicle service records.
create table public.quibi_vehicle_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid not null,
  vehicle_id uuid not null,
  quibi_customer_id text not null check (quibi_customer_id ~ '^[0-9]+$'),
  quibi_vehicle_id text not null check (quibi_vehicle_id ~ '^[0-9]+$'),
  local_fingerprint text not null check (local_fingerprint ~ '^[0-9a-f]{64}$'),
  external_fingerprint text not null check (external_fingerprint ~ '^[0-9a-f]{64}$'),
  sync_status text not null default 'never_checked'
    check (sync_status in ('never_checked','ok','local_changed','remote_changed','both_changed','error')),
  last_checked_at timestamptz,
  last_seen_fingerprint text check (last_seen_fingerprint is null or last_seen_fingerprint ~ '^[0-9a-f]{64}$'),
  last_error_code text check (last_error_code is null or last_error_code in
    ('QUIBI_NOT_CONFIGURED','QUIBI_UNAVAILABLE','QUIBI_ACCESS_DENIED','QUIBI_INVALID_RESPONSE','QUIBI_READ_FAILED')),
  confirmed_by uuid not null,
  confirmed_at timestamptz not null default now(),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, vehicle_id) references public.vehicles(organization_id, id) on delete restrict,
  foreign key (organization_id, confirmed_by) references public.organization_memberships(organization_id, profile_id) on delete restrict,
  unique (organization_id, vehicle_id),
  unique (organization_id, quibi_vehicle_id)
);

create function private.validate_quibi_vehicle_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.vehicles v
    where v.organization_id = new.organization_id and v.id = new.vehicle_id
      and v.customer_id = new.customer_id and v.archived_at is null)
    or not exists (select 1 from public.integration_links l
      where l.organization_id = new.organization_id and l.provider = 'quibi'
        and l.entity_type = 'customer' and l.entity_id = new.customer_id
        and l.external_id = new.quibi_customer_id)
  then raise exception 'Quibi vehicle link must belong to a confirmed local/remote customer pair'
    using errcode = '23514'; end if;
  return new;
end $$;
revoke all on function private.validate_quibi_vehicle_link() from public, anon, authenticated;
create trigger quibi_vehicle_link_validate before insert or update of
  organization_id, customer_id, vehicle_id, quibi_customer_id, quibi_vehicle_id
  on public.quibi_vehicle_links for each row execute function private.validate_quibi_vehicle_link();

create index quibi_vehicle_links_customer_idx on public.quibi_vehicle_links(organization_id, customer_id);
alter table public.quibi_vehicle_links enable row level security;
revoke all on public.quibi_vehicle_links from public, anon, authenticated;
grant select on public.quibi_vehicle_links to authenticated;

create policy quibi_vehicle_links_select on public.quibi_vehicle_links
  for select to authenticated using (
    private.has_org_role(organization_id, array['owner','admin','reception']::text[])
  );
-- Only the server action may write after a fresh Quibi read. Browser roles cannot
-- forge confirmed IDs or a successful sync status.
