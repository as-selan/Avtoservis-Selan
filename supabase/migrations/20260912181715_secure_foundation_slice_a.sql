-- =============================================================================
-- Slice A — Secure Supabase foundation (recreated from Architecture Freeze)
-- organizations / profiles / organization_memberships + helpers + RLS
--
-- PREPARE ONLY — do not apply until explicitly approved.
-- Scope: NO customers, vehicles, service_requests, appointments, activity,
--        quotes, integrations, service_orders, storage, or seed data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Private schema for RLS helpers (not in PostgREST exposed schemas)
-- -----------------------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to postgres;
grant usage on schema private to service_role;
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- 1) Reusable updated_at trigger function
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;
revoke all on function public.set_updated_at() from anon;
revoke all on function public.set_updated_at() from authenticated;

-- -----------------------------------------------------------------------------
-- 2) organizations
-- -----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  timezone text not null default 'Europe/Ljubljana',
  phone text,
  email text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_nonempty check (char_length(btrim(name)) > 0),
  constraint organizations_slug_nonempty check (char_length(btrim(slug)) > 0),
  constraint organizations_slug_unique unique (slug)
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row
  execute function public.set_updated_at();

alter table public.organizations enable row level security;

revoke all on table public.organizations from public;
revoke all on table public.organizations from anon;
revoke all on table public.organizations from authenticated;
grant select on table public.organizations to authenticated;
grant update (name, timezone, phone, email) on table public.organizations to authenticated;
-- insert/delete: service_role / trusted bootstrap only (no grant to authenticated)
-- column UPDATE limited: id/slug/archived_at/created_at/updated_at not updatable by browser
-- revoke-from-authenticated first clears any default table-wide privileges

-- -----------------------------------------------------------------------------
-- 3) profiles (1:1 with auth.users)
-- FK ON DELETE CASCADE: profile lifetime follows auth.users; deleting an auth
-- user removes the application profile (no orphan profile rows).
-- No role columns — authorization lives only in organization_memberships.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

alter table public.profiles enable row level security;

revoke all on table public.profiles from public;
revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;
-- insert/delete: auth trigger (security definer) / service_role only
-- column UPDATE limited: id/email/created_at/updated_at not updatable by browser
-- revoke-from-authenticated first clears any default table-wide privileges

-- -----------------------------------------------------------------------------
-- 4) auth.users → profiles trigger
-- SECURITY DEFINER required to insert into public.profiles despite RLS/grants.
-- raw_user_meta_data used only as optional display hint — never authorization.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;
-- executable by trigger owner only; not granted to clients

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 5) organization_memberships
-- Roles: text + CHECK (easier evolution than ENUM).
-- Identifiers include mechanic for future use; permissions NOT encoded here.
-- owner + admin both kept: owner = workshop proprietor; admin = elevated ops.
-- reception = service advisor / front desk (architecture "advisor" synonym).
-- -----------------------------------------------------------------------------
create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,
  is_active boolean not null default true,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_memberships_role_check
    check (role in ('owner', 'admin', 'reception', 'mechanic')),
  constraint organization_memberships_org_profile_unique
    unique (organization_id, profile_id),
  constraint organization_memberships_disabled_consistency
    check (
      (is_active = true and disabled_at is null)
      or (is_active = false and disabled_at is not null)
    )
);

create index organization_memberships_organization_id_idx
  on public.organization_memberships (organization_id);

create index organization_memberships_profile_id_idx
  on public.organization_memberships (profile_id);

create index organization_memberships_active_org_profile_idx
  on public.organization_memberships (organization_id, profile_id)
  where is_active = true;

create trigger organization_memberships_set_updated_at
  before update on public.organization_memberships
  for each row
  execute function public.set_updated_at();

alter table public.organization_memberships enable row level security;

revoke all on table public.organization_memberships from public;
revoke all on table public.organization_memberships from anon;
revoke all on table public.organization_memberships from authenticated;
grant select on table public.organization_memberships to authenticated;
-- insert/update/delete: deferred — trusted membership-management slice / service_role
-- (prevents browser self-promotion / privilege escalation in this foundation slice)
-- revoke-from-authenticated first clears any default table-wide privileges

-- -----------------------------------------------------------------------------
-- 6) RLS helper functions (private schema, SECURITY DEFINER to avoid RLS recursion)
-- All relations fully schema-qualified; search_path locked empty.
-- -----------------------------------------------------------------------------
create or replace function private.is_active_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships as m
    where m.organization_id = p_organization_id
      and m.profile_id = (select auth.uid())
      and m.is_active = true
  );
$$;

create or replace function private.has_org_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships as m
    where m.organization_id = p_organization_id
      and m.profile_id = (select auth.uid())
      and m.is_active = true
      and m.role = any (p_roles)
  );
$$;

create or replace function private.shares_active_org_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships as mine
    inner join public.organization_memberships as theirs
      on theirs.organization_id = mine.organization_id
    where mine.profile_id = (select auth.uid())
      and mine.is_active = true
      and theirs.profile_id = p_profile_id
      and theirs.is_active = true
  );
$$;

revoke all on function private.is_active_org_member(uuid) from public;
revoke all on function private.is_active_org_member(uuid) from anon;
grant execute on function private.is_active_org_member(uuid) to authenticated;

revoke all on function private.has_org_role(uuid, text[]) from public;
revoke all on function private.has_org_role(uuid, text[]) from anon;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;

revoke all on function private.shares_active_org_with(uuid) from public;
revoke all on function private.shares_active_org_with(uuid) from anon;
grant execute on function private.shares_active_org_with(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7) RLS policies — authenticated only; no anon policies
-- FORCE ROW LEVEL SECURITY is NOT used (owners/bypass roles still bypass RLS).
-- -----------------------------------------------------------------------------

-- organizations
create policy organizations_select_active_member
  on public.organizations
  for select
  to authenticated
  using (private.is_active_org_member(id));

create policy organizations_update_owner_admin
  on public.organizations
  for update
  to authenticated
  using (private.has_org_role(id, array['owner', 'admin']::text[]))
  with check (private.has_org_role(id, array['owner', 'admin']::text[]));

-- profiles
create policy profiles_select_self_or_same_org
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or private.shares_active_org_with(id)
  );

create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- organization_memberships (read-only for clients in this slice)
create policy organization_memberships_select_active_member
  on public.organization_memberships
  for select
  to authenticated
  using (private.is_active_org_member(organization_id));

-- =============================================================================
-- End Slice A
-- Bootstrap (first organization + owner membership) is a later controlled
-- service-role / trusted-server operation — intentionally NOT seeded here.
-- =============================================================================
