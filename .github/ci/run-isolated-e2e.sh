#!/usr/bin/env bash
# Browser E2E against a disposable loopback Supabase stack. Never link a hosted DB.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CI_WORKDIR="$(mktemp -d -t selan-e2e.XXXXXX)"
EXPECTED_CONTAINER_NAME="supabase_db_avtoservis-selan-m3-review"
EXPECTED_HOST_PORT="55322"
export REPO_ROOT CI_WORKDIR CI=true SELAN_ISOLATED_E2E=1

cleanup() {
  set +e
  if [[ -n "${QUIBI_FIXTURE_PID:-}" ]]; then kill "${QUIBI_FIXTURE_PID}" 2>/dev/null || true; fi
  (cd "${CI_WORKDIR}" && supabase stop --no-backup) >/dev/null 2>&1 || true
}
trap cleanup EXIT

for name in docker node supabase pwsh; do
  command -v "$name" >/dev/null 2>&1 || { echo "Missing E2E tool: $name" >&2; exit 2; }
done
for name in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD PRODUCTION_DB_PASSWORD DATABASE_URL DIRECT_URL POSTGRES_URL; do
  if [[ -n "${!name:-}" ]]; then echo "Refusing remote DB environment: $name" >&2; exit 2; fi
done

bash "${REPO_ROOT}/.github/ci/prepare-ci-workdir.sh" full
# Supabase start prints disposable keys; keep its full output off shared CI logs.
if ! (cd "${CI_WORKDIR}" && supabase start --exclude studio --exclude logflare --exclude vector --exclude imgproxy > "${CI_WORKDIR}/supabase-start.log" 2>&1); then
  echo "Isolated Supabase bootstrap failed; raw bootstrap output is withheld because it can contain credentials." >&2
  exit 2
fi
pwsh -NoProfile -File "${REPO_ROOT}/supabase/tests/verify_isolated_docker_target.ps1" \
  -ExpectedContainerName "${EXPECTED_CONTAINER_NAME}" -ExpectedHostPort "${EXPECTED_HOST_PORT}"
(cd "${CI_WORKDIR}" && supabase migration up)
# Mirror the existing DEV assignment publication only in the verified disposable container.
# Hosted publication configuration is unchanged; this is not a hosted migration.
docker exec "${EXPECTED_CONTAINER_NAME}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c 'ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests, public.service_case_assignments, public.service_case_notes, public.service_case_photos, public.service_case_reviews;'


STATUS_JSON="$(cd "${CI_WORKDIR}" && supabase status -o json)"
status_value() {
  STATUS_JSON="${STATUS_JSON}" node --input-type=module -e '
    const data = JSON.parse(process.env.STATUS_JSON);
    const value = Object.entries(data).find(([key]) => key.toUpperCase() === process.argv[1])?.[1];
    if (!value) process.exit(2);
    process.stdout.write(String(value));
  ' "$1"
}
export E2E_API_URL="$(status_value API_URL)"
export E2E_SERVICE_ROLE_KEY="$(status_value SERVICE_ROLE_KEY)"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(status_value ANON_KEY)"
export NEXT_PUBLIC_SUPABASE_URL="${E2E_API_URL}"
E2E_API_URL="${E2E_API_URL}" node --input-type=module -e '
  const url = new URL(process.env.E2E_API_URL);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) process.exit(2);
'
export E2E_PASSWORD="$(node --input-type=module -e 'import {randomBytes} from "node:crypto"; process.stdout.write(randomBytes(24).toString("base64url"))')"
export E2E_FIXTURES_PATH="${CI_WORKDIR}/e2e-fixtures.json"
node "${REPO_ROOT}/scripts/e2e/seed-isolated.mjs"
export SUPABASE_SERVICE_ROLE_KEY="${E2E_SERVICE_ROLE_KEY}"
unset E2E_SERVICE_ROLE_KEY

export QUIBI_DEV_USERNAME="isolated-e2e"
export QUIBI_DEV_PASSWORD="${E2E_PASSWORD}"
export QUIBI_E2E_ORIGIN="http://127.0.0.1:47862"
export COMPLETION_PUBLIC_ORIGIN="http://127.0.0.1:3000"
export PUBLIC_APP_ORIGIN="http://127.0.0.1:3000"
node "${REPO_ROOT}/scripts/e2e/quibi-fixture.mjs" &
QUIBI_FIXTURE_PID=$!

cd "${REPO_ROOT}"
npm run build
npm run test:e2e -- tests/e2e/workflow.spec.ts

# One connected synthetic workflow, using only the loopback Quibi fixture.
kill "${QUIBI_FIXTURE_PID}"
wait "${QUIBI_FIXTURE_PID}" 2>/dev/null || true
export APP_ENV=local QUIBI_E2E_WRITE_ENABLED=1 QUIBI_DEV_INTAKE_SYNC_ENABLED=1
export QUIBI_DEV_USERNAME=selan-isolated-fixture QUIBI_DEV_PASSWORD=selan-isolated-fixture
export QUIBI_INTAKE_SYNC_ACTOR_ID="$(node --input-type=module -e 'import {readFileSync} from "node:fs"; process.stdout.write(JSON.parse(readFileSync(process.env.E2E_FIXTURES_PATH,"utf8")).ownerId)')"
export QUIBI_E2E_STATE_FILE="${CI_WORKDIR}/quibi-fixture-state.json"
node "${REPO_ROOT}/scripts/e2e/quibi-fixture.mjs" &
QUIBI_FIXTURE_PID=$!
npx playwright test tests/e2e/connected-flow.spec.ts --project=desktop-chromium
