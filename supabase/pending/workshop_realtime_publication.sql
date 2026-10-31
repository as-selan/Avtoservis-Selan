-- Applied with explicit approval on 2026-10-18: DEV verxxsjbewmkgoxwqvxo only.
-- The publication had no tables before activation. Existing RLS policies restrict events.
-- Activation record only: do not rerun. No data, grants or RLS were changed.
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
