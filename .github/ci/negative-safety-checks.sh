#!/usr/bin/env bash
# Static + negative safety probes for isolated DB CI (no production access).
# Safe to run without a live Supabase stack for URL/workflow guards.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
WF="${REPO_ROOT}/.github/workflows/isolated-db-tests.yml"
PASS=0
FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*" >&2; FAIL=$((FAIL + 1)); }

echo "== Static workflow guards =="
[[ -f "${WF}" ]] || { echo "Missing workflow ${WF}" >&2; exit 2; }

if grep -E "\$\{\{\s*secrets\." "${WF}" >/dev/null; then
  fail "workflow references GitHub secrets"
else
  pass "workflow does not reference secrets.*"
fi

if grep -Eiq 'supabase link|db push|vercel deploy|production' "${WF}"; then
  # Allow comments that explicitly forbid production; check non-comment lines.
  if grep -Eiq '^[^#]*supabase link|^[^#]*db push|^[^#]*vercel deploy' "${WF}"; then
    fail "workflow contains deploy/link/push commands"
  else
    pass "workflow has no active deploy/link/push commands"
  fi
else
  pass "workflow has no deploy/link/push/production command tokens"
fi

if grep -q 'cursor/m3-m4-ci-db-tests-v1' "${WF}"; then
  pass "workflow limited to CI DB-tests branch trigger"
else
  fail "workflow missing branch restriction cursor/m3-m4-ci-db-tests-v1"
fi

if grep -q 'contents: read' "${WF}"; then
  pass "workflow permissions contents: read"
else
  fail "workflow missing contents: read"
fi

# Ensure canonical config is not the CI identity in-repo.
if grep -q 'project_id = "avtoservis-selan-m3-review"' "${REPO_ROOT}/supabase/config.toml"; then
  fail "canonical supabase/config.toml unexpectedly uses CI project_id"
else
  pass "canonical supabase/config.toml keeps non-CI project_id"
fi

if grep -q 'port = 55322' "${REPO_ROOT}/supabase/config.toml"; then
  fail "canonical supabase/config.toml unexpectedly uses CI db port 55322"
else
  pass "canonical supabase/config.toml keeps non-CI db port"
fi

echo "== CI config patcher (temp copy only) =="
TMP="$(mktemp -d)"
node "${REPO_ROOT}/.github/ci/patch-ci-config.mjs" \
  "${REPO_ROOT}/supabase/config.toml" \
  "${TMP}/config.toml"
if grep -q 'project_id = "avtoservis-selan-m3-review"' "${TMP}/config.toml" \
  && grep -q 'port = 55322' "${TMP}/config.toml"; then
  pass "patch-ci-config writes CI project_id + port 55322 to temp copy"
else
  fail "patch-ci-config did not apply expected CI identity"
fi
# Same-path refuse
set +e
node "${REPO_ROOT}/.github/ci/patch-ci-config.mjs" \
  "${REPO_ROOT}/supabase/config.toml" \
  "${REPO_ROOT}/supabase/config.toml"
SAME_EXIT=$?
set -e
if [[ "${SAME_EXIT}" -ne 0 ]]; then
  pass "patch-ci-config refuses to overwrite canonical config path"
else
  fail "patch-ci-config allowed same-path overwrite"
fi
rm -rf "${TMP}"

echo "== Negative URL target probes (must fail closed before useful work) =="
if ! command -v pwsh >/dev/null 2>&1; then
  echo "NOTE: pwsh not available here; URL refusal probes deferred to GitHub ubuntu-latest."
else
  set +e
  DATABASE_URL='postgresql://postgres:not-a-secret@db.example.com:55322/postgres' \
    pwsh -NoProfile -File "${REPO_ROOT}/supabase/tests/run-m3-db-regression.ps1" >/tmp/m3-bad-host.out 2>&1
  E1=$?
  set -e
  if [[ "${E1}" -ne 0 ]] && grep -Eqi 'loopback|Refusing' /tmp/m3-bad-host.out; then
    pass "M3 runner refuses non-loopback host"
  else
    fail "M3 runner did not refuse non-loopback host (exit ${E1})"
    cat /tmp/m3-bad-host.out || true
  fi

  set +e
  DATABASE_URL='postgresql://postgres:not-a-secret@127.0.0.1:54322/postgres' \
    pwsh -NoProfile -File "${REPO_ROOT}/supabase/tests/run-m3-db-regression.ps1" >/tmp/m3-bad-port.out 2>&1
  E2=$?
  set -e
  if [[ "${E2}" -ne 0 ]] && grep -Eqi '55322|Refusing' /tmp/m3-bad-port.out; then
    pass "M3 runner refuses wrong external port"
  else
    fail "M3 runner did not refuse wrong port (exit ${E2})"
    cat /tmp/m3-bad-port.out || true
  fi

  set +e
  M4_ISOLATED_TEST_DATABASE_URL='postgresql://postgres:not-a-secret@db.supabase.co:5432/postgres' \
  M4_ISOLATED_PROJECT_REF='avtoservis-selan-m3-review' \
  M4_ISOLATED_CONTAINER_ID='supabase_db_avtoservis-selan-m3-review' \
    pwsh -NoProfile -File "${REPO_ROOT}/scripts/run-m4-db-regression.ps1" >/tmp/m4-bad-host.out 2>&1
  E3=$?
  set -e
  if [[ "${E3}" -ne 0 ]] && grep -Eqi 'hosted|remote|loopback|REFUSING' /tmp/m4-bad-host.out; then
    pass "M4 runner refuses hosted/remote URL"
  else
    fail "M4 runner did not refuse hosted URL (exit ${E3})"
    cat /tmp/m4-bad-host.out || true
  fi
fi

echo "== Summary: ${PASS} passed, ${FAIL} failed =="
if [[ "${FAIL}" -ne 0 ]]; then
  exit 1
fi
exit 0
