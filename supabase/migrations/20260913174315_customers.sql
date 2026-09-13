-- =============================================================================
-- M3 PREP — customers (first business table)
--
-- PREPARE ONLY — do not apply until explicitly approved.
-- Scope: public.customers only. No vehicles, service_requests, or seed data.
-- Mechanic access is deferred (restricted vs full workshop — not implemented).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) customers
-- Phone/email are optional and NOT unique (phone-first intake; duplicates
-- are an attention/search concern, not a DB uniqueness rule).
-- unique (organization_id, id) is the target for later same-org FKs
-- (vehicles, service_requests).
-- -----------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  customer_type text not null default 'individual',
  display_name text not null,
  email text,
  phone text,
  notes text,
  source text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_customer_type_check
    check (customer_type in ('individual', 'business')),
  constraint customers_display_name_nonempty
    check (char_length(btrim(display_name)) > 0),
  constraint customers_source_check
    check (
      source is null
      or source in ('web_form', 'phone', 'sms', 'manual', 'other')
    ),
  constraint customers_org_id_id_unique
    unique (organization_id, id)
);

create index customers_organization_id_archived_at_idx
  on public.customers (organization_id, archived_at);

create trigger customers_set_updated_at
  before update on public.customers
  for each row
  execute function public.set_updated_at();

alter table public.customers enable row level security;

revoke all on table public.customers from public;
revoke all on table public.customers from anon;
revoke all on table public.customers from authenticated;
grant select on table public.customers to authenticated;
grant insert on table public.customers to authenticated;
grant update (
  customer_type,
  display_name,
  email,
  phone,
  notes,
  source,
  archived_at
) on table public.customers to authenticated;
-- delete: not granted — archive via archived_at
-- column UPDATE limited: id/organization_id/created_at/updated_at not updatable by browser
-- revoke-from-authenticated first clears any default table-wide privileges

-- -----------------------------------------------------------------------------
-- 2) RLS — authenticated only; no anon policies
-- SELECT / INSERT / UPDATE: owner / admin / reception only.
-- Mechanic: excluded until Tadej's restricted vs full-workshop modes exist.
-- DELETE: none for clients.
-- -----------------------------------------------------------------------------
create policy customers_select_advisor_plus
  on public.customers
  for select
  to authenticated
  using (
    private.has_org_role(
      organization_id,
      array['owner', 'admin', 'reception']::text[]
    )
  );

create policy customers_insert_advisor_plus
  on public.customers
  for insert
  to authenticated
  with check (
    private.has_org_role(
      organization_id,
      array['owner', 'admin', 'reception']::text[]
    )
  );

create policy customers_update_advisor_plus
  on public.customers
  for update
  to authenticated
  using (
    private.has_org_role(
      organization_id,
      array['owner', 'admin', 'reception']::text[]
    )
  )
  with check (
    private.has_org_role(
      organization_id,
      array['owner', 'admin', 'reception']::text[]
    )
  );

-- =============================================================================
-- End M3 PREP — customers
-- =============================================================================
