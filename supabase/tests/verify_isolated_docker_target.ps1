# =============================================================================
# Independent Docker identity + host-port gate for the isolated M3 test DB.
#
# PURPOSE
#   Before installing private.avtoservis_isolated_test_marker, prove that host
#   port 55322 is published by the expected isolated container - not by some
#   other Postgres. This check is independent of application_name / DATABASE_URL.
#
# USAGE (read-only; does not install the marker):
#   pwsh -File supabase/tests/verify_isolated_docker_target.ps1
#   pwsh -File supabase/tests/verify_isolated_docker_target.ps1 -ExpectedContainerName supabase_db_avtoservis-selan-m3-review
#
# On mismatch: non-zero exit + throw. Prefer Install-IsolatedTestMarker.ps1,
# which calls this gate and refuses marker install when verification fails.
#
# DO NOT run against production. This script never writes to any database.
# =============================================================================

[CmdletBinding()]
param(
  # Supabase local DB container: supabase_db_<project_id>
  [string]$ExpectedContainerName = "supabase_db_avtoservis-selan-m3-review",
  [int]$ExpectedHostPort = 55322
)

$ErrorActionPreference = "Stop"

function Assert-DockerCli {
  $cmd = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Refusing: docker CLI not found. Cannot verify isolated container identity for port $ExpectedHostPort."
  }
  & docker version --format '{{.Server.Version}}' 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Refusing: docker daemon not reachable. Cannot verify isolated container identity."
  }
}

function Get-ContainerPublishingHostPort {
  param([int]$HostPort)

  # Independent discovery: which running container publishes the host port?
  $rows = & docker ps --format '{{.ID}}|{{.Names}}|{{.Ports}}' 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Refusing: docker ps failed: $($rows | Out-String)"
  }

  $portMatches = @()
  foreach ($row in @($rows)) {
    if ([string]::IsNullOrWhiteSpace($row)) { continue }
    $parts = $row.Split('|', 3)
    if ($parts.Count -lt 3) { continue }
    $id = $parts[0]
    $names = $parts[1]
    $ports = $parts[2]
    # Match host binding ...:55322->... (IPv4/IPv6 / 0.0.0.0 / [::])
    if ($ports -match "(^|[\s,])(\[::\]|0\.0\.0\.0|127\.0\.0\.1|localhost)?:?${HostPort}->") {
      $portMatches += [pscustomobject]@{ Id = $id; Names = $names; Ports = $ports }
    }
  }
  return $portMatches
}

function Assert-PortMappingOnContainer {
  param(
    [string]$ContainerIdOrName,
    [int]$HostPort
  )

  $portLines = & docker port $ContainerIdOrName 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Refusing: docker port failed for '$ContainerIdOrName': $($portLines | Out-String)"
  }

  $ok = $false
  foreach ($line in @($portLines)) {
    # e.g. 5432/tcp -> 0.0.0.0:55322
    if ($line -match "->\s*.*:${HostPort}\s*$") {
      $ok = $true
      break
    }
  }
  if (-not $ok) {
    throw "Refusing: container '$ContainerIdOrName' does not publish host port $HostPort. docker port output:`n$($portLines | Out-String)"
  }
}

Assert-DockerCli

$publishers = @(Get-ContainerPublishingHostPort -HostPort $ExpectedHostPort)
if ($publishers.Count -eq 0) {
  throw "Refusing: no running Docker container publishes host port $ExpectedHostPort. Marker install blocked."
}
if ($publishers.Count -gt 1) {
  $list = ($publishers | ForEach-Object { "$($_.Names) ($($_.Id))" }) -join '; '
  throw "Refusing: multiple containers publish host port $ExpectedHostPort ($list). Marker install blocked."
}

$found = $publishers[0]
$nameList = @($found.Names -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
if ($nameList -notcontains $ExpectedContainerName) {
  throw "Refusing: host port $ExpectedHostPort is published by container name(s) '$($found.Names)' (id $($found.Id)), expected exact name '$ExpectedContainerName'. Marker install blocked."
}

Assert-PortMappingOnContainer -ContainerIdOrName $found.Id -HostPort $ExpectedHostPort

Write-Host "OK: isolated Docker target verified - container '$ExpectedContainerName' (id $($found.Id)) publishes host port $ExpectedHostPort."
exit 0
