-- Preparation only. Hosted installation requires separate explicit approval.
-- Internal review/closure evidence; no business documents, financial writes or Auth changes.
begin;
create table public.service_case_reviews (
 id uuid primary key, case_id uuid not null references public.service_case_assignments(case_id),
 actor_id uuid not null references public.profiles(id), action text not null check(action in ('accepted','returned','invoice_checked','closed')),
 evidence_sha text not null check(evidence_sha ~ '^[a-f0-9]{64}$'), quibi_work_order_id text not null,
 quibi_environment text not null check(quibi_environment in ('dev','production')), simulated boolean not null,
 body jsonb not null check(jsonb_typeof(body)='object'), created_at timestamptz not null default clock_timestamp(),
 check(not simulated or quibi_environment='dev')
);
create index service_case_reviews_case on public.service_case_reviews(case_id,created_at);
create unique index service_case_review_closed_version on public.service_case_reviews(case_id,evidence_sha) where action='closed';
alter table public.service_case_reviews enable row level security;
revoke all on public.service_case_reviews from public,anon,authenticated,service_role;
grant select on public.service_case_reviews to authenticated;
grant select,insert on public.service_case_reviews to service_role;
create policy service_case_review_read on public.service_case_reviews for select to authenticated using(
 exists(select 1 from public.service_case_assignments a where a.case_id=service_case_reviews.case_id and public.can_read_case_work(a.case_id) and public.team_has_role(a.organization_id,array['owner','admin']))
);
create function private.case_work_evidence_sha(p_case uuid) returns text language sql stable set search_path='' as $$
 select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object('case',a.case_id,'mechanic',a.mechanic_id,'status',a.status,'updated',a.updated_at,'order',a.quibi_work_order_id,'sha',a.quibi_content_sha256,'customer',a.quibi_customer_id,'vehicle',a.quibi_vehicle_id,
 'notes',(select coalesce(jsonb_agg(jsonb_build_array(n.id,n.body,n.created_at) order by n.id),'[]') from public.service_case_notes n where n.case_id=a.case_id),
 'photos',(select coalesce(jsonb_agg(jsonb_build_array(p.id,p.caption,p.object_path,p.state,p.created_at) order by p.id),'[]') from public.service_case_photos p where p.case_id=a.case_id))::text,'UTF8')),'hex') from public.service_case_assignments a where a.case_id=p_case;
$$;
revoke all on function private.case_work_evidence_sha(uuid) from public,anon,authenticated;
grant execute on function private.case_work_evidence_sha(uuid) to service_role;
-- Serialize evidence edits with review decisions; a concurrent upload/note cannot slip past a review.
create function private.lock_case_work_evidence() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.service_case_assignments where case_id=new.case_id for update;
 if tg_table_name='service_case_photos' and tg_op='UPDATE' and (to_jsonb(new)-'approved_for_customer')=(to_jsonb(old)-'approved_for_customer') then return new;end if;
 if exists(select 1 from public.service_case_reviews e where e.case_id=new.case_id and e.action='closed' and e.evidence_sha=private.case_work_evidence_sha(new.case_id)) then raise exception 'CASE_CLOSED';end if;return new;end;$$;
revoke all on function private.lock_case_work_evidence() from public,anon,authenticated;
create function private.guard_closed_case_work() returns trigger language plpgsql security definer set search_path='' as $$declare h text;begin
 h=private.case_work_evidence_sha(old.case_id);
 if exists(select 1 from public.service_case_reviews e where e.case_id=old.case_id and e.action='closed' and e.evidence_sha=h)
 and not exists(select 1 from public.service_case_reviews e where e.case_id=old.case_id and e.action='returned' and e.evidence_sha=h) then raise exception 'CASE_CLOSED';end if;return new;end;$$;
revoke all on function private.guard_closed_case_work() from public,anon,authenticated;
create trigger case_assignment_closed_guard before update on public.service_case_assignments for each row execute function private.guard_closed_case_work();
create trigger case_notes_review_lock before insert or update on public.service_case_notes for each row execute function private.lock_case_work_evidence();
create trigger case_photos_review_lock before insert or update on public.service_case_photos for each row execute function private.lock_case_work_evidence();
create function public.case_work_review_snapshot(p_case uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('case_id',a.case_id,'evidence_sha',private.case_work_evidence_sha(a.case_id),
 'review_activity',(select max(e.created_at) from public.service_case_reviews e where e.case_id=a.case_id),
 'work_locked',exists(select 1 from public.service_case_reviews e where e.case_id=a.case_id and e.action='closed' and e.evidence_sha=private.case_work_evidence_sha(a.case_id)),
 'simulated',s.problem_description ~* 'QA-SIM|QA PREIZKUS|SINTETIČNI|SYNTHETIC' or exists(select 1 from public.service_case_reviews e where e.case_id=a.case_id and e.simulated),
 'events',case when public.team_has_role(a.organization_id,array['owner','admin']) then (select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'evidence_sha',e.evidence_sha,'created_at',e.created_at,'simulated',e.simulated,'body',e.body,'actor_label',coalesce(nullif(p.full_name,''),p.email)) order by e.created_at,e.id),'[]') from public.service_case_reviews e join public.profiles p on p.id=e.actor_id where e.case_id=a.case_id) else '[]'::jsonb end)) ,'[]')
 from public.service_case_assignments a join public.service_requests s on s.id=a.case_id where (p_case is null or a.case_id=p_case) and public.can_read_case_work(a.case_id);
$$;
revoke all on function public.case_work_review_snapshot(uuid) from public,anon;
grant execute on function public.case_work_review_snapshot(uuid) to authenticated;
-- Only trusted server code can attest fresh Quibi invoice/PDF/payment reads.
-- User and organization are rechecked inside the function, independently of the UI.
create function public.record_case_work_review(p_case uuid,p_actor uuid,p_action text,p_expected text,p_body jsonb,p_simulated boolean,p_environment text,p_operation uuid) returns uuid language plpgsql set search_path='' as $$
declare a public.service_case_assignments; old_event public.service_case_reviews; invoice_event public.service_case_reviews; jtable text; valid_invoice boolean; unknown_document boolean;
begin
 select * into a from public.service_case_assignments where case_id=p_case for update;
 if not found or not exists(select 1 from public.organization_memberships m join public.service_requests s on s.id=a.case_id and s.organization_id=m.organization_id where m.organization_id=a.organization_id and m.profile_id=p_actor and m.is_active and m.role in ('owner','admin') and s.archived_at is null and s.vehicle_id=a.vehicle_id) then raise exception 'FORBIDDEN';end if;
 select * into old_event from public.service_case_reviews where id=p_operation;
 if found then if old_event.case_id=p_case and old_event.actor_id=p_actor and old_event.action=p_action and old_event.evidence_sha=p_expected and old_event.body=p_body and old_event.simulated=p_simulated and old_event.quibi_environment=p_environment then return old_event.id;else raise exception 'OPERATION_CHANGED';end if;end if;
 if a.status<>'work_completed' or p_expected is distinct from private.case_work_evidence_sha(p_case) then raise exception 'EVIDENCE_CHANGED';end if;
 if p_action not in ('accepted','returned','invoice_checked','closed') or p_environment not in ('dev','production') or p_simulated is null or jsonb_typeof(p_body)<>'object' or length(trim(coalesce(p_body->>'reference',''))) not between 12 and 1000 then raise exception 'INVALID_INPUT';end if;
 if (p_simulated and p_environment<>'dev') or (not p_simulated and (exists(select 1 from public.service_requests s where s.id=p_case and s.problem_description ~* 'QA-SIM|QA PREIZKUS|SINTETIČNI|SYNTHETIC') or exists(select 1 from public.service_case_reviews e where e.case_id=p_case and e.simulated))) then raise exception 'QA_LABEL_REQUIRED';end if;
 if p_action<>'returned' and exists(select 1 from public.service_case_reviews e where e.case_id=p_case and e.action='closed' and e.evidence_sha=p_expected) then raise exception 'ALREADY_CLOSED';end if;
 if p_action in ('invoice_checked','closed') then
  if not exists(select 1 from public.service_case_reviews e where e.case_id=p_case and e.action='accepted' and e.evidence_sha=p_expected) then raise exception 'REVIEW_REQUIRED';end if;
  jtable=case p_environment when 'dev' then 'quibi_dev_operation_journal' else 'quibi_production_operation_journal' end;
  execute format('select exists(select 1 from public.%I where organization_id=$1 and service_request_id=$2 and kind in (''invoice'',''invoice_update'') and state=''verified'' and quibi_id=$3 and quibi_content_sha256=$4), exists(select 1 from public.%I where organization_id=$1 and service_request_id=$2 and kind in (''invoice'',''invoice_update'',''work_order'',''work_order_update'') and state in (''prepared'',''dispatching'',''uncertain''))',jtable,jtable) into valid_invoice,unknown_document using a.organization_id,p_case,p_body->>'invoiceId',p_body->>'invoiceSha';
  if not valid_invoice or unknown_document or p_body->>'pdfVerified' is distinct from 'true' then raise exception 'INVOICE_UNVERIFIED';end if;
 end if;
 if p_action='closed' then
  select * into invoice_event from public.service_case_reviews e where e.case_id=p_case and e.action='invoice_checked' and e.evidence_sha=p_expected and e.body->>'invoiceId'=p_body->>'invoiceId' and e.body->>'invoiceSha'=p_body->>'invoiceSha' order by e.created_at desc limit 1;
  if not found or length(trim(coalesce(p_body->>'handoverReference',''))) not between 12 and 1000 or length(trim(coalesce(p_body->>'paymentHandling',''))) not between 12 and 1000 then raise exception 'CLOSURE_EVIDENCE_REQUIRED';end if;
 end if;
 insert into public.service_case_reviews(id,case_id,actor_id,action,evidence_sha,quibi_work_order_id,quibi_environment,simulated,body) values(p_operation,p_case,p_actor,p_action,p_expected,a.quibi_work_order_id,p_environment,p_simulated,p_body);
 if p_action='returned' then
  update public.service_case_assignments set status='in_progress',updated_at=clock_timestamp() where case_id=p_case;
  insert into public.service_case_notes(case_id,author_id,body) values(p_case,p_actor,(case when p_simulated then 'QA simulacija – ' else '' end)||'Vodja je vrnil delo v obravnavo: '||(p_body->>'reference'));
 end if;
 -- Historical intake status and Quibi documents remain unchanged. The append-only
 -- closure event is the authoritative internal closure of this evidence version.
 return p_operation;
end;$$;
revoke all on function public.record_case_work_review(uuid,uuid,text,text,jsonb,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.record_case_work_review(uuid,uuid,text,text,jsonb,boolean,text,uuid) to service_role;
commit;
