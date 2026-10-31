-- Forward-only; prepare only. Hosted application requires explicit approval.
-- Existing DEV journal/data remains unchanged; production has a separate dispatch lock.
-- Prepared for reviewed Quibi DEV writes. Do not apply to hosted Supabase
-- without a separate review of this exact migration and environment.
-- One immutable outbound body per local entity and operation kind prevents
-- accidental payload changes on retry. Quibi remains the document authority.
create table public.quibi_production_operation_journal (
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

create unique index quibi_production_operation_external_id_unique
  on public.quibi_production_operation_journal(organization_id,external_id)
  where external_id is not null;
create unique index quibi_production_operation_send_id_unique
  on public.quibi_production_operation_journal(organization_id,send_id)
  where send_id is not null;
create unique index quibi_production_operation_created_entity_unique
  on public.quibi_production_operation_journal(organization_id,kind,quibi_id)
  where kind in ('customer','vehicle','estimate') and quibi_id is not null;
create index quibi_production_operation_request_idx
  on public.quibi_production_operation_journal(organization_id,service_request_id);

create function private.guard_quibi_production_operation_journal()
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
revoke all on function private.guard_quibi_production_operation_journal() from public,anon,authenticated;
create trigger quibi_production_operation_journal_guard before update
  on public.quibi_production_operation_journal for each row
  execute function private.guard_quibi_production_operation_journal();
create trigger quibi_production_operation_journal_updated before update
  on public.quibi_production_operation_journal for each row
  execute function public.set_updated_at();

alter table public.quibi_production_operation_journal enable row level security;
revoke all on public.quibi_production_operation_journal from public,anon,authenticated;
grant select on public.quibi_production_operation_journal to authenticated;
create policy quibi_production_operation_journal_read on public.quibi_production_operation_journal
  for select to authenticated using (
    private.has_org_role(organization_id,array['owner','admin','reception']::text[])
  );
-- All writes use the application service role after verified membership and
-- local/remote ownership checks; browser clients have no mutation grants.


grant all on public.quibi_production_operation_journal to service_role;
alter table public.customer_approvals add column delivery_proof_kind text not null default 'manual_staff_attestation'
  check (delivery_proof_kind in ('manual_staff_attestation','quibi_mail_server_acceptance'));
grant select(delivery_proof_kind) on public.customer_approvals to authenticated;
comment on column public.customer_approvals.delivery_proof_kind is
  'delivered is historical transport-handoff state; quibi_mail_server_acceptance never proves recipient receipt/read.';
create function private.guard_delivery_proof_kind() returns trigger language plpgsql set search_path='' as $$
begin
 if old.delivery_proof_kind is distinct from new.delivery_proof_kind then
  raise exception 'Delivery proof provenance is immutable' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.guard_delivery_proof_kind() from public,anon,authenticated;
create trigger customer_approval_proof_immutable before update on public.customer_approvals
 for each row execute function private.guard_delivery_proof_kind();

-- This records an API mail-server acceptance, NEVER a staff manual-delivery attestation.
create function public.record_quibi_api_dispatch(p_organization_id uuid,p_quote_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 op public.quibi_production_operation_journal%rowtype; q public.quotes%rowtype;
 approval public.customer_approvals%rowtype; case_status text; body jsonb; ref text;
begin
 select * into op from public.quibi_production_operation_journal
 where organization_id=p_organization_id and id=p_operation_id;
 if not found or op.kind<>'send' or op.local_entity_id<>p_quote_id or op.state<>'verified'
   or op.send_status<>'sent' or op.send_id is null or op.quibi_id is null then
  return jsonb_build_object('ok',false,'error_code','unverified_send'); end if;
 body:=op.request_body::jsonb;
 if body->>'path' is distinct from 'unified_quibi_send' or body->>'mode' is distinct from 'production'
   or body->>'quoteId' is distinct from p_quote_id::text or body->>'documentId' is distinct from op.quibi_id
   or body->>'organizationId' is distinct from p_organization_id::text
   or body->>'caseId' is distinct from op.service_request_id::text
   or body->>'sha256' is distinct from op.quibi_content_sha256 then
  return jsonb_build_object('ok',false,'error_code','invalid_binding'); end if;
 select * into q from public.quotes where organization_id=p_organization_id and id=p_quote_id;
 if not found then return jsonb_build_object('ok',false,'error_code','not_found'); end if;
 perform pg_advisory_xact_lock(910008,hashtext(p_organization_id::text||chr(31)||q.service_request_id::text));
 select * into q from public.quotes where organization_id=p_organization_id and id=p_quote_id for update;
 select status into case_status from public.service_requests where organization_id=p_organization_id
   and id=q.service_request_id and archived_at is null for update;
 if q.service_request_id<>op.service_request_id or q.content_sha256 is distinct from body->>'sha256'
   or q.quibi_environment<>'production' or q.internal_review_status<>'approved_for_send' or q.evidence_kind<>'quibi_manual_estimate'
   or q.evidence_payload->>'external_id' is distinct from op.quibi_id
   or q.evidence_payload->>'customer_external_id' is distinct from body->>'customerId'
   or case_status is null or case_status not in ('preparing_offer','awaiting_customer_approval')
   or exists(select 1 from public.quotes newer where newer.organization_id=p_organization_id
     and newer.service_request_id=q.service_request_id and newer.version_no>q.version_no) then
  return jsonb_build_object('ok',false,'error_code','stale_or_invalid'); end if;
 ref:='quibi-send:'||op.send_id;
 select * into approval from public.customer_approvals where organization_id=p_organization_id and quote_id=p_quote_id for update;
 if found then
  if approval.delivery_proof_kind='quibi_mail_server_acceptance' and approval.delivery_evidence_reference=ref then
   return jsonb_build_object('ok',true,'idempotent',true); end if;
  return jsonb_build_object('ok',false,'error_code','conflicting_delivery'); end if;
 if case_status<>'preparing_offer' then return jsonb_build_object('ok',false,'error_code','invalid_status'); end if;
 insert into public.customer_approvals(organization_id,service_request_id,quote_id,content_sha256,
  delivery_status,delivered_at,delivery_channel,delivery_evidence_reference,delivery_proof_kind,created_by_profile_id)
 values(p_organization_id,q.service_request_id,p_quote_id,q.content_sha256,'delivered',now(),'email',ref,
  'quibi_mail_server_acceptance',op.created_by_profile_id);
 update public.service_requests set status='awaiting_customer_approval' where organization_id=p_organization_id and id=q.service_request_id;
 return jsonb_build_object('ok',true,'idempotent',false,'receipt_confirmed',false);
end $$;
revoke all on function public.record_quibi_api_dispatch(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_quibi_api_dispatch(uuid,uuid,uuid) to service_role;


-- Existing links/quotes are DEV. Never reinterpret a DEV numeric ID in production.
alter table public.integration_links add column quibi_environment text not null default 'dev' check(quibi_environment in ('dev','production'));
alter table public.quibi_vehicle_links add column quibi_environment text not null default 'dev' check(quibi_environment in ('dev','production'));
alter table public.quotes add column quibi_environment text not null default 'dev' check(quibi_environment in ('dev','production'));
grant select(quibi_environment) on public.integration_links,public.quibi_vehicle_links,public.quotes to authenticated;
create function private.bind_quote_quibi_environment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if old.quibi_environment is distinct from new.quibi_environment then raise exception 'Quote Quibi environment is immutable' using errcode='23514'; end if;
 elsif new.evidence_kind='quibi_manual_estimate' then
  select l.quibi_environment into new.quibi_environment from public.service_requests sr join public.integration_links l
   on l.organization_id=sr.organization_id and l.entity_id=sr.customer_id and l.provider='quibi' and l.entity_type='customer'
   where sr.organization_id=new.organization_id and sr.id=new.service_request_id;
  if new.quibi_environment is null then raise exception 'Quote requires environment-bound Quibi link' using errcode='23514'; end if;
 end if;
 return new;
end $$;
revoke all on function private.bind_quote_quibi_environment() from public,anon,authenticated;
create trigger quote_quibi_environment before insert or update on public.quotes for each row execute function private.bind_quote_quibi_environment();

create function private.guard_quibi_link_environment() returns trigger language plpgsql set search_path='' as $$
begin
 if old.quibi_environment is distinct from new.quibi_environment then raise exception 'Confirmed Quibi environment is immutable' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.guard_quibi_link_environment() from public,anon,authenticated;
create trigger integration_link_quibi_environment before update on public.integration_links for each row execute function private.guard_quibi_link_environment();
create trigger vehicle_link_quibi_environment before update on public.quibi_vehicle_links for each row execute function private.guard_quibi_link_environment();
