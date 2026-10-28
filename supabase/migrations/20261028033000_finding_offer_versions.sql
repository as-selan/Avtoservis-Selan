begin;
-- Snapshots are append-only. A price is not evidence of a Quibi document.
create table public.case_finding_offers (
 id uuid primary key default gen_random_uuid(),
 finding_id uuid not null references public.case_repair_findings(id),
 case_id uuid not null references public.service_case_assignments(case_id),
 customer_id uuid not null references public.customers(id),
 vehicle_id uuid not null references public.vehicles(id),
 version integer not null check(version > 0),
 lines jsonb not null check(jsonb_typeof(lines)='array' and jsonb_array_length(lines)>0),
 content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
 prepared_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 unique(finding_id,version), unique(finding_id,content_sha256)
);
create table public.case_finding_offer_decisions (
 id uuid primary key default gen_random_uuid(), offer_id uuid not null unique references public.case_finding_offers(id),
 decision text not null check(decision in ('approved','rejected','noted')),
 decided_by uuid not null references public.profiles(id), decided_at timestamptz not null default clock_timestamp()
);
alter table public.case_finding_offers enable row level security;
alter table public.case_finding_offer_decisions enable row level security;
revoke all on public.case_finding_offers,public.case_finding_offer_decisions from public,anon,authenticated;
grant select on public.case_finding_offers,public.case_finding_offer_decisions to authenticated;
create policy finding_offer_read on public.case_finding_offers for select to authenticated using(public.can_read_case_work(case_id));
create policy finding_offer_decision_read on public.case_finding_offer_decisions for select to authenticated using(exists(select 1 from public.case_finding_offers o where o.id=offer_id and public.can_read_case_work(o.case_id)));
notify pgrst,'reload schema';
commit;
