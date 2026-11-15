/**
 * Offline static regression: existing-vehicle UPDATE must not overwrite
 * vehicles.mileage_latest_* from manual intake reported mileage.
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

test("M4 RPC does not overwrite mileage_latest on existing vehicle update", () => {
  const sql = readFileSync(migrationPath, "utf8");

  const updateIdx = sql.indexOf("elsif v_vehicle_id is not null then");
  assert.ok(updateIdx > 0, "expected existing-vehicle update branch");

  const insertIdx = sql.indexOf(
    "insert into public.service_requests",
    updateIdx,
  );
  const updateBlock = sql.slice(
    updateIdx,
    insertIdx > updateIdx ? insertIdx : undefined,
  );

  assert.match(
    updateBlock,
    /mileage_latest_\* is a cache only/i,
    "expected explicit no-overwrite comment on update path",
  );
  assert.doesNotMatch(
    updateBlock,
    /mileage_latest_km\s*=/,
    "existing-vehicle UPDATE must not assign mileage_latest_km",
  );
  assert.doesNotMatch(
    updateBlock,
    /mileage_latest_recorded_at\s*=/,
    "existing-vehicle UPDATE must not assign mileage_latest_recorded_at",
  );

  // New vehicle INSERT may still seed the cache from the first reading.
  const createIdx = sql.indexOf("if v_create_vehicle then");
  const createBlock = sql.slice(createIdx, updateIdx);
  assert.match(createBlock, /mileage_latest_km/);
  assert.match(createBlock, /p_mileage_reported_km/);
});
