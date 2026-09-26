-- Deprecated aggregate verify — replaced by race-specific asserts:
--   m4_concurrency_verify_identical.sql
--   m4_concurrency_verify_conflict.sql
--   m4_concurrency_verify_same_vin.sql
-- Kept as a pointer so older docs/scripts fail loudly if invoked.
\ir assert_isolated_test_target.sql

do $$
begin
  raise exception
    'm4_concurrency_verify.sql is retired; use race-specific verify_* scripts via run-m4-db-concurrency.ps1';
end;
$$;
