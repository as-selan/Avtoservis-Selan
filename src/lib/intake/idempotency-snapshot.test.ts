/**
 * Offline static regression for M4 private intake_material snapshots.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { manualIntakeErrorMessage } from "./errors.ts";

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  here,
  "../../../supabase/migrations/20260928175120_20260913214500_create_manual_service_request_intake.sql",
);

const MATERIAL_KEYS = [
  "service_wanted",
  "problem_description",
  "selected_customer_id",
  "selected_vehicle_id",
  "vin",
  "phone",
  "email",
  "mileage_reported_km",
  "display_name",
  "channel",
  "registration",
  "make",
  "model",
  "year",
  "power_kw",
  "engine",
  "engine_type",
  "fuel",
  "brings_own_material",
] as const;

test("migration uses private snapshot table and DEFINER intake RPC", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /create table if not exists private\.manual_intake_material_snapshots/);
  assert.match(sql, /security definer/);
  assert.match(
    sql,
    /create or replace function public\.create_manual_service_request_intake\([\s\S]*?security definer/,
  );
  assert.match(sql, /idempotency_conflict/);
  assert.doesNotMatch(sql, /m4\.intake_material_write/);
  assert.doesNotMatch(sql, /m4\.intake_material_json/);
  assert.doesNotMatch(
    sql,
    /grant insert\s*\(\s*intake_request_id\s*\)/i,
    "authenticated must not INSERT intake_request_id",
  );
  assert.match(
    sql,
    /revoke insert\s*\(\s*intake_request_id\s*\)\s*on table public\.service_requests\s*from authenticated/i,
  );
  assert.match(
    sql,
    /revoke all on table private\.manual_intake_material_snapshots from authenticated/i,
  );
  assert.doesNotMatch(
    sql,
    /grant\s+(select|insert|update|delete).*manual_intake_material_snapshots.*authenticated/i,
  );
  assert.match(
    sql,
    /manual_intake_material_snapshots_org_sr_fkey/,
    "composite org+service_request FK required",
  );
  assert.match(
    sql,
    /foreign key \(organization_id, service_request_id\)/,
  );
});

test("canonical material covers all 19 approved business fields", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const fnMatch = sql.match(
    /create or replace function private\.canonical_manual_intake_material\([\s\S]*?\$\$;/,
  );
  assert.ok(fnMatch, "canonical function missing");
  const body = fnMatch[0];
  for (const key of MATERIAL_KEYS) {
    assert.match(body, new RegExp(`'${key}'`), `missing material key ${key}`);
  }
  assert.doesNotMatch(body, /searchQuery|client_request_id|clientRequestId/);
});

test("idempotency_conflict has Slovenian UI message without auto-create", () => {
  const message = manualIntakeErrorMessage("idempotency_conflict");
  assert.match(message, /že shranjena/i);
  assert.match(message, /ne ustvarjam samodejno/i);
});
