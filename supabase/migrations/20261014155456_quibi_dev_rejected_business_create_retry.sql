-- Approved and applied to Selan DEV on 2026-10-14; version matches hosted migration history.
-- DEV journal only. Do not alter or delete operation evidence.
-- Exactly one potentially accepted CREATE per case and kind remains enforced.
-- Only definitive failures without a remote document may have a separately reviewed correction.
begin;
drop index public.quibi_dev_one_business_create_per_case;
create unique index quibi_dev_one_business_create_per_case
 on public.quibi_dev_operation_journal (organization_id, service_request_id, kind)
 where kind in ('work_order','invoice')
   and (state <> 'failed' or quibi_id is not null);
commit;
