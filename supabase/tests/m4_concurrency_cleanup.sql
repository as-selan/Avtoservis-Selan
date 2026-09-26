-- Controlled cleanup for M4 concurrency fixtures (idempotent).
\ir assert_isolated_test_target.sql

begin;

delete from public.service_requests
where intake_request_id in (
  'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1',
  'c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2',
  'c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3'
);

delete from public.vehicles v
using public.organizations o
where v.organization_id = o.id
  and o.slug = 'avtoservis-selan'
  and private.normalize_intake_vin(v.vin) in ('WBAKCONCRACE0001', 'WBAKCONCIDEM0001');

delete from public.customers c
using public.organizations o
where c.organization_id = o.id
  and o.slug = 'avtoservis-selan'
  and c.email in (
    'm4-conc-idem@isolated.test',
    'm4-conc-vin@isolated.test'
  );

delete from public.organization_memberships
where profile_id = 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0';

delete from public.profiles
where id = 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0';

delete from auth.users
where id = 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0';

delete from private.m4_concurrency_run where singleton;

do $$
begin
  delete from private.m4_concurrency_session_result;
exception
  when undefined_table then
    null;
end;
$$;

commit;
