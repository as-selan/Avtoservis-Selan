#Requires -Version 5.1
<#
.SYNOPSIS
  Safe runner for M4 DB regression (does NOT start Docker; refuses remote targets).

.DESCRIPTION
  Modeled on M3 isolated-target protections. Independently verifies:
  - M4_ISOLATED_TEST_DATABASE_URL (never plain DATABASE_URL / production URLs)
  - Host is loopback
  - URI/host port matches docker-published 5432/tcp HostPort (EXTERNAL only)
  - M4_ISOLATED_PROJECT_REF (required; optional/empty alone is insufficient)
  - M4_ISOLATED_CONTAINER_ID (required disposable container/host identity)
  - assert_isolated_test_target.sql (M4 marker + database + INTERNAL port + ref + container)

  Port layers are distinct: this runner never compares the published host/URI
  port to PostgreSQL inet_server_port(); the SQL gate handles the internal port.

  Does not apply setup_m4_isolated_test_marker.sql (manual operator step).
  This script is prepared for later local execution. Do not run against hosted DBs.
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
$suiteSql = Join-Path $repoRoot "supabase/tests/m4_manual_intake_regression.sql"

function Fail([string]$Message) {
  Write-Error "REFUSING M4 DB TESTS: $Message"
  exit 2
}

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  Fail "Set M4_ISOLATED_TEST_DATABASE_URL to the disposable local Postgres URL (not DATABASE_URL)."
}

if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
  Fail "Set M4_ISOLATED_PROJECT_REF to the disposable local project ref (required; not optional)."
}

if ([string]::IsNullOrWhiteSpace($ContainerId)) {
  Fail "Set M4_ISOLATED_CONTAINER_ID to the disposable Docker container id/name or unique local host label (required)."
}

if ($DatabaseUrl -match '(supabase\.co|pooler\.supabase|aws|azure|neon\.tech|prisma\.io)') {
  Fail "URL looks hosted/remote. Isolated local targets only."
}

try {
  $uri = [Uri]$DatabaseUrl
} catch {
  Fail "M4_ISOLATED_TEST_DATABASE_URL is not a valid URI."
}

$hostName = $uri.Host
if ($hostName -notin @("localhost", "127.0.0.1", "::1")) {
  Fail "Host '$hostName' is not loopback. Refusing non-local targets."
}

if (-not $uri.IsDefaultPort -and $uri.Port -le 0) {
  Fail "URL port is missing or invalid."
}
$urlPort = $uri.Port
if ($urlPort -le 0) {
  Fail "URL must include an explicit local Postgres port for identity checks."
}

$dbName = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart("/"))
if ([string]::IsNullOrWhiteSpace($dbName)) {
  Fail "URL must include a database name path segment."
}

if (-not [string]::IsNullOrWhiteSpace($ExpectedDatabase) -and $ExpectedDatabase -ne $dbName) {
  Fail "M4_ISOLATED_EXPECTED_DATABASE '$ExpectedDatabase' does not match URL database '$dbName'."
}

if (-not (Test-Path $gateSql)) { Fail "Missing gate SQL: $gateSql" }
if (-not (Test-Path $suiteSql)) { Fail "Missing suite SQL: $suiteSql" }

if ([string]::IsNullOrWhiteSpace($Psql)) {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if (-not $cmd) { Fail "psql not found. Set M4_PSQL_PATH or install client tools." }
  $Psql = $cmd.Source
}

# Independently verify the disposable Docker target. Caller GUCs alone are not identity.
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCmd) {
  Fail "docker CLI is required to verify the disposable isolated target (GUC comparison alone is insufficient)."
}
$inspectJson = & docker inspect $ContainerId 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($inspectJson)) {
  Fail "docker inspect failed for container '$ContainerId'."
}
$inspect = $inspectJson | ConvertFrom-Json
$state = $inspect[0].State
if (-not $state.Running) {
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
  Fail "URL host port $urlPort does not match docker published host port $publishedDbPort for container '$ContainerId' (external mapping only; not inet_server_port)."
}
$inspectedId = [string]$inspect[0].Id
$inspectedName = ([string]$inspect[0].Name).TrimStart('/')
if ($ContainerId -ne $inspectedId -and $ContainerId -ne $inspectedName -and -not $inspectedId.StartsWith($ContainerId)) {
  Fail "M4_ISOLATED_CONTAINER_ID '$ContainerId' does not match docker inspect id/name."
}

# Derive project identity from Docker/Supabase metadata (not caller-only).
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
  $envList = @($inspect[0].Config.Env)
  foreach ($entry in $envList) {
    if ($entry -match '^(?:POSTGRES_PASSWORD|PGRST_DB_SCHEMAS)=' ) { continue }
    if ($entry -match '^SUPABASE_PROJECT_ID=(.+)$') {
      $derivedProjectRef = $Matches[1]
      break
    }
  }
}
if ([string]::IsNullOrWhiteSpace($derivedProjectRef)) {
  Fail "Could not derive project identity from docker inspect labels/name/env for container '$ContainerId'."
}
if ($ProjectRef -ne $derivedProjectRef) {
  Fail "Caller M4_ISOLATED_PROJECT_REF '$ProjectRef' does not match docker-derived project identity '$derivedProjectRef'."
}

# Pass docker-verified identities as session GUCs for the SQL marker cross-check.
$env:PGOPTIONS = "-c m4.isolated_project_ref=$derivedProjectRef -c m4.isolated_container_id=$ContainerId"

Write-Host "M4 runner: docker-verified container=$ContainerId published_port=$publishedDbPort db=$dbName project_ref=$derivedProjectRef"
Write-Host "M4 runner: verifying isolated target gate..."
& $Psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $gateSql
if ($LASTEXITCODE -ne 0) { Fail "Isolated-target gate failed." }

Write-Host "M4 runner: executing regression suite (transactional; expects rollback)..."
& $Psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $suiteSql
if ($LASTEXITCODE -ne 0) { Fail "Regression suite failed." }

Write-Host "M4 runner: PASS"
exit 0
