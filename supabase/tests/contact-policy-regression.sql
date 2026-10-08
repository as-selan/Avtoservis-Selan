-- Run ONLY on the existing local manual QA container. Every change is rolled back.
-- Pipe BEGIN + forward migration + this file + ROLLBACK with psql ON_ERROR_STOP.
do $$
declare
  actor uuid; org uuid; result jsonb; retry jsonb; rid uuid; cid uuid; vid uuid;
  reqkey uuid := gen_random_uuid(); n int; token text := repeat('d',64);
begin
  select o.id,m.profile_id into org,actor from public.organizations o
    join public.organization_memberships m on m.organization_id=o.id
    where o.slug='avtoservis-selan' and m.role='owner' and m.is_active limit 1;
  if actor is null then raise exception 'local QA owner missing'; end if;
  if not has_function_privilege('anon','public.submit_service_request_completion(text,text,text,text,text,text)','EXECUTE')
     or has_function_privilege('anon','public.review_service_request_intake(uuid)','EXECUTE')
     or has_function_privilege('anon','public.prepare_service_request_offer(uuid)','EXECUTE') then
    raise exception 'RPC grants changed unsafely';
  end if;
  if has_function_privilege('anon','public.create_web_service_request_intake(uuid,text,text,text,text,text,text,text,integer,integer,text,text,text,integer,text,text,boolean)','EXECUTE')
     or has_function_privilege('authenticated','public.create_web_service_request_intake(uuid,text,text,text,text,text,text,text,integer,integer,text,text,text,integer,text,text,boolean)','EXECUTE')
     or not has_function_privilege('service_role','public.create_web_service_request_intake(uuid,text,text,text,text,text,text,text,integer,integer,text,text,text,integer,text,text,boolean)','EXECUTE') then
    raise exception 'web RPC server-only protection changed';
  end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  result := public.create_manual_service_request_intake(p_display_name=>'Contact regression email',p_email=>'contact-regression-email@example.test',p_vin=>'CONTACTREGEMAIL',p_make=>'TEST',p_model=>'QA',p_service_wanted=>'QA contact validation',p_client_request_id=>gen_random_uuid());
  if result->>'ok'<>'true' or result->>'status'<>'new' then raise exception 'manual email only: %',result; end if;
  result := public.create_manual_service_request_intake(p_display_name=>'Contact regression phone',p_phone=>'099888776',p_vin=>'CONTACTREGPHONE',p_make=>'TEST',p_model=>'QA',p_channel=>'phone',p_service_wanted=>'QA contact validation',p_client_request_id=>gen_random_uuid());
  if result->>'ok'<>'true' or result->>'status'<>'new' then raise exception 'manual phone only: %',result; end if;
  result := public.create_manual_service_request_intake(p_display_name=>'Contact regression none',p_service_wanted=>'QA contact validation',p_client_request_id=>gen_random_uuid());
  if result->>'ok'='true' then raise exception 'manual no contact accepted'; end if;
  result := public.create_web_service_request_intake(p_client_request_id=>gen_random_uuid(),p_display_name=>'Web missing phone',p_email=>'contact-regression-web@example.test',p_service_wanted=>'QA contact validation');
  if result->>'ok'='true' then raise exception 'web missing phone accepted'; end if;
  result := public.create_web_service_request_intake(p_client_request_id=>gen_random_uuid(),p_display_name=>'Web missing email',p_phone=>'099888775',p_service_wanted=>'QA contact validation');
  if result->>'ok'='true' then raise exception 'web missing email accepted'; end if;
  result := public.create_web_service_request_intake(p_client_request_id=>gen_random_uuid(),p_display_name=>'Web provenance regression',p_email=>'contact-regression-web-valid@example.test',p_phone=>'099888774',p_service_wanted=>'QA contact validation');
  if result->>'ok'<>'true' then raise exception 'valid web rejected: %',result; end if;
  select id into rid from public.service_requests where customer_id in (select id from public.customers where email='contact-regression-web-valid@example.test') and source='web_form';
  if rid is null then raise exception 'web provenance not fixed'; end if;
  begin
    update public.service_requests set source='manual',channel='manual' where id=rid;
    raise exception 'web source/channel bypass succeeded';
  exception when check_violation then null; end;
  if private.compute_request_intake_completeness(rid,null,'contact-regression-web-valid@example.test','VIN','TEST','QA')->>'status'<>'needs_data' then raise exception 'web completion contact bypass'; end if;
  raise notice 'PASS manual email/phone/no contacts, web missing contact, fixed web provenance and completion policy';
  result := public.create_manual_service_request_intake(p_display_name=>'Contact completion regression',p_email=>'contact-regression-completion@example.test',p_service_wanted=>'QA contact validation',p_client_request_id=>reqkey);
  rid := (result->>'service_request_id')::uuid; cid := (result->>'customer_id')::uuid;
  if rid is null or result->>'status'<>'needs_data' then raise exception 'completion setup: %',result; end if;
  result := public.issue_service_request_completion_link(rid,token,now()+interval '1 day');
  if result->>'ok'<>'true' then raise exception 'link setup: %',result; end if;
  result := public.submit_service_request_completion(token,null,null,'CONTACTREGCOMPLETE','TEST','QA');
  if result->>'ok'<>'true' or result->>'completed'<>'true' then raise exception 'completion: %',result; end if;
  select vehicle_id into vid from public.service_requests where id=rid and status='new' and customer_id=cid;
  if vid is null or exists(select 1 from public.customers where id=cid and phone is not null) then raise exception 'same case vehicle or invented phone'; end if;
  retry := public.submit_service_request_completion(token,null,null,'CONTACTREGCOMPLETE','TEST','QA');
  if retry is distinct from result then raise exception 'completion retry differs'; end if;
  select count(*) into n from public.vehicles where organization_id=org and vin='CONTACTREGCOMPLETE';
  if n<>1 then raise exception 'vehicle duplicate'; end if;
  select count(*) into n from public.service_requests where organization_id=org and intake_request_id=reqkey;
  if n<>1 then raise exception 'case duplicate'; end if;
  if exists(select 1 from public.service_request_intake_reviews where service_request_id=rid) then raise exception 'completion forged review'; end if;
  result := public.prepare_service_request_offer(rid);
  if result->>'ok'='true' then raise exception 'offer bypassed review'; end if;
  begin
    update public.service_requests set status='preparing_offer' where id=rid;
    raise exception 'direct status bypass succeeded';
  exception when check_violation then null; end;
  begin
    update public.service_requests set source='web_form',channel='web' where id=rid;
    raise exception 'source mutation succeeded';
  exception when check_violation then null; end;
  result := public.review_service_request_intake(rid);
  if result->>'ok'<>'true' then raise exception 'review: %',result; end if;
  result := public.prepare_service_request_offer(rid);
  if result->>'ok'<>'true' then raise exception 'offer: %',result; end if;
  retry := public.prepare_service_request_offer(rid);
  if retry->>'ok'<>'true' then raise exception 'offer retry'; end if;
  select count(*) into n from public.offer_preparations where service_request_id=rid;
  if n<>1 then raise exception 'offer duplicate'; end if;
  raise notice 'PASS same-case vehicle completion, retry, review gate, immutable provenance and offer';
end;
$$;
