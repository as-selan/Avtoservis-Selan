# =============================================================================
# CI-ONLY bootstrap for private.avtoservis_m4_isolated_test_marker
#
# PURPOSE
#   Install the M4 isolated marker using live Docker + DB identity values.
#   Existing suite runners intentionally never create this marker.
#
# SAFETY
#   * Loopback URL + host port 55322 required
#   * Independent verify_isolated_docker_target.ps1 BEFORE any psql
#   * Marker fields derived from docker inspect + inet_server_port()
#   * Never uses production URLs / secrets
#   * Does not modify setup_m4_isolated_test_marker.sql placeholders in-repo
# =============================================================================

[CmdletBinding()]
param(
  [string]$DatabaseUrl = $env:M4_ISOLATED_TEST_DATABASE_URL,
  [string]$ExpectedContainerName = "supabase_db_avtoservis-selan-m3-review",
  [int]$ExpectedHostPort = 55322,
  [string]$Psql = $(if ($env:M4_PSQL_PATH) { $env:M4_PSQL_PATH } else { "psql" }),
  [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
}
$verifyScript = Join-Path $RepoRoot "supabase/tests/verify_isolated_docker_target.ps1"
if (-not (Test-Path -LiteralPath $verifyScript)) {
  throw "Refusing M4 marker bootstrap: missing $verifyScript"
}

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "Refusing M4 marker bootstrap: set M4_ISOLATED_TEST_DATABASE_URL (loopback :$ExpectedHostPort)."
}

if ($DatabaseUrl -match '(supabase\.co|pooler\.supabase|aws|azure|neon\.tech|prisma\.io)') {
  throw "Refusing M4 marker bootstrap: URL looks hosted/remote."
}

if ($DatabaseUrl -notmatch '^(postgres(ql)?://)([^@]+@)?(?<host>\[[^\]]+\]|[^:/?]+)(:(?<port>\d+))?(/|\?|$)') {
  throw "Refusing M4 marker bootstrap: cannot parse DATABASE URL host/port."
}
$hostName = $Matches['host'].TrimStart('[').TrimEnd(']')
$port = $Matches['port']
$loopback = @('localhost', '127.0.0.1', '::1')
if ($loopback -notcontains $hostName.ToLowerInvariant()) {
  throw "Refusing M4 marker bootstrap: host '$hostName' is not loopback."
}
if ($port -ne "$ExpectedHostPort") {
  throw "Refusing M4 marker bootstrap: URL port '$port', expected $ExpectedHostPort."
}

# Independent Docker identity/port gate BEFORE any psql.
& $verifyScript -ExpectedContainerName $ExpectedContainerName -ExpectedHostPort $ExpectedHostPort
if ($LASTEXITCODE -ne 0) {
  throw "Refusing M4 marker bootstrap: Docker verification failed (exit $LASTEXITCODE)."
}

$inspectJson = & docker inspect $ExpectedContainerName 2>&1
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($inspectJson | Out-String))) {
  throw "Refusing M4 marker bootstrap: docker inspect failed for '$ExpectedContainerName'."
}
$inspect = $inspectJson | ConvertFrom-Json
if (-not $inspect[0].State.Running) {
  throw "Refusing M4 marker bootstrap: container '$ExpectedContainerName' is not running."
}

$containerId = [string]$inspect[0].Id
$containerName = ([string]$inspect[0].Name).TrimStart('/')
$projectRef = $null
$labels = $inspect[0].Config.Labels
if ($null -ne $labels) {
  foreach ($key in @(
      'com.supabase.cli.project-id',
      'com.supabase.project.id',
      'com.docker.compose.project'
    )) {
    if ($labels.PSObject.Properties.Name -contains $key -and -not [string]::IsNullOrWhiteSpace([string]$labels.$key)) {
      $projectRef = [string]$labels.$key
      break
    }
  }
}
if ([string]::IsNullOrWhiteSpace($projectRef) -and $containerName -match '^supabase_db_(.+)$') {
  $projectRef = $Matches[1]
}
if ([string]::IsNullOrWhiteSpace($projectRef)) {
  throw "Refusing M4 marker bootstrap: could not derive project ref from Docker identity."
}
if ($projectRef -ne "avtoservis-selan-m3-review") {
  throw "Refusing M4 marker bootstrap: derived project ref '$projectRef' is not avtoservis-selan-m3-review."
}

# Prefer stable container name for marker + runner GUC identity.
$markerContainerId = $containerName
if ([string]::IsNullOrWhiteSpace($markerContainerId)) {
  $markerContainerId = $containerId
}

$escRef = $projectRef -replace "'", "''"
$escContainer = $markerContainerId -replace "'", "''"

$bootstrapSql = @"
create schema if not exists private;

create table if not exists private.avtoservis_m4_isolated_test_marker (
  singleton boolean primary key default true check (singleton),
  marker text not null,
  expected_database text not null,
  expected_project_ref text not null,
  expected_port integer not null,
  expected_container_id text not null,
  container_or_host_note text,
  installed_at timestamptz not null default now(),
  constraint avtoservis_m4_isolated_test_marker_nonempty
    check (char_length(btrim(marker)) > 0),
  constraint avtoservis_m4_isolated_test_marker_ref_nonempty
    check (char_length(btrim(expected_project_ref)) > 0),
  constraint avtoservis_m4_isolated_test_marker_container_nonempty
    check (char_length(btrim(expected_container_id)) > 0),
  constraint avtoservis_m4_isolated_test_marker_port_positive
    check (expected_port > 0)
);

alter table private.avtoservis_m4_isolated_test_marker
  add column if not exists expected_port integer;
alter table private.avtoservis_m4_isolated_test_marker
  add column if not exists expected_container_id text;

revoke all on table private.avtoservis_m4_isolated_test_marker from public;
revoke all on table private.avtoservis_m4_isolated_test_marker from anon;
revoke all on table private.avtoservis_m4_isolated_test_marker from authenticated;

insert into private.avtoservis_m4_isolated_test_marker as t (
  singleton,
  marker,
  expected_database,
  expected_project_ref,
  expected_port,
  expected_container_id,
  container_or_host_note
) values (
  true,
  'avtoservis-selan-m4-isolated',
  current_database(),
  '$escRef',
  inet_server_port(),
  '$escContainer',
  'CI-only bootstrap on disposable local Docker Supabase; never hosted/prod.'
)
on conflict (singleton) do update
set
  marker = excluded.marker,
  expected_database = excluded.expected_database,
  expected_project_ref = excluded.expected_project_ref,
  expected_port = excluded.expected_port,
  expected_container_id = excluded.expected_container_id,
  container_or_host_note = excluded.container_or_host_note,
  installed_at = now();

do `$`$
declare
  v_ref text;
  v_container text;
  v_port integer;
  v_marker text;
begin
  select marker, expected_project_ref, expected_container_id, expected_port
    into v_marker, v_ref, v_container, v_port
  from private.avtoservis_m4_isolated_test_marker
  where singleton;

  if v_marker is distinct from 'avtoservis-selan-m4-isolated'
     or v_ref is null or v_ref like 'REPLACE_%'
     or v_container is null or v_container like 'REPLACE_%'
     or v_port is null or v_port <= 0 then
    raise exception 'CI M4 marker bootstrap produced invalid marker identity';
  end if;

  raise notice
    'CI M4 marker OK: marker=%, database=%, internal_port=%, project_ref=%, container_id=%',
    v_marker, current_database(), v_port, v_ref, v_container;
end;
`$`$;
"@

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("m4-ci-marker-" + [guid]::NewGuid().ToString("N") + ".sql")
Set-Content -Path $tmp -Value $bootstrapSql -Encoding UTF8
try {
  Write-Host "CI M4 marker bootstrap: applying identity from container='$markerContainerId' project_ref='$projectRef'"
  & $Psql $DatabaseUrl "-v" "ON_ERROR_STOP=1" "-X" "-f" $tmp
  if ($LASTEXITCODE -ne 0) {
    throw "CI M4 marker bootstrap psql failed (exit $LASTEXITCODE)."
  }
}
finally {
  Remove-Item -Force $tmp -ErrorAction SilentlyContinue
}

# Export identities for subsequent suite steps (GitHub Actions GITHUB_ENV aware).
if ($env:GITHUB_ENV) {
  Add-Content -Path $env:GITHUB_ENV -Value "M4_ISOLATED_PROJECT_REF=$projectRef"
  Add-Content -Path $env:GITHUB_ENV -Value "M4_ISOLATED_CONTAINER_ID=$markerContainerId"
  Add-Content -Path $env:GITHUB_ENV -Value "M4_ISOLATED_EXPECTED_DATABASE=postgres"
}

Write-Host "CI M4 marker bootstrap complete."
exit 0
