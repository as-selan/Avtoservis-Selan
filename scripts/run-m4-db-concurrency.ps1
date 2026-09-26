#Requires -Version 5.1
<#
.SYNOPSIS
  True two-session concurrency tests for M4 manual intake (prepared; not run here).

.DESCRIPTION
  Covers:
    A) identical simultaneous client_request_id → both ok, exactly one original write
    B) conflicting simultaneous payloads → one success + one idempotency_conflict
    C) same-VIN distinct client ids → both ok + expected record counts

  Requires isolated target gate (same as run-m4-db-regression.ps1).
  Asserts JSON result payloads (not merely process exit codes).
  Creates ephemeral auth + org fixtures, then ALWAYS attempts cleanup.

  Does not apply setup_m4_isolated_test_marker.sql (manual operator step).
  External host/URI port is checked against docker published HostPort only;
  internal inet_server_port() is validated by assert_isolated_test_target.sql.
#>
param(
  [string]$DatabaseUrl = $env:M4_ISOLATED_TEST_DATABASE_URL,
  [string]$ProjectRef = $env:M4_ISOLATED_PROJECT_REF,
  [string]$ContainerId = $env:M4_ISOLATED_CONTAINER_ID,
  [string]$ExpectedDatabase = $env:M4_ISOLATED_EXPECTED_DATABASE,
  [string]$Psql = $env:M4_PSQL_PATH
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$gateSql = Join-Path $repoRoot "supabase/tests/assert_isolated_test_target.sql"
$setupSql = Join-Path $repoRoot "supabase/tests/m4_concurrency_setup.sql"
$cleanupSql = Join-Path $repoRoot "supabase/tests/m4_concurrency_cleanup.sql"
$sessionIdemA = Join-Path $repoRoot "supabase/tests/m4_concurrency_session_a.sql"
$sessionIdemB = Join-Path $repoRoot "supabase/tests/m4_concurrency_session_b_idempotency.sql"
$sessionIdemConflictB = Join-Path $repoRoot "supabase/tests/m4_concurrency_session_b_idempotency_conflict.sql"
$sessionVinA = Join-Path $repoRoot "supabase/tests/m4_concurrency_session_a_same_vin.sql"
$sessionVinB = Join-Path $repoRoot "supabase/tests/m4_concurrency_session_b_same_vin.sql"
$verifyIdenticalSql = Join-Path $repoRoot "supabase/tests/m4_concurrency_verify_identical.sql"
$verifyConflictSql = Join-Path $repoRoot "supabase/tests/m4_concurrency_verify_conflict.sql"
$verifySameVinSql = Join-Path $repoRoot "supabase/tests/m4_concurrency_verify_same_vin.sql"

function Fail([string]$Message) {
  Write-Error "REFUSING M4 CONCURRENCY TESTS: $Message"
  exit 2
}

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  Fail "Set M4_ISOLATED_TEST_DATABASE_URL (not DATABASE_URL)."
}
if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
  Fail "Set M4_ISOLATED_PROJECT_REF (required)."
}
if ([string]::IsNullOrWhiteSpace($ContainerId)) {
  Fail "Set M4_ISOLATED_CONTAINER_ID (required)."
}
if ($DatabaseUrl -match '(supabase\.co|pooler\.supabase|aws|azure|neon\.tech|prisma\.io)') {
  Fail "URL looks hosted/remote."
}
try { $uri = [Uri]$DatabaseUrl } catch { Fail "Invalid URI." }
if ($uri.Host -notin @("localhost", "127.0.0.1", "::1")) {
  Fail "Host '$($uri.Host)' is not loopback."
}
if ($uri.Port -le 0) {
  Fail "URL must include an explicit local Postgres port."
}
$dbName = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart("/"))
if ([string]::IsNullOrWhiteSpace($dbName)) {
  Fail "URL must include a database name path segment."
}
if (-not [string]::IsNullOrWhiteSpace($ExpectedDatabase) -and $ExpectedDatabase -ne $dbName) {
  Fail "M4_ISOLATED_EXPECTED_DATABASE '$ExpectedDatabase' does not match URL database '$dbName'."
}

if ([string]::IsNullOrWhiteSpace($Psql)) {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if (-not $cmd) { Fail "psql not found." }
  $Psql = $cmd.Source
}

$urlPort = $uri.Port
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCmd) {
  Fail "docker CLI is required to verify the disposable isolated target."
}
$inspectJson = & docker inspect $ContainerId 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($inspectJson)) {
  Fail "docker inspect failed for container '$ContainerId'."
}
$inspect = $inspectJson | ConvertFrom-Json
if (-not $inspect[0].State.Running) {
  Fail "Container '$ContainerId' is not running."
}
$publishedDbPort = $null
$ports = $inspect[0].NetworkSettings.Ports
if ($null -ne $ports.'5432/tcp') {
  foreach ($binding in @($ports.'5432/tcp')) {
    if ($binding.HostPort) { $publishedDbPort = [int]$binding.HostPort; break }
  }
}
if ($null -eq $publishedDbPort) {
  Fail "Container '$ContainerId' has no published host port for 5432/tcp."
}
# External-only check: host/URI port vs Docker published HostPort.
# Do NOT compare either value to inet_server_port() (internal DB listen port).
if ($publishedDbPort -ne $urlPort) {
  Fail "URL host port $urlPort does not match docker published host port $publishedDbPort (external mapping only; not inet_server_port)."
}

$inspectedName = ([string]$inspect[0].Name).TrimStart('/')
$derivedProjectRef = $null
$labels = $inspect[0].Config.Labels
if ($null -ne $labels) {
  foreach ($key in @(
      'com.supabase.cli.project-id',
      'com.supabase.project.id',
      'com.docker.compose.project'
    )) {
    if ($labels.PSObject.Properties.Name -contains $key -and -not [string]::IsNullOrWhiteSpace([string]$labels.$key)) {
      $derivedProjectRef = [string]$labels.$key
      break
    }
  }
}
if ([string]::IsNullOrWhiteSpace($derivedProjectRef) -and $inspectedName -match '^supabase_db_(.+)$') {
  $derivedProjectRef = $Matches[1]
}
if ([string]::IsNullOrWhiteSpace($derivedProjectRef)) {
  Fail "Could not derive project identity from docker metadata for '$ContainerId'."
}
if ($ProjectRef -ne $derivedProjectRef) {
  Fail "Caller project ref '$ProjectRef' does not match docker-derived '$derivedProjectRef'."
}

$env:PGOPTIONS = "-c m4.isolated_project_ref=$derivedProjectRef -c m4.isolated_container_id=$ContainerId"

function Invoke-Psql([string]$File) {
  & $Psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $File
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $File (exit $LASTEXITCODE)" }
}

function Invoke-ParallelSessions([string]$FileA, [string]$FileB, [string]$Label) {
  $processes = @()
  try {
    foreach ($file in @($FileA, $FileB)) {
      # Start-Process joins ArgumentList on Windows, so quote URL and SQL path explicitly.
      $args = @(([char]34 + $DatabaseUrl + [char]34), "-X", "-v", "ON_ERROR_STOP=1", "-f", ([char]34 + $file + [char]34))
      $processes += Start-Process -FilePath $Psql -ArgumentList $args -PassThru -NoNewWindow
    }
    foreach ($process in $processes) {
      if (-not $process.WaitForExit(45000)) {
        throw "$Label timed out after 45 seconds"
      }
    }
    if ($processes[0].ExitCode -ne 0 -or $processes[1].ExitCode -ne 0) {
      throw "$Label process exit failed (A=$($processes[0].ExitCode) B=$($processes[1].ExitCode))"
    }
  }
  finally {
    foreach ($process in $processes) {
      if (-not $process.HasExited) {
        $process.Kill()
        [void]$process.WaitForExit(5000)
      }
      $process.Dispose()
    }
  }
}

Write-Host "M4 concurrency: docker-verified container=$ContainerId published_port=$publishedDbPort db=$dbName project_ref=$derivedProjectRef"
Write-Host "M4 concurrency: gate..."
Invoke-Psql $gateSql

$cleanupNeeded = $false
try {
  Write-Host "M4 concurrency: setup ephemeral fixtures..."
  $cleanupNeeded = $true
  Invoke-Psql $setupSql

  Write-Host "M4 concurrency: parallel duplicate client_request_id (identical)..."
  Invoke-ParallelSessions $sessionIdemA $sessionIdemB "Idempotency identical race"
  Write-Host "M4 concurrency: assert identical race JSON + row counts..."
  Invoke-Psql $verifyIdenticalSql

  Write-Host "M4 concurrency: cleanup before conflict race..."
  Invoke-Psql $cleanupSql
  Invoke-Psql $setupSql

  Write-Host "M4 concurrency: parallel same ID different payloads..."
  Invoke-ParallelSessions $sessionIdemA $sessionIdemConflictB "Idempotency conflict race"
  Write-Host "M4 concurrency: assert conflict race JSON + row counts..."
  Invoke-Psql $verifyConflictSql

  Write-Host "M4 concurrency: cleanup before same-VIN race..."
  Invoke-Psql $cleanupSql
  Invoke-Psql $setupSql

  Write-Host "M4 concurrency: parallel same-VIN distinct client ids..."
  Invoke-ParallelSessions $sessionVinA $sessionVinB "Same-VIN race"
  Write-Host "M4 concurrency: assert same-VIN JSON + record counts..."
  Invoke-Psql $verifySameVinSql

  Write-Host "M4 concurrency: PASS"
}
finally {
  if ($cleanupNeeded) {
    Write-Host "M4 concurrency: cleanup ephemeral fixtures..."
    Invoke-Psql $cleanupSql
  }
}
