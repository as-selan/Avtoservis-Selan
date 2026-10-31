# Contact validation and Quibi QA — 2026-10-08

Branch: codex/selan-pr18-manual-qa. Baseline and fetched remote HEAD: 13441c5b92a22c11e51e2a9f71f3e1b92f48cf00.

## Root cause and changes

The web-intake migration replaced the manual completeness helper with a strict shared helper requiring both phone and email, while the manual form/RPC minimum accepts either. Completion also moved needs_data directly to preparing_offer, bypassing the review guard which originally covered only new -> preparing_offer. The web RPC itself accepted one contact even though the UI required both.

The forward migration keeps web strict, restores manual OR, selects policy from stored source/channel, freezes those fields against updates, preserves existing grants, returns completion to new, and explicitly requires review evidence plus matching customer/vehicle before offer preparation. It recomputes existing needs_data cases from persisted identities without inventing contacts or review evidence. Existing completion locks, fill-only updates, same-request vehicle creation and completed-token idempotency are preserved.

Quibi links show Povezujem... and disable the submit button while pending, invalidate the dashboard layout before redirect, treat the same stored pair as success, and retain conflicts for different pairs. A document with an explicit different Quibi vehicle ID is rejected during linking, review, delivery recording and price suggestion. The 122 EUR test result remains proposed until explicit price review.

## Verification

- RED before fix: two manual contact tests failed; completion-review and document-vehicle mismatch tests failed.
- node --import ./scripts/contact-test-register.mjs --experimental-strip-types --test <all src/lib/**/*.test.ts>: 93 tests passed, zero failures (final run). No actual Quibi write/send requests are made by these fixture-based unit tests.
- node node_modules/typescript/bin/tsc --noEmit: PASS.
- npm run lint: PASS after excluding generated .next-local-review, Playwright reports and test-results. Initial lint scanned generated bundles and failed; application sources were not the source of those errors.
- git diff --check: PASS.
- scripts/web-intake-public.assert.ts: PASS.
- scripts/missing-data-completion.assert.ts: PASS with effective forward definitions and preserved grants.
- scripts/offer-preparation.assert.ts: PASS; obsolete readiness assertion updated to the existing structured step input.
- PostgreSQL 17.6, ONLY supabase_db_avtoservis-selan-manual-pr18: BEGIN + new migration + supabase/tests/contact-policy-regression.sql + ROLLBACK, exit 0. All test mutations and migration changes rolled back. No reset or seed script used.
- Build: final-source isolated `next build --webpack` PASS, exit 0; compile, TypeScript, all 15 static pages and build traces completed. Initial Turbopack PostCSS timed out. An isolated Webpack build then compiled but required the existing local public Supabase configuration for prerendering; the configured retry passed. Final source verification uses the same real local public values ONLY in a child process, no persisted environment or project setting changes.
- E2E workflow spec updated to require new and explicit intake review after completion; not executed against hosted or existing manually seeded QA data.

| Requested regression | Evidence |
| --- | --- |
| Manual email only | SQL RPC + TS PASS |
| Manual phone only | SQL RPC + TS PASS |
| Manual neither | SQL RPC + TS rejected |
| Web missing either | SQL RPC + web TS rejected |
| Completion same case and local vehicle | SQL actual completion RPC PASS |
| No duplicates on retry | SQL completed-token retry and offer retry PASS |
| Tadej review retained | SQL new state, blocked direct transition/preparation, then explicit review PASS |
| Quibi UI refresh/pending/repeat | Implemented and lint/TS verified; browser/hosted E2E NOT RUN |
| Wrong customer/vehicle | Quibi fixture unit guards PASS; SQL canonical ownership checked; actual DEV document NOT re-read in this run |
| Safe 122 EUR suggestion | Fixture with customer 405956, vehicle 2387, document 2176888 returns proposed 122; mismatched document vehicle rejected; actual DEV price NOT confirmed in this run |

## Hosted case and blocker

Read-only Supabase checks located request 9d40c42f-b6a8-473b-983f-f9620df97d10: source manual, channel manual, status needs_data, customer dfa5f6bf-586d-4dd7-867f-219fd1cef7ad, no local vehicle, missing phone/vin/make/model. Customer has email and no phone; existing Quibi customer link 405956 is ok. No hosted business rows were changed.

Migration 20261008160005_contact_policy_and_completion_review.sql is prepared and NOT applied to hosted. Hosted E2E is NOT PASS. Approval of this exact migration is required by the user's instruction before continuing the same hosted case. No new Supabase/Vercel projects, no production Quibi access, no Quibi write/send, no email, no enablement of QUIBI_DEV_WRITE_ENABLED, no merge, no dependency additions and no changes to other projects.

After approval and hosted migration, continue ONLY this request through its completion link with VIN TEST153D7E1AA2026, make TEST, model QA and no invented phone. Verify one local vehicle and one request after retry. Completion supports VIN/make/model; set/check registration TEST153D7 through the existing authenticated vehicle edit before confirming the Quibi vehicle pair. Tadej must accept intake. Confirm customer 405956 and vehicle 2387, link existing estimate 2176888 after a fresh DEV read, verify proposed 122 EUR, and stop before sending. Test UI pending, duplicate click, refresh without F5 and repeat success on the current preview.

Commit/push to the requested branch is authorized and recommended after final checks; merge and hosted application remain pending. Pre-existing untracked manual-qa PNGs are preserved and excluded from the commit.

## Files changed

- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/eslint.config.mjs
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/scripts/missing-data-completion.assert.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/scripts/offer-preparation.assert.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/app/dashboard/stranke/[customerId]/quibi/page.tsx
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/components/dashboard/LinkManualEstimateForm.tsx
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/cases/next-step.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/completion/constants.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/completion/lifecycle.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/intake/completeness.test.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/intake/completeness.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/intake/validate.test.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/offer-preparation/actions.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/quibi/actions.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/quibi/manual-estimate-action.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/quibi/price-suggestion.test.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/quibi/price-suggestion.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/scripts/contact-test-loader.mjs
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/scripts/contact-test-register.mjs
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/components/quibi-link-submit.tsx
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/completion/lifecycle.test.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/intake/contact-policy.test.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/supabase/migrations/20261008160005_contact_policy_and_completion_review.sql
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/supabase/tests/contact-policy-regression.sql
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/docs/qa/contact-validation-quibi-2026-10-08.md

- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/tests/e2e/workflow.spec.ts

## Rules and skills read/used

- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/AGENTS.md
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/CLAUDE.md
- C:/Users/Admin/avtoservis-selan-wt/m3-m4-ci-db-tests-v1/AGENTS.md
- C:/Users/Admin/.ai-os/ORCHESTRATION_GUIDE.md

- C:/Users/Admin/.agents/skills/ai-orchestrator/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/using-superpowers/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/systematic-debugging/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/test-driven-development/SKILL.md
- C:/Users/Admin/.agents/skills/superpowers/verification-before-completion/SKILL.md
- C:/Users/Admin/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md

Additional inspected skill (not used for native automation): C:/Users/Admin/.codex/plugins/cache/openai-bundled/computer-use/26.1002.52244/skills/computer-use/SKILL.md.

## Additional source/docs inspected

- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/intake/validate.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/intake/web-validate.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/intake/normalize.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/completion/validate.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/completion/public.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/completion/actions.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/cases/review-intake-action.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/app/dashboard/primeri/[serviceRequestId]/page.tsx
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/quibi/contracts.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/dashboard/load-dashboard-snapshot.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/src/lib/dashboard/adapt-dashboard.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/scripts/manual-qa/README.md
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/scripts/manual-qa/Start-ManualQa.ps1
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/playwright.local-qa.config.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/next.config.ts
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/package.json
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/node_modules/next/dist/docs/01-app/02-guides/forms.md
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/supabase/migrations/20260928175120_20260913214500_create_manual_service_request_intake.sql
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/supabase/migrations/20260928175302_20260914024500_create_web_service_request_intake.sql
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/supabase/migrations/20260928175317_20260914033000_create_service_request_completion_links.sql
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/supabase/migrations/20260928175331_20260917100000_create_offer_preparations.sql
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/supabase/migrations/20260928175707_20260928163011_protect_public_web_intake_v1.sql
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/supabase/migrations/20260930120000_review_intake_and_fix_published_url.sql

Supabase function/security reference consulted: https://supabase.com/docs/guides/database/functions. Changelog markdown fetch was unsupported by the web tool.

Local verification logs (ignored):

- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/.next/contact-policy-unit-tests.log
- C:/Users/Admin/.codex/worktrees/selan-pr18-manual-qa/m3-m4-ci-db-tests-v1/.next/contact-policy-db-tests.log
