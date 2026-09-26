-- Quibi V1: manually confirmed customer ID links only. No external data cache.
create table public.integration_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider text not null check (provider = 'quibi'),
  entity_type text not null check (entity_type = 'customer'),
  entity_id uuid not null,
  external_id text not null check (external_id ~ '^[0-9]+$'),
  local_fingerprint text not null check (local_fingerprint ~ '^[0-9a-f]{64}$'),
  external_fingerprint text not null check (external_fingerprint ~ '^[0-9a-f]{64}$'),
  confirmed_by uuid not null,
  confirmed_at timestamptz not null default now(),
  constraint integration_links_customer_fk foreign key (organization_id, entity_id)
    references public.customers (organization_id, id) on delete restrict,
  constraint integration_links_member_fk foreign key (organization_id, confirmed_by)
    references public.organization_memberships (organization_id, profile_id) on delete restrict,
  constraint integration_links_local_unique unique (organization_id, provider, entity_type, entity_id),
  constraint integration_links_external_unique unique (organization_id, provider, entity_type, external_id)
);

create index integration_links_org_idx on public.integration_links (organization_id);
alter table public.integration_links enable row level security;
revoke all on public.integration_links from public, anon, authenticated;
grant select on public.integration_links to authenticated;
grant insert (organization_id, provider, entity_type, entity_id, external_id,
  local_fingerprint, external_fingerprint, confirmed_by) on public.integration_links to authenticated;

create policy integration_links_select_operational on public.integration_links
  for select to authenticated using (
    private.has_org_role(organization_id, array['owner','admin','reception']::text[])
  );
create policy integration_links_insert_operational on public.integration_links
  for insert to authenticated with check (
    confirmed_by = (select auth.uid())
    and private.has_org_role(organization_id, array['owner','admin','reception']::text[])
    and exists (select 1 from public.customers c
      where c.organization_id = integration_links.organization_id
        and c.id = integration_links.entity_id and c.archived_at is null)
  );
