# =============================================================================
# M3 safe regression runner — single-session current-owner SQL
#
# TARGET ONLY: isolated Avtoservis Selan local test DB.
# External client port: 55322 (host-mapped). Internal Postgres port may differ
# (e.g. 5432 inside Docker) - do not equate the two.
#
# Supported execution path for m3_service_requests_current_owner_regression.sql.
# Direct `psql -f` lacks this independent Docker identity/port preflight.
#
# Preconditions (all fail-closed; abort with no writes if unmet):
#   * DATABASE_URL host is loopback (localhost / 127.0.0.1 / ::1)
#   * DATABASE_URL external port is 55322
#   * Independent Docker identity + host-port gate (verify_isolated_docker_target.ps1)
#     runs on EVERY run BEFORE any psql connect; fail closed
#   * application_name fingerprint: avtoservis-selan-isolated-m3
#   * DB marker private.avtoservis_isolated_test_marker = avtoservis-selan-m3-isolated
#     (this runner never creates or overwrites the marker)
#
# DO NOT run against production. Does not reset DBs or apply migrations.
#
# Usage:
#   $env:DATABASE_URL = "postgresql://postgres:...@127.0.0.1:55322/postgres"
#   pwsh -File supabase/tests/run-m3-db-regression.ps1
# =============================================================================

[CmdletBinding()]
param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$Psql = "psql",
  [string]$ExpectedContainerName = "supabase_db_avtoservis-selan-m3-review",
  [int]$ExpectedHostPort = 55322
)

$ErrorActionPreference = "Stop"
$AppFingerprint = "avtoservis-selan-isolated-m3"
$DbMarkerValue = "avtoservis-selan-m3-isolated"
$here = $PSScriptRoot
$verifyScript = Join-Path $here "verify_isolated_docker_target.ps1"
$regressionSql = Join-Path $here "m3_service_requests_current_owner_regression.sql"

function Get-ConnectionUrl {
  param([string]$Url)
  if ([string]::IsNullOrWhiteSpace($Url)) {
    throw "Refusing to run: set DATABASE_URL or pass -DatabaseUrl."
  }
  # Strip existing application_name and append fingerprint.
  $trimmed = $Url.Trim()
  if ($trimmed -match '^(?<base>[^?]+)(\?(?<query>.*))?$') {
    $base = $Matches['base']
    $query = $Matches['query']
    $parts = @()
    if ($query) {
      foreach ($pair in $query.Split('&')) {
        if ($pair -and $pair -notmatch '^(?i)application_name=') {
          $parts += $pair
        }
      }
    }
    $parts += "application_name=$AppFingerprint"
    return "$base`?$($parts -join '&')"
  }
  return "$trimmed`?application_name=$AppFingerprint"
}

function Assert-ExternalUrlTarget([string]$Url) {
  # Parse host + external port from URI (not inet_server_port).
  if ($Url -notmatch '^(postgres(ql)?://)([^@]+@)?(?<host>\[[^\]]+\]|[^:/?]+)(:(?<port>\d+))?(/|\?|$)') {
    throw "Refusing to run: cannot parse DATABASE_URL host/port. No changes made."
  }
  $hostName = $Matches['host'].TrimStart('[').TrimEnd(']')
  $port = $Matches['port']
  if (-not $port) {
    throw "Refusing to run: DATABASE_URL must include external port $ExpectedHostPort. No changes made."
  }
  $loopback = @('localhost', '127.0.0.1', '::1')
  if ($loopback -notcontains $hostName.ToLowerInvariant()) {
    throw "Refusing to run: host '$hostName' is not loopback; isolated test DB must be local. No changes made."
  }
  if ($port -ne "$ExpectedHostPort") {
    throw "Refusing to run: external URL port is $port, expected $ExpectedHostPort (host-mapped). Internal Postgres port may differ and is not used as the gate. No changes made."
  }
}

function Assert-IsolatedDockerTarget {
  # Independent of application_name / DB marker. Must run before any psql connect.
  if (-not (Test-Path -LiteralPath $verifyScript)) {
    throw "Refusing to run: missing Docker identity verifier $verifyScript. No changes made."
  }
  & $verifyScript -ExpectedContainerName $ExpectedContainerName -ExpectedHostPort $ExpectedHostPort
  if ($LASTEXITCODE -ne 0) {
    throw "Refusing to run: Docker identity/port verification failed (exit $LASTEXITCODE). Expected container '$ExpectedContainerName' on host port $ExpectedHostPort matching DATABASE_URL. No changes made."
  }
  Write-Host "Docker gate OK: container '$ExpectedContainerName' publishes host port $ExpectedHostPort; DATABASE_URL target matches."
}

function Invoke-Psql {
  param(
    [Parameter(Mandatory = $true)][string]$ConnUrl,
    [Parameter(Mandatory = $true)][string]$Sql
  )
  $out = & $Psql $ConnUrl "-v" "ON_ERROR_STOP=1" "-X" "-q" "-t" "-A" "-c" $Sql 2>&1
  $text = ($out | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed ($LASTEXITCODE): $text"
  }
  return $text
}

function Assert-IsolatedDbMarker {
  param([Parameter(Mandatory = $true)][string]$ConnUrl)

  $marker = Invoke-Psql -ConnUrl $ConnUrl -Sql @"
select case
  when to_regclass('private.avtoservis_isolated_test_marker') is null then 'missing_table'
  when exists (
    select 1 from private.avtoservis_isolated_test_marker
    where marker = '$DbMarkerValue'
  ) then 'ok'
  else 'missing_row'
end;
"@
  if ($marker -eq 'missing_table') {
    throw "Refusing to run: private.avtoservis_isolated_test_marker missing. Install via supabase/tests/Install-IsolatedTestMarker.ps1 (Docker :$ExpectedHostPort gate required) on the isolated local DB only. This runner never creates the marker. No changes made."
  }
  if ($marker -ne 'ok') {
    throw "Refusing to run: DB marker row '$DbMarkerValue' not found. Install via Install-IsolatedTestMarker.ps1. This runner never creates the marker. No changes made."
  }
  Write-Host "DB marker OK: '$DbMarkerValue' present on verified isolated target."
}

# --- Fail closed before any psql connection ---
if (-not (Test-Path -LiteralPath $regressionSql)) {
  throw "Refusing to run: missing regression SQL $regressionSql"
}
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "Refusing to run: set DATABASE_URL or pass -DatabaseUrl (loopback host, port $ExpectedHostPort)."
}

Assert-ExternalUrlTarget -Url $DatabaseUrl
Assert-IsolatedDockerTarget

# --- First psql only after independent URL + Docker verification ---
$connUrl = Get-ConnectionUrl -Url $DatabaseUrl
Assert-IsolatedDbMarker -ConnUrl $connUrl

Write-Host "Running m3_service_requests_current_owner_regression.sql (ON_ERROR_STOP) ..."
& $Psql $connUrl "-v" "ON_ERROR_STOP=1" "-X" "-f" $regressionSql
$psqlExit = $LASTEXITCODE
if ($psqlExit -ne 0) {
  throw "M3 regression psql failed (exit $psqlExit)."
}

Write-Host "M3 current-owner regression completed successfully."
exit 0
