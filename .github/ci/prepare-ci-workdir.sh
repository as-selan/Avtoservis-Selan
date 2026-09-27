#!/usr/bin/env bash
# Prepare a disposable Supabase workdir for isolated M3/M4 DB CI.
# Never mutates the repository canonical supabase/config.toml.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
PHASE="${1:-m3}" # m3 | m4 | full
CI_WORKDIR="${CI_WORKDIR:-}"

if [[ -z "${CI_WORKDIR}" ]]; then
  echo "Refusing: set CI_WORKDIR to a temporary directory outside the repo canonical supabase/ path." >&2
  exit 2
fi

M3_MIGRATIONS=(
  "20260912181715_secure_foundation_slice_a.sql"
  "20260913174315_customers.sql"
  "20260913174349_vehicles.sql"
  "20260913174900_service_requests.sql"
)
M4_MIGRATION="20260913214500_create_manual_service_request_intake.sql"
LATER_MIGRATIONS=(
  "20260914003000_appointments_foundation.sql"
  "20260914024500_create_web_service_request_intake.sql"
  "20260914033000_create_service_request_completion_links.sql"
  "20260917100000_create_offer_preparations.sql"
  "20260919140000_create_offer_review_customer_approval.sql"
  "20260926120000_quibi_read_links.sql"
  "20260927085839_manual_quibi_estimate_v1.sql"
)

mkdir -p "${CI_WORKDIR}/supabase/migrations"

node "${REPO_ROOT}/.github/ci/patch-ci-config.mjs" \
  "${REPO_ROOT}/supabase/config.toml" \
  "${CI_WORKDIR}/supabase/config.toml"

# Always stage M3 migrations first.
for f in "${M3_MIGRATIONS[@]}"; do
  src="${REPO_ROOT}/supabase/migrations/${f}"
  if [[ ! -f "${src}" ]]; then
    echo "Refusing: missing M3 migration ${src}" >&2
    exit 2
  fi
  cp -f "${src}" "${CI_WORKDIR}/supabase/migrations/${f}"
done

if [[ "${PHASE}" == "m4" || "${PHASE}" == "full" ]]; then
  src="${REPO_ROOT}/supabase/migrations/${M4_MIGRATION}"
  if [[ ! -f "${src}" ]]; then
    echo "Refusing: missing M4 migration ${src}" >&2
    exit 2
  fi
  cp -f "${src}" "${CI_WORKDIR}/supabase/migrations/${M4_MIGRATION}"
elif [[ "${PHASE}" != "m3" ]]; then
  echo "Refusing: phase must be m3, m4, or full (got '${PHASE}')" >&2
  exit 2
fi

if [[ "${PHASE}" == "full" ]]; then
  mapfile -t repo_migrations < <(find "${REPO_ROOT}/supabase/migrations" -maxdepth 1 -name '*.sql' -printf '%f\n' | sort)
  mapfile -t expected_migrations < <(printf '%s\n' "${M3_MIGRATIONS[@]}" "${M4_MIGRATION}" "${LATER_MIGRATIONS[@]}" | sort)
  if [[ "${repo_migrations[*]}" != "${expected_migrations[*]}" ]]; then
    echo "Refusing: full-chain migration list is incomplete or has unexpected files" >&2
    exit 2
  fi
  for f in "${LATER_MIGRATIONS[@]}"; do
    src="${REPO_ROOT}/supabase/migrations/${f}"
    if [[ ! -f "${src}" ]]; then
      echo "Refusing: missing ordered full-chain migration ${src}" >&2
      exit 2
    fi
    cp -f "${src}" "${CI_WORKDIR}/supabase/migrations/${f}"
  done
fi

# Safety: ensure M4 migration is absent during pure M3 bootstrap.
if [[ "${PHASE}" == "m3" && -f "${CI_WORKDIR}/supabase/migrations/${M4_MIGRATION}" ]]; then
  echo "Refusing: M4 migration present during m3 phase" >&2
  exit 2
fi

echo "Prepared CI workdir ${CI_WORKDIR} (phase=${PHASE})"
ls -1 "${CI_WORKDIR}/supabase/migrations"
