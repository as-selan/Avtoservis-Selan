-- Prepared for reviewed Quibi DEV writes. Do not apply to hosted Supabase
-- without a separate review of this exact migration and environment.
-- One immutable outbound body per local entity and operation kind prevents
-- accidental payload changes on retry. Quibi remains the document authority.
create table public.quibi_dev_operation_journal (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  service_request_id uuid not null,
  local_entity_id uuid not null,
  kind text not null check (kind in ('customer','vehicle','estimate','estimate_update','send')),
  external_id text check (external_id is null or char_length(external_id) between 1 and 128),
  request_body text not null check (jsonb_typeof(request_body::jsonb) = 'object'),
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  state text not null default 'prepared'
    check (state in ('prepared','dispatching','uncertain','verified','failed')),
  quibi_id text check (quibi_id is null or quibi_id ~ '^[0-9]+$'),
  quibi_content_sha256 text check (quibi_content_sha256 is null or quibi_content_sha256 ~ '^[0-9a-f]{64}$'),
  document_number text check (document_number is null or char_length(document_number) between 1 and 128),
  send_id text check (send_id is null or char_length(send_id) between 1 and 128),
  send_status text check (send_status is null or send_status in ('queued','sent','failed')),
  send_status_checked_at timestamptz,
  attempted_at timestamptz,
  verified_at timestamptz,
  created_by_profile_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, service_request_id)
    references public.service_requests(organization_id,id) on delete restrict,
  foreign key (organization_id, created_by_profile_id)
    references public.organization_memberships(organization_id,profile_id) on delete restrict,
  unique (organization_id,kind,local_entity_id),
  check ((kind = 'estimate' and service_request_id = local_entity_id and external_id is not null)
    or (kind = 'customer' and external_id = local_entity_id::text)
    or (kind in ('vehicle','estimate_update','send') and external_id is null))
);

create unique index quibi_dev_operation_external_id_unique
  on public.quibi_dev_operation_journal(organization_id,external_id)
  where external_id is not null;
create unique index quibi_dev_operation_send_id_unique
  on public.quibi_dev_operation_journal(organization_id,send_id)
  where send_id is not null;
create unique index quibi_dev_operation_created_entity_unique
  on public.quibi_dev_operation_journal(organization_id,kind,quibi_id)
  where kind in ('customer','vehicle','estimate') and quibi_id is not null;
create index quibi_dev_operation_request_idx
  on public.quibi_dev_operation_journal(organization_id,service_request_id);

create function private.guard_quibi_dev_operation_journal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.organization_id is distinct from new.organization_id
    or old.service_request_id is distinct from new.service_request_id
    or old.local_entity_id is distinct from new.local_entity_id
    or old.kind is distinct from new.kind
    or old.external_id is distinct from new.external_id
    or old.request_body is distinct from new.request_body
    or old.request_sha256 is distinct from new.request_sha256
    or old.created_by_profile_id is distinct from new.created_by_profile_id
    or old.created_at is distinct from new.created_at then
    raise exception 'Quibi request identity and body are immutable' using errcode = '23514';
  end if;
  if old.state = 'verified' and new.state is distinct from old.state then
    raise exception 'Verified Quibi write cannot be retried' using errcode = '23514';
  end if;
  if old.quibi_id is not null and new.quibi_id is distinct from old.quibi_id then
    raise exception 'Quibi ID is immutable' using errcode = '23514';
  end if;
  if old.send_id is not null and new.send_id is distinct from old.send_id then
    raise exception 'Quibi send ID is immutable' using errcode = '23514';
  end if;
  if old.state = 'verified' and (
    old.quibi_content_sha256 is distinct from new.quibi_content_sha256
    or old.document_number is distinct from new.document_number
  ) then
    raise exception 'Verified Quibi document evidence is immutable' using errcode = '23514';
  end if;
  if old.state = 'dispatching' and new.state not in ('dispatching','uncertain')
    or old.state = 'prepared' and new.state not in ('prepared','dispatching')
    or old.state = 'uncertain' and new.state not in ('uncertain','dispatching','verified','failed')
    or old.state = 'failed' and new.state <> 'failed' then
    raise exception 'Invalid Quibi operation transition' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.guard_quibi_dev_operation_journal() from public,anon,authenticated;
create trigger quibi_dev_operation_journal_guard before update
  on public.quibi_dev_operation_journal for each row
  execute function private.guard_quibi_dev_operation_journal();
create trigger quibi_dev_operation_journal_updated before update
  on public.quibi_dev_operation_journal for each row
  execute function public.set_updated_at();

alter table public.quibi_dev_operation_journal enable row level security;
revoke all on public.quibi_dev_operation_journal from public,anon,authenticated;
grant select on public.quibi_dev_operation_journal to authenticated;
create policy quibi_dev_operation_journal_read on public.quibi_dev_operation_journal
  for select to authenticated using (
    private.has_org_role(organization_id,array['owner','admin','reception']::text[])
  );
-- All writes use the application service role after verified membership and
-- local/remote ownership checks; browser clients have no mutation grants.
