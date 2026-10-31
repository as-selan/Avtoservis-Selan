# =============================================================================
# Gated manual install of private.avtoservis_isolated_test_marker
#
# SAFETY
#   1) Independently verifies Docker container identity + host port 55322
#      (verify_isolated_docker_target.ps1). On mismatch: REFUSES install.
#   2) Only then applies setup_isolated_test_marker.sql via psql to DATABASE_URL
#      (must be loopback :55322).
#
# USAGE:
#   $env:DATABASE_URL = "postgresql://postgres:...@127.0.0.1:55322/postgres"
#   pwsh -File supabase/tests/Install-IsolatedTestMarker.ps1
#
# Do not bypass this gate with a bare `psql -f setup_isolated_test_marker.sql`
# unless you have already run verify_isolated_docker_target.ps1 successfully.
#
# DO NOT run against production. Does not apply business migrations.
# =============================================================================

[CmdletBinding()]
param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$Psql = "psql",
  [string]$ExpectedContainerName = "supabase_db_avtoservis-selan-m3-review",
  [int]$ExpectedHostPort = 55322
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$verifyScript = Join-Path $here "verify_isolated_docker_target.ps1"
$setupSql = Join-Path $here "setup_isolated_test_marker.sql"

if (-not (Test-Path -LiteralPath $verifyScript)) {
  throw "Refusing install: missing $verifyScript"
}
if (-not (Test-Path -LiteralPath $setupSql)) {
  throw "Refusing install: missing $setupSql"
}

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "Refusing install: set DATABASE_URL or pass -DatabaseUrl (loopback host, port $ExpectedHostPort)."
}

if ($DatabaseUrl -notmatch '^(postgres(ql)?://)([^@]+@)?(?<host>\[[^\]]+\]|[^:/?]+)(:(?<port>\d+))?(/|\?|$)') {
  throw "Refusing install: cannot parse DATABASE_URL host/port."
}
$hostName = $Matches['host'].TrimStart('[').TrimEnd(']')
$port = $Matches['port']
$loopback = @('localhost', '127.0.0.1', '::1')
if ($loopback -notcontains $hostName.ToLowerInvariant()) {
  throw "Refusing install: host '$hostName' is not loopback."
}
if ($port -ne "$ExpectedHostPort") {
  throw "Refusing install: DATABASE_URL port is '$port', expected $ExpectedHostPort."
}

# Gate: independent Docker identity + port mapping. Fail => no SQL applied.
& $verifyScript -ExpectedContainerName $ExpectedContainerName -ExpectedHostPort $ExpectedHostPort
if ($LASTEXITCODE -ne 0) {
  throw "Refusing install: Docker target verification failed (exit $LASTEXITCODE). Marker not installed."
}

Write-Host "Docker gate passed. Applying setup_isolated_test_marker.sql ..."
& $Psql $DatabaseUrl "-v" "ON_ERROR_STOP=1" "-X" "-f" $setupSql
if ($LASTEXITCODE -ne 0) {
  throw "Marker install psql failed (exit $LASTEXITCODE)."
}

Write-Host "Marker install complete on verified isolated target."
exit 0
