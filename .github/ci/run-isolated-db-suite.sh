#!/usr/bin/env bash
# Orchestrate isolated M3 → M4 DB suites on a disposable local Supabase stack.
# Intended for GitHub-hosted ubuntu-latest with Docker. Never links remote projects.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
CI_WORKDIR="${CI_WORKDIR:-$(mktemp -d -t avtoservis-ci-supabase.XXXXXX)}"
EXPECTED_CONTAINER_NAME="supabase_db_avtoservis-selan-m3-review"
EXPECTED_HOST_PORT="55322"
EXPECTED_PROJECT_REF="avtoservis-selan-m3-review"

export REPO_ROOT CI_WORKDIR
export GIT_TERMINAL_PROMPT=0

echo "== Isolated DB CI workdir: ${CI_WORKDIR} =="
echo "Canonical repo config.toml will NOT be modified."

cleanup() {
  set +e
  if [[ -d "${CI_WORKDIR}/supabase" ]]; then
    (cd "${CI_WORKDIR}" && supabase stop --no-backup) || true
  fi
}
trap cleanup EXIT

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Refusing: required command '$1' not found" >&2
    exit 2
  }
}

require_cmd docker
require_cmd psql
require_cmd node
require_cmd supabase
require_cmd pwsh

# Hard refuse remote link / production token usage in this job.
if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Refusing: SUPABASE_ACCESS_TOKEN is set; isolated local CI must not use hosted credentials." >&2
  exit 2
fi
if [[ -n "${PRODUCTION_DB_PASSWORD:-}" || -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "Refusing: production/db password env vars are set; isolated local CI only." >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# Phase A: M3-only local stack
# ---------------------------------------------------------------------------
bash "${REPO_ROOT}/.github/ci/prepare-ci-workdir.sh" m3

echo "== Starting local Supabase (Docker) for M3 =="
(
  cd "${CI_WORKDIR}"
  supabase start \
    --exclude studio \
    --exclude logflare \
    --exclude vector \
    --exclude imgproxy \
    --exclude mailpit
)

STATUS_JSON="$(cd "${CI_WORKDIR}" && supabase status -o json)"
DB_URL="$(
  STATUS_JSON="${STATUS_JSON}" node --input-type=module -e '
const data = JSON.parse(process.env.STATUS_JSON);
let url;
for (const [k, v] of Object.entries(data)) {
  if (String(k).toUpperCase() === "DB_URL") { url = v; break; }
}
if (!url) {
  console.error("Refusing: DB_URL missing from supabase status -o json");
  process.exit(2);
}
process.stdout.write(String(url));
'
)"

echo "Resolved local DB_URL host/port (credentials redacted for logs)."
DB_URL="${DB_URL}" EXPECTED_HOST_PORT="${EXPECTED_HOST_PORT}" node --input-type=module -e '
const u = new URL(process.env.DB_URL);
const port = Number(process.env.EXPECTED_HOST_PORT);
const db = (u.pathname || "").replace(/^\//, "");
console.log(`DB target scheme=${u.protocol.replace(":","")} host=${u.hostname} port=${u.port} db=${db}`);
if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) {
  console.error("Refusing: DB_URL host is not loopback");
  process.exit(2);
}
if (Number(u.port) !== port) {
  console.error(`Refusing: DB_URL port ${u.port} != ${port}`);
  process.exit(2);
}
'

export DATABASE_URL="${DB_URL}"
export M4_ISOLATED_TEST_DATABASE_URL="${DB_URL}"

echo "== Independent Docker identity verification (pre-marker) =="
pwsh -NoProfile -File "${REPO_ROOT}/supabase/tests/verify_isolated_docker_target.ps1" \
  -ExpectedContainerName "${EXPECTED_CONTAINER_NAME}" \
  -ExpectedHostPort ${EXPECTED_HOST_PORT}

echo "== Negative: M3 regression must refuse without marker =="
set +e
pwsh -NoProfile -File "${REPO_ROOT}/supabase/tests/run-m3-db-regression.ps1"
M3_NO_MARKER_EXIT=$?
set -e
if [[ "${M3_NO_MARKER_EXIT}" -eq 0 ]]; then
  echo "Refusing: M3 regression unexpectedly passed without isolated marker" >&2
  exit 2
fi
echo "OK: M3 regression refused missing marker (exit ${M3_NO_MARKER_EXIT})"

echo "== CI bootstrap: install M3 isolated marker (gated) =="
pwsh -NoProfile -File "${REPO_ROOT}/supabase/tests/Install-IsolatedTestMarker.ps1" \
  -DatabaseUrl "${DATABASE_URL}" \
  -ExpectedContainerName "${EXPECTED_CONTAINER_NAME}" \
  -ExpectedHostPort ${EXPECTED_HOST_PORT}

echo "== M3 regression =="
pwsh -NoProfile -File "${REPO_ROOT}/supabase/tests/run-m3-db-regression.ps1"
echo "PASS: M3 regression"

echo "== M3 owner-race concurrency =="
pwsh -NoProfile -File "${REPO_ROOT}/supabase/tests/m3_service_requests_owner_race.ps1"
echo "PASS: M3 owner-race"

# ---------------------------------------------------------------------------
# Phase B: install M4 migration on the same disposable DB
# ---------------------------------------------------------------------------
echo "== Staging M4 migration into CI workdir =="
bash "${REPO_ROOT}/.github/ci/prepare-ci-workdir.sh" m4

echo "== Applying pending M4 migration locally =="
(
  cd "${CI_WORKDIR}"
  # Apply only pending local migrations; never link/push to a remote project.
  supabase migration up
)

echo "== Re-verify Docker identity after M4 migration =="
pwsh -NoProfile -File "${REPO_ROOT}/supabase/tests/verify_isolated_docker_target.ps1" \
  -ExpectedContainerName "${EXPECTED_CONTAINER_NAME}" \
  -ExpectedHostPort ${EXPECTED_HOST_PORT}

export M4_ISOLATED_PROJECT_REF="${EXPECTED_PROJECT_REF}"
export M4_ISOLATED_CONTAINER_ID="${EXPECTED_CONTAINER_NAME}"
export M4_ISOLATED_EXPECTED_DATABASE="postgres"

echo "== Negative: M4 regression must refuse without M4 marker =="
set +e
pwsh -NoProfile -File "${REPO_ROOT}/scripts/run-m4-db-regression.ps1"
M4_NO_MARKER_EXIT=$?
set -e
if [[ "${M4_NO_MARKER_EXIT}" -eq 0 ]]; then
  echo "Refusing: M4 regression unexpectedly passed without M4 marker" >&2
  exit 2
fi
echo "OK: M4 regression refused missing marker (exit ${M4_NO_MARKER_EXIT})"

echo "== CI bootstrap: install M4 isolated marker from live Docker identity =="
pwsh -NoProfile -File "${REPO_ROOT}/.github/ci/bootstrap-m4-marker.ps1" \
  -DatabaseUrl "${M4_ISOLATED_TEST_DATABASE_URL}" \
  -ExpectedContainerName "${EXPECTED_CONTAINER_NAME}" \
  -ExpectedHostPort ${EXPECTED_HOST_PORT} \
  -RepoRoot "${REPO_ROOT}"

echo "== M4 regression =="
pwsh -NoProfile -File "${REPO_ROOT}/scripts/run-m4-db-regression.ps1"
echo "PASS: M4 regression"

echo "== M4 concurrency =="
pwsh -NoProfile -File "${REPO_ROOT}/scripts/run-m4-db-concurrency.ps1"
echo "PASS: M4 concurrency"

echo "== Staging complete ordered migration chain on the same disposable DB =="
bash "${REPO_ROOT}/.github/ci/prepare-ci-workdir.sh" full
(
  cd "${CI_WORKDIR}"
  supabase migration up
)

echo "== Re-verify Docker identity after full-chain migration =="
pwsh -NoProfile -File "${REPO_ROOT}/supabase/tests/verify_isolated_docker_target.ps1" \
  -ExpectedContainerName "${EXPECTED_CONTAINER_NAME}" \
  -ExpectedHostPort ${EXPECTED_HOST_PORT}

echo "== Quibi link RLS, tenant isolation, and duplicate regression =="
PGOPTIONS="-c m4.isolated_project_ref=${EXPECTED_PROJECT_REF} -c m4.isolated_container_id=${EXPECTED_CONTAINER_NAME}" \
  psql "${DB_URL}" -v ON_ERROR_STOP=1 \
  -f "${REPO_ROOT}/supabase/tests/quibi_integration_links_regression.sql"
echo "PASS: Quibi integration-link regression"

echo "== Preliminary inspection RLS, decisions, and tenant isolation =="
PGOPTIONS="-c m4.isolated_project_ref=${EXPECTED_PROJECT_REF} -c m4.isolated_container_id=${EXPECTED_CONTAINER_NAME}" \
  psql "${DB_URL}" -v ON_ERROR_STOP=1 \
  -f "${REPO_ROOT}/supabase/tests/preliminary_inspection_regression.sql"
echo "PASS: Preliminary inspection regression"

echo "== All isolated M3/M4 + full-chain DB suites passed on disposable local Docker target =="
