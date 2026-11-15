-- Local Docker regression only. Transaction-scoped fixtures; leaves existing QA data intact.
begin;
create temporary table selected_vehicle_regression(actor uuid,customer_id uuid,other_customer_id uuid,vehicle_id uuid,other_vehicle_id uuid,vin text,registration text,email text);
do $$
declare actor uuid; org uuid; customer_id uuid; other_customer_id uuid; vehicle_id uuid; other_vehicle_id uuid; suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,10);
begin
 select o.id,m.profile_id into org,actor from public.organizations o join public.organization_memberships m on m.organization_id=o.id where o.slug='avtoservis-selan' and m.role='owner' and m.is_active limit 1;
 if actor is null then raise exception 'Local QA owner required'; end if;
 insert into public.customers(organization_id,display_name,email) values(org,'QA shared registration','shared-'||suffix||'@example.test') returning id into customer_id;
 insert into public.customers(organization_id,display_name,email) values(org,'QA other owner','other-'||suffix||'@example.test') returning id into other_customer_id;
 insert into public.vehicles(organization_id,customer_id,vin,registration_current,make,model) values(org,customer_id,'QA'||suffix||'A','QA-'||suffix,'TEST','QA') returning id into vehicle_id;
 insert into public.vehicles(organization_id,customer_id,vin,registration_current,make,model) values(org,other_customer_id,'QA'||suffix||'B','QA-'||suffix,'TEST','QA') returning id into other_vehicle_id;
 insert into selected_vehicle_regression values(actor,customer_id,other_customer_id,vehicle_id,other_vehicle_id,'QA'||suffix||'A','QA-'||suffix,'shared-'||suffix||'@example.test');
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;
grant select on selected_vehicle_regression to authenticated;
set local role authenticated;
do $$
declare f record; result jsonb; again jsonb; key uuid:=gen_random_uuid();
begin
 select * into f from selected_vehicle_regression;
 result:=public.create_manual_service_request_intake(p_display_name=>'QA shared registration',p_email=>f.email,p_channel=>'manual',p_selected_customer_id=>f.customer_id,p_selected_vehicle_id=>f.vehicle_id,p_vin=>f.vin,p_registration=>f.registration,p_make=>'TEST',p_model=>'QA',p_service_wanted=>'QA regression',p_client_request_id=>key);
 if result->>'ok' is distinct from 'true' or result->>'vehicle_id' is distinct from f.vehicle_id::text then raise exception 'Explicit VIN selection rejected: %',result; end if;
 again:=public.create_manual_service_request_intake(p_display_name=>'QA shared registration',p_email=>f.email,p_channel=>'manual',p_selected_customer_id=>f.customer_id,p_selected_vehicle_id=>f.vehicle_id,p_vin=>f.vin,p_registration=>f.registration,p_make=>'TEST',p_model=>'QA',p_service_wanted=>'QA regression',p_client_request_id=>key);
 if again->>'service_request_id' is distinct from result->>'service_request_id' then raise exception 'Idempotency changed: %',again; end if;
 result:=public.create_manual_service_request_intake(p_display_name=>'QA shared registration',p_email=>f.email,p_selected_customer_id=>f.customer_id,p_vin=>f.vin,p_registration=>f.registration,p_make=>'TEST',p_model=>'QA',p_service_wanted=>'QA regression',p_client_request_id=>gen_random_uuid());
 if result->>'error_code' is distinct from 'ambiguous_vehicle' then raise exception 'Missing selection bypass: %',result; end if;
 result:=public.create_manual_service_request_intake(p_display_name=>'QA shared registration',p_email=>f.email,p_selected_customer_id=>f.other_customer_id,p_selected_vehicle_id=>f.vehicle_id,p_vin=>f.vin,p_registration=>f.registration,p_make=>'TEST',p_model=>'QA',p_service_wanted=>'QA regression',p_client_request_id=>gen_random_uuid());
 if result->>'ok'='true' then raise exception 'Wrong owner allowed: %',result; end if;
 result:=public.create_manual_service_request_intake(p_display_name=>'QA shared registration',p_email=>f.email,p_selected_customer_id=>f.customer_id,p_selected_vehicle_id=>f.vehicle_id,p_vin=>f.vin||'WRONG',p_registration=>f.registration,p_make=>'TEST',p_model=>'QA',p_service_wanted=>'QA regression',p_client_request_id=>gen_random_uuid());
 if result->>'ok'='true' then raise exception 'Wrong VIN allowed: %',result; end if;
 result:=public.create_manual_service_request_intake(p_display_name=>'QA shared registration',p_email=>f.email,p_selected_customer_id=>f.customer_id,p_selected_vehicle_id=>f.vehicle_id,p_registration=>f.registration,p_make=>'TEST',p_model=>'QA',p_service_wanted=>'QA regression',p_client_request_id=>gen_random_uuid());
 if result->>'error_code' is distinct from 'ambiguous_vehicle' then raise exception 'Missing VIN bypass: %',result; end if;
 raise notice 'PASS explicit VIN and owner, idempotency, missing selection, wrong owner, wrong VIN';
end $$;
reset role;
rollback;
