-- Local existing QA database only. All fixture changes roll back; no external operations.
begin;
do $$
declare r public.service_requests%rowtype; actor uuid; answer jsonb; order_id uuid; command uuid:=gen_random_uuid(); org uuid; offer uuid; photo uuid:=gen_random_uuid(); photo_path text;
begin
 select id into org from public.organizations where slug='avtoservis-selan';
 select profile_id into actor from public.organization_memberships where organization_id=org and role='owner' and is_active limit 1;
 select * into r from public.service_requests where organization_id=org and customer_id is not null and vehicle_id is not null and archived_at is null and not exists(select 1 from public.preliminary_inspections p where p.service_request_id=service_requests.id) and not exists(select 1 from public.published_fixed_price_cases p where p.service_request_id=service_requests.id) and not exists(select 1 from public.manual_slot_offers p where p.service_request_id=service_requests.id) limit 1;
 if r.id is null or actor is null then raise exception 'Existing local QA fixtures required'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 answer:=public.create_work_order(r.id);if answer->>'ok'='true' then raise exception 'Unconfirmed case bypassed gate'; end if;
 -- Trusted transactional fixtures, never actual customer attestations.
 insert into public.published_fixed_price_cases(organization_id,service_request_id,service_label,final_price_eur,published_url,status,prepared_by_profile_id,
 approved_by_profile_id,approved_at,communication_reference,communicated_at,decision_reference,decided_at)
 values(org,r.id,'SQL rollback fixture',122,'https://example.test/qa','accepted',actor,actor,now(),'SQL FIXTURE ONLY',now(),'SQL FIXTURE ONLY',now());
 update public.service_requests set status='preparing_offer' where id=r.id;
 update public.published_fixed_price_cases set status='communicated',decision_reference=null,decided_at=null where service_request_id=r.id;
 update public.service_requests set status='awaiting_customer_approval' where id=r.id;
 update public.published_fixed_price_cases set status='accepted',decision_reference='SQL FIXTURE ONLY',decided_at=now() where service_request_id=r.id;
 update public.service_requests set status='awaiting_slot_selection' where id=r.id;
 update public.customers set phone='040000000' where id=r.customer_id;
 update public.vehicles set vin='QA'||substring(replace(gen_random_uuid()::text,'-',''),1,15),registration_current='QA-ROLLBACK',make='TEST',model='QA' where id=r.vehicle_id;
 insert into public.service_request_intake_reviews(organization_id,service_request_id,reviewed_by_profile_id) values(org,r.id,actor) on conflict do nothing;
 answer:=public.propose_manual_slots(r.id,'service',now()+interval '2 days',now()+interval '3 days',now()+interval '4 days','SQL FIXTURE ONLY');
 if answer->>'ok'<>'true' then raise exception 'Slot proposal failed: %',answer; end if; offer:=(answer->>'offer_id')::uuid;
 answer:=public.advance_manual_slot_offer(offer,'send','SQL FIXTURE ONLY');
 answer:=public.advance_manual_slot_offer(offer,'select','SQL FIXTURE ONLY',1);
 answer:=public.advance_manual_slot_offer(offer,'confirm','SQL FIXTURE ONLY');
 if answer->>'ok'<>'true' then raise exception 'Booking fixture failed: %',answer; end if;
 -- Missing approval must fail even with an appointment.
 update public.published_fixed_price_cases set status='communicated',decision_reference=null,decided_at=null where service_request_id=r.id;
 answer:=public.create_work_order(r.id);if answer->>'ok'='true' then raise exception 'Approval was bypassed'; end if;
 update public.published_fixed_price_cases set status='accepted',decision_reference='SQL FIXTURE ONLY',decided_at=now() where service_request_id=r.id;
 answer:=public.create_work_order(r.id);if answer->>'ok'<>'true' then raise exception 'Valid fixture rejected: %',answer; end if;order_id:=(answer->>'id')::uuid;
 answer:=public.create_work_order(r.id);if answer->>'replayed'<>'true' or (answer->>'id')::uuid<>order_id then raise exception 'Duplicate work order'; end if;
 if (select count(*) from public.work_orders where service_request_id=r.id)<>1 then raise exception 'Non-unique work order'; end if;
 answer:=public.record_work_order(order_id,'open','closed','SQL fixture close',gen_random_uuid());if answer->>'error_code'<>'invalid_transition' then raise exception 'Early close allowed'; end if;
 answer:=public.record_work_order(order_id,'open','in_progress','SQL fixture start',command);if answer->>'ok'<>'true' then raise exception 'Start failed'; end if;
 answer:=public.record_work_order(order_id,'open','in_progress','SQL fixture start',command);if answer->>'replayed'<>'true' then raise exception 'Replay not idempotent'; end if;
 answer:=public.record_work_order(order_id,'open','in_progress','Changed fixture',command);if answer->>'error_code'<>'idempotency_conflict' then raise exception 'Changed replay accepted'; end if;
 answer:=public.record_work_order(order_id,'open',null,'Stale SQL note',gen_random_uuid());if answer->>'error_code'<>'stale_status' then raise exception 'Stale state accepted'; end if;
 answer:=public.register_work_order_photo(order_id,gen_random_uuid(),'missing.jpg','SQL missing photo');if answer->>'ok'='true' then raise exception 'Missing storage photo accepted'; end if;
 photo_path:=org::text||'/'||order_id::text||'/'||photo::text||'.jpg';
 insert into storage.objects(bucket_id,name,owner_id) values('selan-work-order-photos',photo_path,actor::text);
 answer:=public.register_work_order_photo(order_id,photo,photo_path,'SQL fixture photo');if answer->>'ok'<>'true' then raise exception 'Valid photo registration rejected'; end if;
 answer:=public.record_work_order(order_id,'in_progress','ready_for_collection','SQL fixture complete',gen_random_uuid());if answer->>'ok'<>'true' then raise exception 'Completion failed'; end if;
 answer:=public.record_work_order(order_id,'ready_for_collection','closed','SQL fixture close',gen_random_uuid());if answer->>'error_code'<>'invoice_handover_required' then raise exception 'Unverified close allowed'; end if;
 answer:=public.record_work_order(order_id,'ready_for_collection','closed','SQL fixture close',gen_random_uuid(),'SQL INVOICE FIXTURE','SQL HANDOVER FIXTURE',true);if answer->>'ok'<>'true' then raise exception 'Verified close failed'; end if;
 if (select status from public.service_requests where id=r.id)<>'closed' then raise exception 'Case not closed with work order'; end if;
 if has_table_privilege('authenticated','public.work_orders','INSERT') or has_table_privilege('authenticated','public.work_order_events','UPDATE') or has_table_privilege('anon','public.work_orders','SELECT') then raise exception 'Unsafe direct grants'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 answer:=public.create_work_order(r.id);if answer->>'error_code'<>'forbidden' then raise exception 'Foreign member authorized'; end if;
 execute 'set local role authenticated';
 if exists(select 1 from public.work_orders) or exists(select 1 from public.work_order_photos) then raise exception 'Cross-organization RLS leak'; end if;
 execute 'reset role';
 raise notice 'Work order lifecycle, approval gates, idempotency, missing photo and role checks passed; rolling back';
end $$;
rollback;
