begin;
create table public.case_repair_findings (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.service_case_assignments(case_id),
 author_id uuid not null references public.profiles(id), description text not null check(length(trim(description)) between 1 and 3000),
 state text not null default 'recorded' check(state in ('recorded','approved','rejected','noted')),
 decided_by uuid references public.profiles(id), decided_at timestamptz, created_at timestamptz not null default now()
);
create index case_repair_findings_case on public.case_repair_findings(case_id,created_at);
alter table public.case_repair_findings enable row level security;
revoke all on public.case_repair_findings from public,anon,authenticated;
grant select on public.case_repair_findings to authenticated;
create policy case_findings_read on public.case_repair_findings for select to authenticated using(public.can_read_case_work(case_id));
create function public.record_case_finding(p_case uuid,p_description text) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.service_case_assignments; result uuid;
begin
 select * into a from public.service_case_assignments where case_id=p_case for update;
 if not found or not public.can_read_case_work(p_case) then raise exception 'FORBIDDEN'; end if;
 if a.status not in ('in_progress','awaiting_parts') or length(trim(coalesce(p_description,''))) not between 1 and 3000 then raise exception 'INVALID_INPUT'; end if;
 insert into public.case_repair_findings(case_id,author_id,description) values(p_case,auth.uid(),trim(p_description)) returning id into result;
 return result;
end; $$;
revoke all on function public.record_case_finding(uuid,text) from public,anon;
grant execute on function public.record_case_finding(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
