# PR #18: isolated local manual QA

## Safe Chrome E2E retry after manual QA data exists

The original manual project (`avtoservis-selan-manual-pr18`, app port 3000,
API 55421, DB 55422, fixture 47862) must stay running and untouched. Its
canonical slug now belongs to fresh manual data. Never run `npm run test:e2e`,
`seed-isolated.mjs`, `Start-ManualQa.ps1`, or any database reset against it.

The retry uses a **second** local project, `avtoservis-selan-e2e-retry-pr18`:
app port 3001, fixture 47962, Supabase shadow/API/DB/Studio/mail/analytics/
pooler ports 55520/55521/55522/55523/55524/55527/55529. It copies only
Git-tracked source and `playwright.local-qa.config.ts` into a separate source
directory before `npm ci` and build, so the running manual app's `.next` is not
overwritten. Playwright uses installed Chrome for desktop and mobile emulation.
The GitHub CI config and its default ports stay unchanged.

Review and perform a read-only preflight in PowerShell 7.2+:

    Set-Location 'C:\Users\Admin\.codex\worktrees\selan-pr18-manual-qa\m3-m4-ci-db-tests-v1'
    Get-Content .\playwright.local-qa.config.ts
    Get-Content .\scripts\manual-qa\Run-IsolatedE2ERetry.ps1
    .\scripts\manual-qa\Run-IsolatedE2ERetry.ps1 -Preflight

Only after separate approval, run from the same directory:

    .\scripts\manual-qa\Run-IsolatedE2ERetry.ps1 -RunTests

This starts only the new local Supabase project, applies the 16 migrations,
seeds synthetic E2E users/cases, builds the separate source copy, and executes
desktop/mobile tests using the local Chrome channel. The fixture process it
starts is stopped after tests. The second database remains for diagnosis.
If startup fails, inspect `LOCALAPPDATA\AvtoservisSelan\e2e-retry-pr18` and
the exact retry Docker container names. The script refuses to overwrite a
partial run, and it does not stop or reset any existing project. Ask for a
scoped recovery review before retrying a failed partial run.

Use PowerShell 7.2 or newer (pwsh). Do not run the start script before approval.
Preflight checks the PowerShell version, Docker, ports and 16 migration names.
It returns before creating files or changing any database.

Project ID: avtoservis-selan-manual-pr18.
Ports: app 3000; Quibi fixture 47862; Supabase shadow 55420, API 55421,
database 55422, Studio 55423, mail 55424, analytics 55427, pooler 55429.
The existing m3-review and PonudbaPro projects use different ports. An
occupied port or existing QA container causes preflight to fail. If 3000
becomes busy, pause and update app, Auth redirect and E2E origin together.

The QA directory is under LOCALAPPDATA\AvtoservisSelan\manual-pr18, separate
from the repository. Hosted database credentials and repo .env files are
rejected.

## Review without launching

In your own PowerShell 7, from this directory:

    Get-Content .\Start-ManualQa.ps1
    Get-Content .\Stop-ManualQa.ps1
    .\Start-ManualQa.ps1 -Preflight

## Launch only after approval

    .\Start-ManualQa.ps1 -RunTests

Start copies all 16 migrations, starts only its unique local project, validates
the exact QA database container and port, then seeds synthetic E2E users.
After desktop/mobile Playwright it retains the E2E organization under a completed-test slug and seeds a second, fresh organization with the canonical public-intake slug and
separate manual users/cases. No database reset is performed. If E2E fails, the
script reports failure but leaves the fresh manual dataset and app running for
diagnosis at http://127.0.0.1:3000/login.

Read the manual owner's DPAPI-protected credential on the same Windows user:

    $qa = Join-Path $env:LOCALAPPDATA 'AvtoservisSelan\manual-pr18'
    $cred = Import-Clixml (Join-Path $qa 'owner.credential.xml')
    $cred.UserName
    $cred.GetNetworkCredential().Password

The owner is selan-manual-owner@example.test. Other synthetic records and
case IDs are in manual-fixtures.json. Never send the password in chat.

## Stop or recover from failure

    .\Stop-ManualQa.ps1

Stop verifies the manifest, copied project ID, exact database container name
supabase_db_avtoservis-selan-manual-pr18 and published port 55422. It verifies
the Node process command lines, stops only those processes and the
project-scoped local Supabase stack, then confirms they are no longer running.
It keeps QA files and database backup. It never uses stop --all, db reset or
docker system prune.

After a failed start, inspect the error and dedicated QA directory. Stop
handles a verified partial run or reports that nothing started. If partial
QA containers exist without the expected database, it refuses automatic
cleanup; inspect them, then use Stop-ManualQa.ps1 -Partial to stop only these exact QA containers. Start refuses to overwrite an
existing QA directory. Review the failure state before retrying.

## Manual desktop and phone checklist

1. Owner login; Dashboard V1; fresh case; permissions and mobile overflow.
2. Public inquiry; phone intake; customer/vehicle reuse; missing-data link
   continues the original case.
3. Normal service: fixture customer 2001 and estimate 4001, document review,
   price approval, synthetic proof of manual delivery, customer decision,
   three checked times, selection and simulated MyPlanly booking reference.
   No status may claim external sync without proof.
4. Preliminary inspection: appointment, findings, estimate; repair ordered
   means inspection free, declined means payable. Do not invent a price.
5. Known final price: look for an explicit path for a published fixed price
   without separate estimate. Absence is a release gap, not a passed test.
6. Quibi fixture drift/error and retry. This is not a dev.quibi.net check.

Current Playwright covers desktop/mobile intake, access, edits and
missing-data continuation. One-time estimate and inspection scenarios are
desktop-only; repeat them manually on phone. Known final price has no
automated E2E coverage.
