# =============================================================================
# M3 owner-race concurrency (holder session + waiter session + orchestrator)
#
# TARGET ONLY: isolated Avtoservis Selan local test DB.
# External client port: 55322 (host-mapped). Internal Postgres port may differ
# (e.g. 5432 inside Docker) - do not equate the two.
#
# Preconditions (all read-only; abort with no writes if unmet):
#   * DATABASE_URL host is loopback (localhost / 127.0.0.1 / ::1)
#   * DATABASE_URL external port is 55322
#   * Independent Docker identity + host-port gate (verify_isolated_docker_target.ps1)
#     runs on EVERY test run BEFORE any psql connect or fixture write; fail closed
#   * application_name fingerprint: avtoservis-selan-isolated-m3
#   * DB marker private.avtoservis_isolated_test_marker = avtoservis-selan-m3-isolated
#     (independent of application_name; install only after Docker identity +
#      :55322 gate - Install-IsolatedTestMarker.ps1 / verify_isolated_docker_target.ps1.
#      This runner never creates the marker.)
#   * M3 tables present; FOR SHARE lock clause present in prosrc (comments ignored)
#
# DO NOT run against production. Does not reset DBs or apply migrations.
#
# Usage:
#   $env:DATABASE_URL = "postgresql://postgres:...@127.0.0.1:55322/postgres"
#   pwsh -File supabase/tests/m3_service_requests_owner_race.ps1
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
$script:ConnUrl = $null
$script:ActiveJobs = @()
$script:InteractiveSessions = @()
$script:TrackedPids = @()
$script:TrackedApps = @()
$script:FixtureOrg = $null
$script:RunId = $null
$script:Failed = $false
$script:ManualCleanupHints = @()

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
  $verifyScript = Join-Path $PSScriptRoot "verify_isolated_docker_target.ps1"
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
  param([Parameter(Mandatory = $true)][string]$Sql)
  $out = & $Psql $script:ConnUrl "-v" "ON_ERROR_STOP=1" "-X" "-q" "-t" "-A" "-c" $Sql 2>&1
  $text = ($out | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed ($LASTEXITCODE): $Sql`n$text"
  }
  return $text
}

function Assert-Preflight {
  # Fail closed on URL / Docker mismatch before any connection or fixture write.
  Assert-ExternalUrlTarget -Url $DatabaseUrl
  Assert-IsolatedDockerTarget
  $script:ConnUrl = Get-ConnectionUrl -Url $DatabaseUrl

  $meta = Invoke-Psql @"
select
  current_setting('application_name', true) || '|' ||
  coalesce(inet_server_port()::text, 'null') || '|' ||
  current_database();
"@
  $parts = $meta.Split('|')
  $app = $parts[0]
  $internalPort = $parts[1]
  $dbName = $parts[2]
  if ($app -ne $AppFingerprint) {
    throw "Refusing to run: application_name is '$app', expected '$AppFingerprint' (session fingerprint). No changes made."
  }

  $marker = Invoke-Psql @"
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
    throw "Refusing to run: private.avtoservis_isolated_test_marker missing. Install via supabase/tests/Install-IsolatedTestMarker.ps1 (Docker :55322 gate required) on the isolated local DB only. No changes made."
  }
  if ($marker -ne 'ok') {
    throw "Refusing to run: DB marker row '$DbMarkerValue' not found. Install via Install-IsolatedTestMarker.ps1. No changes made."
  }

  Write-Host "Preflight: external URL port $ExpectedHostPort (loopback); internal inet_server_port=$internalPort; database=$dbName; DB marker ok"

  $classesOk = Invoke-Psql @"
select (
  to_regclass('public.customers') is not null
  and to_regclass('public.vehicles') is not null
  and to_regclass('public.service_requests') is not null
)::text;
"@
  if ($classesOk -ne 't' -and $classesOk -ne 'true') {
    throw "Refusing to run: M3 tables missing. No changes made."
  }

  # FOR SHARE must appear in executable prosrc after SQL comment stripping.
  $fnCheck = Invoke-Psql @"
select case
  when p.oid is null then 'missing'
  when regexp_replace(
         regexp_replace(p.prosrc, '--[^\n]*', '', 'g'),
         '/\*([^*]|\*+[^*\/])*\*+/',
         '',
         'ng'
       ) ~* 'for[[:space:]]+share([[:space:]]*;|[[:space:]]*$|[[:space:]]+of[[:space:]])'
    then 'ok'
  else 'no_for_share'
end
from (select 1) s
left join pg_proc p
  on p.proname = 'service_requests_require_current_vehicle_customer'
 and p.pronamespace = (select oid from pg_namespace where nspname = 'private');
"@
  if ($fnCheck -eq 'missing') {
    throw "Refusing to run: current-owner function not installed. No changes made."
  }
  if ($fnCheck -ne 'ok') {
    throw "Refusing to run: FOR SHARE lock clause missing from function body (comments do not count). No changes made."
  }

  Write-Host "Preflight OK (local :55322 URL, app fingerprint, DB marker, M3, FOR SHARE in prosrc)"
}

function Ensure-RunRegistry {
  # Evidence lives in private. Never DROP an existing registry merely because
  # it is empty (including a leftover public.m3_test_run_registry).
  Invoke-Psql @"
create schema if not exists private;
create table if not exists private.m3_test_run_registry (
  run_id text primary key,
  organization_id uuid,
  holder_pid integer,
  waiter_pid integer,
  holder_app text,
  waiter_app text,
  note text,
  created_at timestamptz not null default now()
);
revoke all on table private.m3_test_run_registry from public, anon, authenticated;
"@ | Out-Null

  # Prior failed runs leave registry rows + fixtures. Refuse a new run until
  # the operator inspects/cleans - do not auto-delete evidence.
  $leftoverPrivate = Invoke-Psql @"
select coalesce(
  string_agg(run_id || ':' || coalesce(organization_id::text, '-'), ',' order by created_at),
  ''
)
from private.m3_test_run_registry;
"@
  if (-not [string]::IsNullOrWhiteSpace($leftoverPrivate)) {
    throw "Refusing to run: private.m3_test_run_registry has leftover row(s) from a previous failed/aborted run [$leftoverPrivate]. Inspect fixtures, clean manually, then retry. No changes made."
  }

  $publicState = Invoke-Psql @"
select case
  when to_regclass('public.m3_test_run_registry') is null then 'absent'
  when exists (select 1 from public.m3_test_run_registry) then 'has_rows'
  else 'empty'
end;
"@
  if ($publicState -eq 'has_rows') {
    $leftoverPublic = Invoke-Psql @"
select coalesce(
  string_agg(run_id || ':' || coalesce(organization_id::text, '-'), ',' order by created_at),
  ''
)
from public.m3_test_run_registry;
"@
    throw "Refusing to run: legacy public.m3_test_run_registry still has leftover row(s) [$leftoverPublic]. Inspect/clean manually (table is not auto-dropped). No changes made."
  }
  if ($publicState -eq 'empty') {
    Write-Host "Note: legacy public.m3_test_run_registry exists and is empty; leaving it in place (not dropped)."
  }
}

function Register-RunRow([string]$RunId) {
  Invoke-Psql @"
insert into private.m3_test_run_registry(run_id, note)
values ('$RunId', 'm3 owner-race');
"@ | Out-Null
}

function Update-RunRegistry([string]$Sql) {
  Invoke-Psql $Sql | Out-Null
}

function New-Fixture {
  $sql = @"
with
  o as (
    insert into public.organizations (id, name, slug)
    values (
      gen_random_uuid(),
      'M3 Owner Race',
      'm3-race-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 40)
    )
    returning id
  ),
  ca as (
    insert into public.customers (id, organization_id, display_name, source)
    select gen_random_uuid(), o.id, 'Race Owner A', 'manual' from o
    returning id, organization_id
  ),
  cb as (
    insert into public.customers (id, organization_id, display_name, source)
    select gen_random_uuid(), o.id, 'Race Owner B', 'manual' from o
    returning id
  ),
  v as (
    insert into public.vehicles (id, organization_id, customer_id, registration_current)
    select gen_random_uuid(), ca.organization_id, ca.id, 'M3-RACE' from ca
    returning id, organization_id, customer_id
  ),
  r as (
    insert into public.service_requests (
      id, organization_id, customer_id, vehicle_id, summary, source, status
    )
    select gen_random_uuid(), v.organization_id, null, v.id, 'Race incomplete', 'phone', 'needs_data'
    from v
    returning id
  )
select
  (select id::text from o) || '|' ||
  (select id::text from ca) || '|' ||
  (select id::text from cb) || '|' ||
  (select id::text from v) || '|' ||
  (select id::text from r);
"@
  $parts = (Invoke-Psql $sql).Split('|')
  $script:FixtureOrg = $parts[0]
  if ($script:RunId) {
    Update-RunRegistry "update private.m3_test_run_registry set organization_id = '$($parts[0])' where run_id = '$($script:RunId)';"
  }
  return @{
    Org = $parts[0]; CustA = $parts[1]; CustB = $parts[2]
    Vehicle = $parts[3]; Incomplete = $parts[4]
  }
}

function Remove-FixtureOrgSuccess {
  if ([string]::IsNullOrWhiteSpace($script:FixtureOrg)) { return }
  $org = $script:FixtureOrg
  Invoke-Psql "delete from public.service_requests where organization_id = '$org';"
  Invoke-Psql "delete from public.vehicles where organization_id = '$org';"
  Invoke-Psql "delete from public.customers where organization_id = '$org';"
  Invoke-Psql "delete from public.organizations where id = '$org';"
  $script:FixtureOrg = $null
}

function Start-PsqlJob([string]$Name, [string]$Sql, [string]$Url = $null) {
  $useUrl = if ($Url) { $Url } else { $script:ConnUrl }
  $job = Start-Job -Name $Name -ScriptBlock {
    param($Conn, $PsqlPath, $Query)
    $out = & $PsqlPath $Conn "-v" "ON_ERROR_STOP=1" "-X" "-q" "-t" "-A" "-c" $Query 2>&1
    [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($out | Out-String) }
  } -ArgumentList $useUrl, $Psql, $Sql
  $script:ActiveJobs += $job
  return $job
}

function Wait-JobResult($Job, [int]$TimeoutSec = 45) {
  $done = Wait-Job -Job $Job -Timeout $TimeoutSec
  if (-not $done) {
    throw "Job $($Job.Name) timed out after ${TimeoutSec}s"
  }
  $result = Receive-Job $Job
  Remove-Job $Job -Force
  $script:ActiveJobs = @($script:ActiveJobs | Where-Object { $_.Id -ne $Job.Id })
  return $result
}

function Wait-Until([scriptblock]$Probe, [string]$Label, [int]$TimeoutSec = 20) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    $value = & $Probe
    if ($value) { return $value }
    Start-Sleep -Milliseconds 100
  } while ((Get-Date) -lt $deadline)
  throw "Timeout waiting for $Label"
}

function Test-ExactSqlstate23514([string]$Sql, [string]$Label) {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("m3-sqlstate-" + [guid]::NewGuid().ToString('N') + '.sql')
  @"
do `$`$
begin
  begin
    $Sql;
    raise exception 'FAIL ${Label}: statement succeeded; expected SQLSTATE 23514';
  exception
    when sqlstate '23514' then
      raise notice 'PASS ${Label}: SQLSTATE 23514';
    when others then
      raise exception 'FAIL ${Label}: expected SQLSTATE 23514, got % (%)', sqlstate, sqlerrm;
  end;
end;
`$`$;
"@ | Set-Content -Path $tmp -Encoding UTF8
  try {
    $out = & $Psql $script:ConnUrl "-v" "ON_ERROR_STOP=1" "-X" "-f" $tmp 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "FAIL ${Label}: $($out | Out-String)"
    }
  }
  finally {
    Remove-Item -Force $tmp -ErrorAction Stop
  }
}

function Stop-InteractiveSessions {
  $errors = @()
  foreach ($session in @($script:InteractiveSessions)) {
    if ($null -eq $session -or $null -eq $session.Process) { continue }
    $p = $session.Process
    try {
      if (-not $p.HasExited) {
        $p.StandardInput.WriteLine('ROLLBACK;')
        $p.StandardInput.Flush()
        $p.StandardInput.Close()
        if (-not $p.WaitForExit(5000)) {
          $p.Kill()
        }
      }
    }
    catch {
      $errors += "interactive $($session.App): $($_.Exception.Message)"
    }
  }
  $script:InteractiveSessions = @()
  if ($errors.Count -gt 0) {
    throw ($errors -join '; ')
  }
}

function Stop-ActiveJobsStrict {
  $errors = @()
  foreach ($job in @($script:ActiveJobs)) {
    try {
      if ($job.State -eq 'Running') {
        Stop-Job -Job $job -Force -ErrorAction Stop
      }
      Remove-Job -Job $job -Force -ErrorAction Stop
    }
    catch {
      $errors += "Stop-Job/Remove-Job $($job.Name): $($_.Exception.Message)"
    }
  }
  $script:ActiveJobs = @()
  if ($errors.Count -gt 0) {
    throw ($errors -join '; ')
  }
}

function Stop-TrackedBackendsStrict {
  if ($script:TrackedPids.Count -eq 0) { return }
  $backendPidList = ($script:TrackedPids | Select-Object -Unique) -join ','
  $appFilter = @($script:TrackedApps | Select-Object -Unique)
  if ($appFilter.Count -eq 0) {
    throw "Refusing terminate: tracked pids exist but no tracked application_name values for this run"
  }
  $appSqlList = ($appFilter | ForEach-Object { "'" + ($_ -replace "'", "''") + "'" }) -join ', '
  # Terminate only pids registered for this run and still matching this run's apps.
  $result = Invoke-Psql @"
select coalesce(string_agg(a.pid::text || ':' || a.application_name, ','), '')
from pg_stat_activity a
where a.pid = any(array[$backendPidList]::int[])
  and a.datname = current_database()
  and a.pid <> pg_backend_pid()
  and a.application_name in ($appSqlList);
"@
  if ([string]::IsNullOrWhiteSpace($result)) {
    $script:TrackedPids = @()
    $script:TrackedApps = @()
    return
  }
  $term = Invoke-Psql @"
select coalesce(bool_and(pg_terminate_backend(a.pid)), true)::text
from pg_stat_activity a
where a.pid = any(array[$backendPidList]::int[])
  and a.datname = current_database()
  and a.pid <> pg_backend_pid()
  and a.application_name in ($appSqlList);
"@
  if ($term -ne 't' -and $term -ne 'true') {
    throw "pg_terminate_backend did not confirm success for tracked pids [$backendPidList] (matched: $result)"
  }
  $script:TrackedPids = @()
  $script:TrackedApps = @()
}

function Write-ManualCleanupHints {
  $org = $script:FixtureOrg
  $run = $script:RunId
  $trackedPidText = ($script:TrackedPids -join ',')
  $trackedAppText = ($script:TrackedApps -join ',')
  Write-Host "MANUAL CLEANUP DATA (left in place after failure):" -ForegroundColor Yellow
  Write-Host "  run_id=$run"
  Write-Host "  organization_id=$org"
  Write-Host "  tracked_pids=$trackedPidText"
  Write-Host "  tracked_apps=$trackedAppText"
  Write-Host "  select * from private.m3_test_run_registry where run_id = '$run';"
  if ($org) {
    Write-Host "  delete from public.service_requests where organization_id = '$org';"
    Write-Host "  delete from public.vehicles where organization_id = '$org';"
    Write-Host "  delete from public.customers where organization_id = '$org';"
    Write-Host "  delete from public.organizations where id = '$org';"
  }
  Write-Host "  delete from private.m3_test_run_registry where run_id = '$run';"
}

function Stop-HolderClientProcess {
  param(
    [Parameter(Mandatory = $true)]$Process,
    [string]$Label = 'holder'
  )
  if ($null -eq $Process) { return }
  try {
    if (-not $Process.HasExited) {
      try {
        $Process.StandardInput.WriteLine('ROLLBACK;')
        $Process.StandardInput.Flush()
        $Process.StandardInput.Close()
      }
      catch { }
      if (-not $Process.WaitForExit(3000)) {
        try { $Process.Kill() } catch { }
        [void]$Process.WaitForExit(2000)
      }
    }
  }
  catch {
    try {
      if (-not $Process.HasExited) { $Process.Kill() }
    }
    catch { }
  }
}

function Stop-BackendsByApplicationName {
  param([Parameter(Mandatory = $true)][string]$AppName)
  if ([string]::IsNullOrWhiteSpace($AppName)) { return }
  if ([string]::IsNullOrWhiteSpace($script:ConnUrl)) { return }
  $escaped = $AppName -replace "'", "''"
  try {
    Invoke-Psql @"
select coalesce(bool_and(pg_terminate_backend(a.pid)), true)::text
from pg_stat_activity a
where a.datname = current_database()
  and a.pid <> pg_backend_pid()
  and a.application_name = '$escaped';
"@ | Out-Null
  }
  catch {
    Write-Host "WARN: terminate-by-app '$AppName' failed: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

function Start-HolderSession {
  param(
    [string]$Label,
    [string]$HolderSql,
    [string]$HolderApp
  )

  $pinfo = New-Object System.Diagnostics.ProcessStartInfo
  $pinfo.FileName = $Psql
  $holderUrl = $script:ConnUrl -replace 'application_name=[^&]+', "application_name=$HolderApp"
  $pinfo.Arguments = "`"$holderUrl`" -v ON_ERROR_STOP=1 -X -q -t -A"
  $pinfo.UseShellExecute = $false
  $pinfo.RedirectStandardInput = $true
  $pinfo.RedirectStandardOutput = $true
  $pinfo.RedirectStandardError = $true
  $pinfo.CreateNoWindow = $true

  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $pinfo
  [void]$p.Start()

  # Track from the moment of start so cleanup covers pre-M3HOLD failures.
  $session = @{ Process = $p; Pid = $null; App = $HolderApp }
  $script:InteractiveSessions += $session
  $script:TrackedApps += $HolderApp

  try {
    $p.StandardInput.WriteLine('begin;')
    foreach ($line in ($HolderSql -split "`n")) {
      $trimmed = $line.TrimEnd()
      if ($trimmed.Length -gt 0) {
        $p.StandardInput.WriteLine($trimmed)
      }
    }
    $p.StandardInput.WriteLine("select 'M3HOLD:' || pg_backend_pid()::text;")
    $p.StandardInput.Flush()

    $holderPid = $null
    $deadline = (Get-Date).AddSeconds(20)
    $readTask = $null
    while ((Get-Date) -lt $deadline) {
      if ($p.HasExited) {
        $err = $p.StandardError.ReadToEnd()
        throw "FAIL ${Label}: holder psql exited early (code $($p.ExitCode)): $err"
      }
      if ($null -eq $readTask) {
        $readTask = $p.StandardOutput.ReadLineAsync()
      }
      if ($readTask.Wait(100)) {
        $line = $readTask.Result
        $readTask = $null
        if ($null -eq $line) { continue }
        if ($line -match 'M3HOLD:(\d+)') {
          $holderPid = [int]$Matches[1]
          break
        }
      }
    }
    if (-not $holderPid) {
      throw "FAIL ${Label}: timed out waiting for holder M3HOLD signal (open txn stays uncommitted; sync is client-side stdout)"
    }

    $session.Pid = $holderPid
    $script:TrackedPids += $holderPid
    return $session
  }
  catch {
    # Failed start must not leave a live client or backend behind.
    Stop-HolderClientProcess -Process $p -Label $Label
    Stop-BackendsByApplicationName -AppName $HolderApp
    $script:InteractiveSessions = @(
      $script:InteractiveSessions | Where-Object {
        $null -eq $_.Process -or $_.Process.Id -ne $p.Id
      }
    )
    # Drop this app from tracking if no surviving session still uses it.
    $still = @($script:InteractiveSessions | Where-Object { $_.App -eq $HolderApp })
    if ($still.Count -eq 0) {
      $script:TrackedApps = @($script:TrackedApps | Where-Object { $_ -ne $HolderApp })
    }
    throw
  }
}

function Invoke-LockHoldScenario {
  param(
    [string]$Label,
    [string]$HolderSqlBeforeWait,
    [hashtable]$Fixture,
    [string]$FinalCheckSql,
    [string]$ExpectedFinal,
    [string]$ScopeNote
  )

  $runTag = ([guid]::NewGuid().ToString('N').Substring(0, 12))
  $holderApp = "m3-holder-$runTag"
  $waiterApp = "m3-waiter-$runTag"
  $script:RunId = $runTag
  Register-RunRow -RunId $runTag
  Update-RunRegistry @"
update private.m3_test_run_registry
set organization_id = '$($Fixture.Org)',
    holder_app = '$holderApp',
    waiter_app = '$waiterApp'
where run_id = '$runTag';
"@

  # Holder keeps FOR SHARE in an OPEN transaction; readiness is signaled on stdout
  # (not via an uncommitted UPDATE that other sessions cannot see).
  $holder = Start-HolderSession -Label $Label -HolderApp $holderApp -HolderSql $HolderSqlBeforeWait
  Update-RunRegistry "update private.m3_test_run_registry set holder_pid = $($holder.Pid) where run_id = '$runTag';"

  $waiterUrl = $script:ConnUrl -replace 'application_name=[^&]+', "application_name=$waiterApp"
  $waiterSql = @"
begin;
update public.vehicles
set customer_id = '$($Fixture.CustB)'
where id = '$($Fixture.Vehicle)';
commit;
"@

  $jobB = Start-PsqlJob "$Label-waiter" $waiterSql $waiterUrl

  $waiterPid = Wait-Until -Label "$Label waiter backend" -TimeoutSec 15 -Probe {
    $waiterPidText = Invoke-Psql @"
select coalesce(
  (select pid::text from pg_stat_activity
   where datname = current_database()
     and application_name = '$waiterApp'
     and pid <> pg_backend_pid()
   order by backend_start desc
   limit 1),
  ''
);
"@
    if ($waiterPidText -match '^\d+$') { return [int]$waiterPidText }
    return $null
  }
  $script:TrackedPids += $waiterPid
  $script:TrackedApps += $waiterApp
  Update-RunRegistry "update private.m3_test_run_registry set waiter_pid = $waiterPid where run_id = '$runTag';"

  # Prove waiter is locked AND blocked specifically by the holder pid.
  Wait-Until -Label "$Label pg_blocking_pids contains holder" -TimeoutSec 20 -Probe {
    $ok = Invoke-Psql @"
select (
  exists (
    select 1 from pg_stat_activity a
    where a.pid = $waiterPid
      and a.wait_event_type = 'Lock'
  )
  and ($($holder.Pid) = any(pg_blocking_pids($waiterPid)))
)::text;
"@
    return ($ok -eq 't' -or $ok -eq 'true')
  }

  # Release holder lock by committing the open transaction.
  $holder.Process.StandardInput.WriteLine("commit;")
  $holder.Process.StandardInput.WriteLine("\\q")
  $holder.Process.StandardInput.Flush()
  if (-not $holder.Process.WaitForExit(30000)) {
    throw "FAIL ${Label}: holder did not exit after COMMIT"
  }
  if ($holder.Process.ExitCode -ne 0) {
    $err = $holder.Process.StandardError.ReadToEnd()
    throw "FAIL ${Label}: holder exit $($holder.Process.ExitCode): $err"
  }
  $script:InteractiveSessions = @(
    $script:InteractiveSessions | Where-Object { $_.Pid -ne $holder.Pid }
  )

  $resB = Wait-JobResult $jobB 30
  if ($resB.ExitCode -ne 0) {
    throw "FAIL ${Label} waiter: $($resB.Output)"
  }

  $final = Invoke-Psql $FinalCheckSql
  if ($final -ne $ExpectedFinal) {
    throw "FAIL ${Label}: expected final '$ExpectedFinal', got '$final'"
  }

  Write-Host "PASS $Label (wait_event Lock + pg_blocking_pids(@holder); $ScopeNote)"
  Invoke-Psql "delete from private.m3_test_run_registry where run_id = '$runTag';" | Out-Null
  $script:RunId = $null
  $script:TrackedPids = @()
  $script:TrackedApps = @()
}

try {
  Assert-Preflight
  Ensure-RunRegistry

  # C1 -----------------------------------------------------------------
  Write-Host "`n=== C1: owner change first, then stale INSERT (SQLSTATE 23514) ==="
  $f = New-Fixture
  Invoke-Psql "update public.vehicles set customer_id = '$($f.CustB)' where id = '$($f.Vehicle)';" | Out-Null
  Test-ExactSqlstate23514 -Label 'C1' -Sql @"
insert into public.service_requests (
  organization_id, customer_id, vehicle_id, summary, source
) values (
  '$($f.Org)', '$($f.CustA)', '$($f.Vehicle)', 'C1 stale after transfer', 'manual'
)
"@
  Write-Host "PASS C1"
  Remove-FixtureOrgSuccess

  # C2 -----------------------------------------------------------------
  Write-Host "`n=== C2: INSERT holds FOR SHARE; owner UPDATE blocked by holder ==="
  $f = New-Fixture
  Invoke-LockHoldScenario -Label 'C2' -Fixture $f -ScopeNote 'client-side hold sync; final state is secondary' -HolderSqlBeforeWait @"
insert into public.service_requests (
  organization_id, customer_id, vehicle_id, summary, source
) values (
  '$($f.Org)', '$($f.CustA)', '$($f.Vehicle)', 'C2 insert first', 'manual'
);
"@ -FinalCheckSql @"
select
  (select customer_id::text from public.service_requests
   where organization_id = '$($f.Org)' and summary = 'C2 insert first') || '|' ||
  (select customer_id::text from public.vehicles where id = '$($f.Vehicle)');
"@ -ExpectedFinal "$($f.CustA)|$($f.CustB)"
  Remove-FixtureOrgSuccess

  # C3a ----------------------------------------------------------------
  Write-Host "`n=== C3a: M4 UPDATE-attach holds lock; owner UPDATE blocked (ordinary scenario) ==="
  $f = New-Fixture
  Invoke-LockHoldScenario -Label 'C3a' -Fixture $f `
    -ScopeNote 'ordinary M4 attach-vs-transfer only - not a universal deadlock guarantee' `
    -HolderSqlBeforeWait @"
update public.service_requests
set customer_id = '$($f.CustA)'
where id = '$($f.Incomplete)';
"@ -FinalCheckSql @"
select
  (select customer_id::text from public.service_requests where id = '$($f.Incomplete)') || '|' ||
  (select customer_id::text from public.vehicles where id = '$($f.Vehicle)');
"@ -ExpectedFinal "$($f.CustA)|$($f.CustB)"
  Remove-FixtureOrgSuccess

  # C3b ----------------------------------------------------------------
  Write-Host "`n=== C3b: owner transfer first, then stale UPDATE attach (SQLSTATE 23514) ==="
  $f = New-Fixture
  Invoke-Psql "update public.vehicles set customer_id = '$($f.CustB)' where id = '$($f.Vehicle)';" | Out-Null
  Test-ExactSqlstate23514 -Label 'C3b' -Sql @"
update public.service_requests
set customer_id = '$($f.CustA)'
where id = '$($f.Incomplete)'
"@
  Write-Host "PASS C3b"
  Remove-FixtureOrgSuccess

  # C4 -----------------------------------------------------------------
  Write-Host "`n=== C4: concurrent FOR SHARE checkers (interactive overlap) ==="
  $f = New-Fixture
  $runTag = ([guid]::NewGuid().ToString('N').Substring(0, 12))
  $app1 = "m3-c4-a-$runTag"
  $app2 = "m3-c4-b-$runTag"
  $script:RunId = $runTag
  # Register before interactive sessions so failure leaves enough evidence for
  # manual cleanup (registry row + fixture org + tracked apps/pids).
  Register-RunRow -RunId $runTag
  Update-RunRegistry @"
update private.m3_test_run_registry
set organization_id = '$($f.Org)',
    holder_app = '$app1',
    waiter_app = '$app2',
    note = 'm3 owner-race C4'
where run_id = '$runTag';
"@

  # Two interactive sessions: each acquires FOR SHARE, signals M3HOLD, stays open.
  $session1 = Start-HolderSession -Label 'C4-a' -HolderApp $app1 -HolderSql @"
insert into public.service_requests (
  organization_id, customer_id, vehicle_id, summary, source
) values (
  '$($f.Org)', '$($f.CustA)', '$($f.Vehicle)', 'C4 concurrent 1', 'manual'
);
"@
  Update-RunRegistry "update private.m3_test_run_registry set holder_pid = $($session1.Pid) where run_id = '$runTag';"
  $session2 = Start-HolderSession -Label 'C4-b' -HolderApp $app2 -HolderSql @"
insert into public.service_requests (
  organization_id, customer_id, vehicle_id, summary, source
) values (
  '$($f.Org)', '$($f.CustA)', '$($f.Vehicle)', 'C4 concurrent 2', 'manual'
);
"@
  Update-RunRegistry "update private.m3_test_run_registry set waiter_pid = $($session2.Pid) where run_id = '$runTag';"

  # Both already tracked at M3HOLD time. Prove simultaneous open txns.
  $overlap = Invoke-Psql @"
select (
  exists (
    select 1 from pg_stat_activity a
    where a.pid = $($session1.Pid)
      and a.application_name = '$app1'
      and a.state = 'idle in transaction'
  )
  and exists (
    select 1 from pg_stat_activity a
    where a.pid = $($session2.Pid)
      and a.application_name = '$app2'
      and a.state = 'idle in transaction'
  )
)::text;
"@
  if ($overlap -ne 't' -and $overlap -ne 'true') {
    throw 'FAIL C4: both interactive sessions must be idle in transaction while holding FOR SHARE'
  }

  foreach ($session in @($session1, $session2)) {
    $session.Process.StandardInput.WriteLine('commit;')
    $session.Process.StandardInput.WriteLine('\q')
    $session.Process.StandardInput.Flush()
    if (-not $session.Process.WaitForExit(30000)) {
      throw "FAIL C4: session $($session.App) did not exit after COMMIT"
    }
    if ($session.Process.ExitCode -ne 0) {
      $err = $session.Process.StandardError.ReadToEnd()
      throw "FAIL C4: session $($session.App) exit $($session.Process.ExitCode): $err"
    }
  }
  $script:InteractiveSessions = @(
    $script:InteractiveSessions | Where-Object {
      $_.Pid -ne $session1.Pid -and $_.Pid -ne $session2.Pid
    }
  )

  $count = Invoke-Psql @"
select count(*)::text from public.service_requests
where organization_id = '$($f.Org)' and summary like 'C4 concurrent%';
"@
  if ($count -ne '2') { throw "FAIL C4: expected 2 rows, got $count" }
  Write-Host "PASS C4 (both FOR SHARE holds overlapped in open txns; both commits OK)"
  # Success: clean only this run's registry row + its fixtures.
  Invoke-Psql "delete from private.m3_test_run_registry where run_id = '$runTag';" | Out-Null
  $script:RunId = $null
  Remove-FixtureOrgSuccess
  $script:TrackedPids = @()
  $script:TrackedApps = @()

  Write-Host "`nAll concurrency scenarios passed (C1 C2 C3a C3b C4)."
}
catch {
  $script:Failed = $true
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-ManualCleanupHints
  throw
}
finally {
  $cleanupErrors = @()
  try { Stop-InteractiveSessions } catch { $cleanupErrors += "interactive: $($_.Exception.Message)" }
  try { Stop-ActiveJobsStrict } catch { $cleanupErrors += "jobs: $($_.Exception.Message)" }
  try { Stop-TrackedBackendsStrict } catch { $cleanupErrors += "terminate: $($_.Exception.Message)" }

  if (-not $script:Failed) {
    try {
      if ($script:FixtureOrg) { Remove-FixtureOrgSuccess }
      if ($script:RunId) {
        Invoke-Psql "delete from private.m3_test_run_registry where run_id = '$($script:RunId)';" | Out-Null
      }
      # Intentionally do not DROP m3_test_run_registry (private or legacy public)
      # merely because it is empty - keep evidence schema durable across runs.
    }
    catch {
      $cleanupErrors += "success-cleanup: $($_.Exception.Message)"
    }
  }
  else {
    # On failure keep fixtures + registry row for manual cleanup.
    Write-Host "Failure path: fixture/registry left for manual cleanup (see hints above)." -ForegroundColor Yellow
  }

  if ($cleanupErrors.Count -gt 0) {
    Write-Host "CLEANUP ERRORS (not swallowed):" -ForegroundColor Red
    $cleanupErrors | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    if (-not $script:Failed) {
      throw "Cleanup failed: $($cleanupErrors -join '; ')"
    }
  }
}
