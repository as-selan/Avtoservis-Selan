/**
 * Offline static regression: SQL RPC must validate email format (not only normalize).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  here,
  "../../../supabase/migrations/20260928175120_20260913214500_create_manual_service_request_intake.sql",
);

test("M4 RPC defines is_valid_intake_email and rejects invalid email before write", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /create or replace function private\.is_valid_intake_email/);
  assert.match(
    sql,
    /not private\.is_valid_intake_email\(v_email\)/,
    "RPC must gate invalid email",
  );
  assert.match(
    sql,
    /Invalid email must not satisfy the contact requirement/,
  );
});
