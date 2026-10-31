-- Existing local QA database only. Roll back every test record.
begin;
do $$
declare case_row record; op_id uuid; local_id uuid:=gen_random_uuid();
begin
 select r.id,r.organization_id,m.profile_id into case_row from public.service_requests r join public.organization_memberships m on m.organization_id=r.organization_id where m.role in ('owner','admin') limit 1;
 if case_row.id is null then raise exception 'Existing local case and administrator required'; end if;
 insert into public.quibi_dev_operation_journal(organization_id,service_request_id,local_entity_id,kind,external_id,request_body,request_sha256,created_by_profile_id)
 values(case_row.organization_id,case_row.id,local_id,'work_order','selan-work-order:'||local_id::text||':work_order','{}',repeat('a',64),case_row.profile_id) returning id into op_id;
 begin
  insert into public.quibi_dev_operation_journal(organization_id,service_request_id,local_entity_id,kind,external_id,request_body,request_sha256,created_by_profile_id)
  values(case_row.organization_id,case_row.id,local_id,'work_order','selan-work-order:'||local_id::text||':work_order','{}',repeat('a',64),case_row.profile_id);
  raise exception 'Duplicate operation was admitted';
 exception when unique_violation then null; end;
 begin
  update public.quibi_dev_operation_journal set request_body='{"changed":true}' where id=op_id;
  raise exception 'Immutable body was changed';
 exception when check_violation then null; end;
 update public.quibi_dev_operation_journal set state='dispatching',attempted_at=now() where id=op_id;
 begin
  update public.quibi_dev_operation_journal set state='verified' where id=op_id;
  raise exception 'Illegal direct verification was admitted';
 exception when check_violation then null; end;
 update public.quibi_dev_operation_journal set state='uncertain',quibi_id='42' where id=op_id;
 update public.quibi_dev_operation_journal set state='verified',quibi_content_sha256=repeat('b',64),document_number='QA-DN' where id=op_id;
 begin
  update public.quibi_dev_operation_journal set state='dispatching' where id=op_id;
  raise exception 'Verified operation was dispatched again';
 exception when check_violation then null; end;
end $$;
rollback;
