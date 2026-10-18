-- Pending approval: DEV verxxsjbewmkgoxwqvxo only. No data, grants or RLS changes.
-- The current publication has no tables. Existing RLS SELECT policies restrict events.
-- Apply only this statement, not a general db push.
begin;
alter publication supabase_realtime add table
  public.service_requests,
  public.service_case_assignments,
  public.service_case_notes,
  public.service_case_photos,
  public.service_case_reviews;
commit;
-- Reversal (configuration only): ALTER PUBLICATION supabase_realtime DROP TABLE
-- public.service_requests, public.service_case_assignments, public.service_case_notes,
-- public.service_case_photos, public.service_case_reviews;
