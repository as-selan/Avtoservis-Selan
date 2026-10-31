\set ON_ERROR_STOP on
-- Only disposable schema-only local database; never run against the QA app's postgres DB.
do $$ begin if current_database()<>'selan_unified_qa_20261010' then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;
begin;
set local session_replication_role=replica;
insert into auth.users(id,email) values('11111111-1111-4111-8111-111111111111','synthetic@fixture.mail');
insert into public.profiles(id,email) values('11111111-1111-4111-8111-111111111111','synthetic@fixture.mail');
insert into public.organizations(id,name,slug) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Synthetic workflow QA','unified-workflow-qa');
insert into public.organization_memberships(organization_id,profile_id,role) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner');
insert into public.customers(id,organization_id,display_name,email) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Synthetic QA','synthetic@fixture.mail');
insert into public.service_requests(id,organization_id,customer_id,status,summary,service_wanted,source)
 values('9d40c42f-b6a8-473b-983f-f9620df97d10','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','preparing_offer','Synthetic QA','Synthetic service','manual');
insert into public.offer_preparations(id,organization_id,service_request_id,created_by_profile_id)
 values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','9d40c42f-b6a8-473b-983f-f9620df97d10','11111111-1111-4111-8111-111111111111');
insert into public.quotes(id,organization_id,service_request_id,offer_preparation_id,version_no,content_sha256,evidence_kind,evidence_payload,internal_review_status,reviewed_at,reviewed_by_profile_id,created_by_profile_id,quibi_environment)
 values('ab9f75b2-e6f3-45c7-82de-e36c82faab7b','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','9d40c42f-b6a8-473b-983f-f9620df97d10','dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,repeat('a',64),'quibi_manual_estimate','{"external_id":"2176888","customer_external_id":"405956"}','approved_for_send',now(),'11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','production');
set local session_replication_role=origin;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into public.quibi_production_operation_journal(id,organization_id,service_request_id,local_entity_id,kind,request_body,request_sha256,created_by_profile_id)
 values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','9d40c42f-b6a8-473b-983f-f9620df97d10','ab9f75b2-e6f3-45c7-82de-e36c82faab7b','send',
 '{"path":"unified_quibi_send","mode":"production","caseId":"9d40c42f-b6a8-473b-983f-f9620df97d10","organizationId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","quoteId":"ab9f75b2-e6f3-45c7-82de-e36c82faab7b","documentId":"2176888","customerId":"405956","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',repeat('b',64),'11111111-1111-4111-8111-111111111111');
do $$ declare r jsonb; denied boolean:=false; begin
 r:=public.record_quibi_api_dispatch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ab9f75b2-e6f3-45c7-82de-e36c82faab7b','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 if r->>'ok'<>'false' then raise exception 'Prepared operation accepted as sent'; end if;
 if exists(select 1 from public.customer_approvals) then raise exception 'Queued/unknown created delivery evidence'; end if;
 begin update public.quibi_production_operation_journal set request_body='{}' where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; exception when check_violation then denied:=true; end;
 if not denied then raise exception 'Request body was mutable'; end if;
 if has_function_privilege('authenticated','public.record_quibi_api_dispatch(uuid,uuid,uuid)','EXECUTE') or has_function_privilege('anon','public.record_quibi_api_dispatch(uuid,uuid,uuid)','EXECUTE') then raise exception 'RPC public access'; end if;
 if not(select relrowsecurity from pg_class where oid='public.quibi_production_operation_journal'::regclass) then raise exception 'RLS disabled'; end if;
end $$;
update public.quibi_production_operation_journal set state='dispatching' where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and state='prepared';
update public.quibi_production_operation_journal set state='uncertain',quibi_id='2176888',quibi_content_sha256=repeat('a',64),send_id='fixture-send',send_status='queued' where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
do $$ declare r jsonb; begin
 r:=public.record_quibi_api_dispatch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ab9f75b2-e6f3-45c7-82de-e36c82faab7b','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 if r->>'ok'<>'false' then raise exception 'Queued operation accepted as sent'; end if;
end $$;
update public.quibi_production_operation_journal set state='verified',send_status='sent' where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
do $$ declare r jsonb; denied boolean:=false; begin
 r:=public.record_quibi_api_dispatch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ab9f75b2-e6f3-45c7-82de-e36c82faab7b','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 if r->>'ok'<>'true' or r->>'receipt_confirmed'<>'false' then raise exception 'Verified production acceptance failed: %',r; end if;
 r:=public.record_quibi_api_dispatch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ab9f75b2-e6f3-45c7-82de-e36c82faab7b','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 if r->>'idempotent'<>'true' or (select count(*) from public.customer_approvals)<>1 then raise exception 'Duplicate acceptance'; end if;
 if not exists(select 1 from public.customer_approvals where delivery_proof_kind='quibi_mail_server_acceptance' and customer_decision is null and viewed_at is null) then raise exception 'Receipt/customer decision was invented'; end if;
 if (select status from public.service_requests where id='9d40c42f-b6a8-473b-983f-f9620df97d10')<>'awaiting_customer_approval' then raise exception 'Workflow did not advance automatically'; end if;
 begin update public.quibi_production_operation_journal set state='prepared' where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; exception when check_violation then denied:=true; end;
 if not denied then raise exception 'Repeat dispatch permitted'; end if;
 denied:=false;
 begin update public.customer_approvals set delivery_proof_kind='manual_staff_attestation'; exception when check_violation then denied:=true; end;
 if not denied then raise exception 'Automatic evidence became manual'; end if;
end $$;
rollback;
select 'PASS: unified Quibi database regression' as result;
