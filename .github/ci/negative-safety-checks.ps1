# Local/Windows companion for .github/ci/negative-safety-checks.sh
# Static guards + URL refusal probes (no Docker/DB required for these checks).
$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$WF = Join-Path $RepoRoot ".github/workflows/isolated-db-tests.yml"
$Pass = 0
$Fail = 0

function Pass([string]$Msg) { Write-Host "PASS: $Msg"; $script:Pass++ }
function Fail([string]$Msg) { Write-Host "FAIL: $Msg" -ForegroundColor Red; $script:Fail++ }

Write-Host "== Static workflow guards =="
if (-not (Test-Path $WF)) { throw "Missing $WF" }
$wfText = Get-Content -Raw $WF

if ($wfText -match '\$\{\{\s*secrets\.') { Fail "workflow references GitHub secrets" } else { Pass "workflow does not reference secrets.*" }

$active = @()
foreach ($line in (Get-Content $WF)) {
  $t = $line.Trim()
  if ($t.StartsWith("#") -or [string]::IsNullOrWhiteSpace($t)) { continue }
  if ($t -match '(?i)supabase link|db push|vercel deploy') { $active += $t }
}
if ($active.Count -gt 0) { Fail "workflow contains deploy/link/push: $($active -join ' | ')" }
else { Pass "workflow has no active deploy/link/push commands" }

if ($wfText -match 'cursor/m3-m4-ci-db-tests-v1') { Pass "workflow limited to CI DB-tests branch" }
else { Fail "workflow missing branch restriction" }

if ($wfText -match 'contents:\s*read') { Pass "workflow permissions contents: read" }
else { Fail "workflow missing contents: read" }

$canon = Get-Content -Raw (Join-Path $RepoRoot "supabase/config.toml")
if ($canon -match 'project_id\s*=\s*"avtoservis-selan-m3-review"') {
  Fail "canonical config.toml uses CI project_id"
} else { Pass "canonical config.toml keeps non-CI project_id" }

# Canonical [db] port must not be 55322 (CI-only). Match first port under [db].
if ($canon -match '(?ms)\[db\].*?^port\s*=\s*55322') {
  Fail "canonical config.toml uses CI db port 55322"
} else { Pass "canonical config.toml keeps non-CI db port" }

Write-Host "== CI config patcher (temp copy only) =="
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("avtoservis-ci-cfg-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
$dest = Join-Path $tmp "config.toml"
& node (Join-Path $RepoRoot ".github/ci/patch-ci-config.mjs") (Join-Path $RepoRoot "supabase/config.toml") $dest
if ($LASTEXITCODE -ne 0) { Fail "patch-ci-config failed" }
else {
  $patched = Get-Content -Raw $dest
  if ($patched -match 'project_id\s*=\s*"avtoservis-selan-m3-review"' -and $patched -match 'port\s*=\s*55322') {
    Pass "patch-ci-config writes CI project_id + port 55322 to temp copy"
  } else { Fail "patch-ci-config output missing CI identity" }
}

$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& node (Join-Path $RepoRoot ".github/ci/patch-ci-config.mjs") `
  (Join-Path $RepoRoot "supabase/config.toml") `
  (Join-Path $RepoRoot "supabase/config.toml") 2>$null | Out-Null
$sameExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($sameExit -ne 0) { Pass "patch-ci-config refuses canonical same-path overwrite" }
else { Fail "patch-ci-config allowed same-path overwrite" }

Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue

Write-Host "== Negative URL target probes =="
$ps = (Get-Command powershell).Source

function Invoke-ShouldRefuse([string]$Label, [hashtable]$EnvMap, [string]$ScriptPath, [string[]]$Patterns) {
  $tmpOut = Join-Path ([System.IO.Path]::GetTempPath()) ("neg-" + [guid]::NewGuid().ToString("N") + ".txt")
  $envBackup = @{}
  foreach ($k in $EnvMap.Keys) {
    $envBackup[$k] = [Environment]::GetEnvironmentVariable($k, "Process")
    Set-Item -Path "Env:$k" -Value $EnvMap[$k]
  }
  $code = 0
  try {
    & $ps -NoProfile -File $ScriptPath *> $tmpOut
    $code = $LASTEXITCODE
  } catch {
    $code = 1
    $_ | Out-String | Add-Content $tmpOut
  } finally {
    foreach ($k in $EnvMap.Keys) {
      if ($null -eq $envBackup[$k]) { Remove-Item -Path "Env:$k" -ErrorAction SilentlyContinue }
      else { Set-Item -Path "Env:$k" -Value $envBackup[$k] }
    }
  }
  $text = Get-Content -Raw $tmpOut
  Remove-Item -Force $tmpOut -ErrorAction SilentlyContinue
  $matched = $false
  foreach ($p in $Patterns) {
    if ($text -match $p) { $matched = $true; break }
  }
  if ($code -ne 0 -and $matched) { Pass $Label }
  else {
    Fail "$Label (exit=$code)"
    Write-Host $text
  }
}

Invoke-ShouldRefuse -Label "M3 runner refuses non-loopback host" -EnvMap @{
  DATABASE_URL = "postgresql://postgres:not-a-secret@db.example.com:55322/postgres"
} -ScriptPath (Join-Path $RepoRoot "supabase/tests/run-m3-db-regression.ps1") -Patterns @("loopback", "Refusing")

Invoke-ShouldRefuse -Label "M3 runner refuses wrong external port" -EnvMap @{
  DATABASE_URL = "postgresql://postgres:not-a-secret@127.0.0.1:54322/postgres"
} -ScriptPath (Join-Path $RepoRoot "supabase/tests/run-m3-db-regression.ps1") -Patterns @("55322", "Refusing")

Invoke-ShouldRefuse -Label "M4 runner refuses hosted/remote URL" -EnvMap @{
  M4_ISOLATED_TEST_DATABASE_URL = "postgresql://postgres:not-a-secret@db.supabase.co:5432/postgres"
  M4_ISOLATED_PROJECT_REF = "avtoservis-selan-m3-review"
  M4_ISOLATED_CONTAINER_ID = "supabase_db_avtoservis-selan-m3-review"
} -ScriptPath (Join-Path $RepoRoot "scripts/run-m4-db-regression.ps1") -Patterns @("hosted", "remote", "loopback", "REFUSING")

Write-Host "== Summary: $Pass passed, $Fail failed =="
if ($Fail -ne 0) { exit 1 }
exit 0
