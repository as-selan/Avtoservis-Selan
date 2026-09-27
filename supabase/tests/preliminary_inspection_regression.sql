-- Disposable Docker database only. No hosted project connection is accepted.
\set ON_ERROR_STOP on
\ir assert_isolated_test_target.sql
begin;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '61616161-6161-4161-8161-616161616161', 'authenticated', 'authenticated', 'inspection-owner@example.test', crypt('isolated-test-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '62626262-6262-4262-8262-626262626262', 'authenticated', 'authenticated', 'inspection-foreign@example.test', crypt('isolated-test-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.organizations (id, name, slug) values
  ('72727272-7272-4272-8272-727272727272', 'Other workshop', 'other-workshop');
insert into public.organization_memberships (organization_id, profile_id, role)
  select o.id, '61616161-6161-4161-8161-616161616161', 'owner'
  from public.organizations o where o.slug = 'avtoservis-selan';
insert into public.organization_memberships (organization_id, profile_id, role) values
  ('72727272-7272-4272-8272-727272727272', '62626262-6262-4262-8262-626262626262', 'owner');
insert into public.customers(id,organization_id,display_name)
  select '63636363-6363-4363-8363-636363636363',o.id,'Isolated inspection customer'
  from public.organizations o where o.slug='avtoservis-selan';
insert into public.service_requests (id, organization_id, status, summary, source)
  select v.id, o.id, 'new', v.summary, 'manual'
  from (values
    ('81818181-8181-4181-8181-818181818181'::uuid, 'Preliminary inspection A'),
    ('82828282-8282-4282-8282-828282828282'::uuid, 'Preliminary inspection B')
  ) as v(id,summary)
  cross join public.organizations o where o.slug = 'avtoservis-selan';
insert into public.service_requests(id,organization_id,customer_id,status,summary,source)
  select '83838383-8383-4383-8383-838383838383',o.id,
    '63636363-6363-4363-8363-636363636363','new','Manual diagnosis slots','manual'
  from public.organizations o where o.slug='avtoservis-selan';
do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.preliminary_inspections'::regclass)
     or has_table_privilege('authenticated','public.preliminary_inspections','INSERT')
     or not has_function_privilege('authenticated','public.record_preliminary_inspection(uuid,text,text)','EXECUTE')
  then raise exception 'Inspection RLS or grants are unsafe'; end if;
  if has_column_privilege('authenticated','public.appointments','status','INSERT')
     or has_column_privilege('authenticated','public.appointments','status','UPDATE')
     or has_table_privilege('authenticated','public.manual_slot_offers','INSERT')
     or not has_function_privilege('authenticated',
       'public.propose_manual_slots(uuid,text,timestamptz,timestamptz,timestamptz,text)','EXECUTE')
  then raise exception 'Manual slot RLS or appointment grants are unsafe'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','61616161-6161-4161-8161-616161616161',true);
do $$ declare v jsonb; begin
  begin
    update public.service_requests set status='appointment_confirmed'
      where id='83838383-8383-4383-8383-838383838383';
    raise exception 'Confirmed appointment status accepted without booking evidence';
  exception when check_violation then null; end;
  v := public.record_preliminary_inspection('81818181-8181-4181-8181-818181818181','request');
  if v->>'ok' <> 'true' then raise exception 'Inspection request failed: %',v; end if;
  v := public.record_preliminary_inspection('81818181-8181-4181-8181-818181818181','complete','Real synthetic findings');
  if v->>'ok' <> 'true' then raise exception 'Inspection completion failed: %',v; end if;
  v := public.record_preliminary_inspection('81818181-8181-4181-8181-818181818181','repair_ordered');
  if v->>'ok' <> 'true' then raise exception 'Repair order decision failed: %',v; end if;
  v := public.record_preliminary_inspection('81818181-8181-4181-8181-818181818181','repair_not_ordered');
  if v->>'ok' <> 'false' then raise exception 'Terminal decision changed without review'; end if;
  v := public.record_preliminary_inspection('82828282-8282-4282-8282-828282828282','request');
  v := public.record_preliminary_inspection('82828282-8282-4282-8282-828282828282','complete','Other synthetic findings');
  v := public.record_preliminary_inspection('82828282-8282-4282-8282-828282828282','repair_not_ordered');
  if v->>'ok' <> 'true' then raise exception 'Billable inspection decision failed: %',v; end if;
  if (select count(*) from public.preliminary_inspections where repair_decision = 'ordered') <> 1
     or (select count(*) from public.preliminary_inspections where repair_decision = 'not_ordered') <> 1
  then raise exception 'Inspection outcomes were not retained'; end if;
  v := public.record_preliminary_inspection('83838383-8383-4383-8383-838383838383','request');
  v := public.propose_manual_slots('83838383-8383-4383-8383-838383838383','diagnosis',
    now()+interval '1 day',now()+interval '2 days',now()+interval '3 days','MYPLANLY-CHECK-1');
  if v->>'ok' <> 'true' then raise exception 'Three manual options failed: %',v; end if;
  v := public.advance_manual_slot_offer((v->>'offer_id')::uuid,'confirm','FAKE-BOOKING');
  if v->>'ok' <> 'false' then raise exception 'Booking accepted before customer choice'; end if;
  select jsonb_build_object('offer_id',id) into v from public.manual_slot_offers
    where service_request_id='83838383-8383-4383-8383-838383838383';
  v := public.advance_manual_slot_offer((v->>'offer_id')::uuid,'send','MESSAGE-THREE-SLOTS');
  if v->>'ok' <> 'true' then raise exception 'Actual offer record failed: %',v; end if;
  v := public.advance_manual_slot_offer(
    (select id from public.manual_slot_offers where service_request_id='83838383-8383-4383-8383-838383838383'),
    'select','CUSTOMER-SLOT-REPLY',2);
  if v->>'ok' <> 'true' then raise exception 'Slot choice failed: %',v; end if;
  v := public.advance_manual_slot_offer(
    (select id from public.manual_slot_offers where service_request_id='83838383-8383-4383-8383-838383838383'),
    'confirm','MYPLANLY-BOOKING-1');
  if v->>'ok' <> 'true' then raise exception 'Manual booking failed: %',v; end if;
  if not exists (select 1 from public.appointments a
      where a.service_request_id='83838383-8383-4383-8383-838383838383'
        and a.appointment_type='diagnosis' and a.status='confirmed') then
    raise exception 'Confirmed diagnosis appointment not retained'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','62626262-6262-4262-8262-626262626262',true);
do $$ declare v jsonb; begin
  if (select count(*) from public.preliminary_inspections) <> 0 then
    raise exception 'Cross-tenant inspection rows visible'; end if;
  if (select count(*) from public.manual_slot_offers) <> 0 then
    raise exception 'Cross-tenant manual slot offers visible'; end if;
  v := public.record_preliminary_inspection('81818181-8181-4181-8181-818181818181','request');
  if v->>'ok' <> 'false' then raise exception 'Cross-tenant inspection write accepted'; end if;
end $$;
rollback;
