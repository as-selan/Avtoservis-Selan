begin;

-- One approved version may be applied to each finding. The server records the
-- catalog snapshot; callers with ordinary sessions cannot fabricate prices.
alter table public.case_finding_offers
 add column quibi_operation_id uuid,
 add column quibi_document_id text,
 add column quibi_content_sha256 text check (quibi_content_sha256 is null or quibi_content_sha256 ~ '^[a-f0-9]{64}$'),
 add column completed_by uuid references public.profiles(id),
 add column completed_at timestamptz,
 add constraint finding_operation_complete check ((quibi_operation_id is null and quibi_document_id is null and quibi_content_sha256 is null) or (quibi_operation_id is not null and quibi_document_id is not null and quibi_content_sha256 is not null)),
 add constraint finding_completion_complete check ((completed_by is null) = (completed_at is null));

create unique index case_finding_one_applied on public.case_finding_offers(finding_id) where quibi_operation_id is not null;

create function public.record_finding_catalog_decision(
 p_case uuid, p_finding uuid, p_actor uuid, p_lines jsonb, p_sha text, p_decision text
) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.service_case_assignments; s public.service_requests; f public.case_repair_findings; v_id uuid; v_version integer;
begin
 select * into a from public.service_case_assignments where case_id=p_case for update;
 select * into s from public.service_requests where id=p_case and archived_at is null;
 select * into f from public.case_repair_findings where id=p_finding and case_id=p_case for update;
 if a.case_id is null or s.id is null or f.id is null or s.organization_id<>a.organization_id or s.vehicle_id<>a.vehicle_id
    or not exists(select 1 from public.organization_memberships where organization_id=a.organization_id and profile_id=p_actor and is_active and role in ('owner','admin')) then raise exception 'FORBIDDEN'; end if;
 if f.state<>'recorded' or a.status not in ('in_progress','awaiting_parts') or s.customer_id is null or p_decision not in ('approved','rejected')
    or p_sha !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<>1 then raise exception 'INVALID_INPUT'; end if;
 if exists(select 1 from public.case_finding_offers o join public.case_finding_offer_decisions d on d.offer_id=o.id where o.finding_id=p_finding and d.decision='approved') then raise exception 'FINDING_ALREADY_APPROVED'; end if;
 select coalesce(max(version),0)+1 into v_version from public.case_finding_offers where finding_id=p_finding;
 insert into public.case_finding_offers(finding_id,case_id,customer_id,vehicle_id,version,lines,content_sha256,prepared_by)
 values(p_finding,p_case,s.customer_id,s.vehicle_id,v_version,p_lines,p_sha,p_actor) returning id into v_id;
 insert into public.case_finding_offer_decisions(offer_id,decision,decided_by) values(v_id,p_decision,p_actor);
 update public.case_repair_findings set state=p_decision,decided_by=p_actor,decided_at=clock_timestamp() where id=p_finding;
 return v_id;
end; $$;
revoke all on function public.record_finding_catalog_decision(uuid,uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.record_finding_catalog_decision(uuid,uuid,uuid,jsonb,text,text) to service_role;

-- Binding and assignment revision are one transaction. Only the server may
-- bind an operation, and only an independently verified DEV journal row.
create function public.bind_finding_catalog_operation(p_case uuid,p_offer uuid,p_operation uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.case_finding_offers; a public.service_case_assignments; j public.quibi_dev_operation_journal;
begin
 select * into a from public.service_case_assignments where case_id=p_case for update;
 select * into o from public.case_finding_offers where id=p_offer and case_id=p_case for update;
 select * into j from public.quibi_dev_operation_journal where id=p_operation and organization_id=a.organization_id and service_request_id=p_case and kind='work_order_update' and state='verified';
 if o.id is null or j.id is null or not exists(select 1 from public.case_finding_offer_decisions where offer_id=o.id and decision='approved')
 or j.quibi_id<>a.quibi_work_order_id or j.request_sha256<>o.lines->0->>'requestSha'
 or j.quibi_content_sha256 is null or coalesce(j.request_body::jsonb->>'baselineSha','')<>o.lines->0->>'baselineSha' then raise exception 'OPERATION_UNVERIFIED'; end if;
 if o.quibi_operation_id is not null then
  if o.quibi_operation_id=p_operation then return; end if;
  raise exception 'FINDING_ALREADY_APPLIED';
 end if;
 if a.quibi_content_sha256<>o.lines->0->>'baselineSha' then raise exception 'REFERENCE_CHANGED'; end if;
 update public.case_finding_offers set quibi_operation_id=j.id,quibi_document_id=j.quibi_id,quibi_content_sha256=j.quibi_content_sha256 where id=o.id;
 update public.service_case_assignments set quibi_content_sha256=j.quibi_content_sha256,updated_at=clock_timestamp() where case_id=p_case;
end; $$;
revoke all on function public.bind_finding_catalog_operation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.bind_finding_catalog_operation(uuid,uuid,uuid) to service_role;

create function public.complete_finding_catalog_work(p_case uuid,p_offer uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.can_read_case_work(p_case) then raise exception 'FORBIDDEN'; end if;
 update public.case_finding_offers o set completed_by=auth.uid(),completed_at=clock_timestamp()
 from public.service_case_assignments a, public.case_finding_offer_decisions d
 where o.id=p_offer and o.case_id=p_case and a.case_id=o.case_id and a.status in ('in_progress','awaiting_parts')
 and d.offer_id=o.id and d.decision='approved' and o.quibi_operation_id is not null and o.completed_at is null;
 if not found then raise exception 'FINDING_WORK_UNAVAILABLE'; end if;
end; $$;
revoke all on function public.complete_finding_catalog_work(uuid,uuid) from public,anon;
grant execute on function public.complete_finding_catalog_work(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
