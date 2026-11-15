[CmdletBinding()]
param([switch]$Preflight, [switch]$RunTests)
if ($PSVersionTable.PSVersion -lt [version]'7.2') { throw 'PowerShell 7.2+ is required.' }
if ($Preflight -eq $RunTests) { throw 'Choose exactly one of -Preflight or -RunTests.' }
$ErrorActionPreference = 'Stop'
$id = 'avtoservis-selan-e2e-retry-pr18'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$root = Join-Path $env:LOCALAPPDATA 'AvtoservisSelan\e2e-retry-pr18'
$source = Join-Path $root 'source'
$ports = @(3001,47962,55520,55521,55522,55523,55524,55527,55529)
function CheckExit($name) { if ($LASTEXITCODE -ne 0) { throw "$name failed ($LASTEXITCODE)" } }
foreach ($tool in @('git','docker','node','npm','npx')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Missing $tool" }
}
& docker version --format '{{.Server.Version}}' | Out-Null; CheckExit 'Docker'
foreach ($name in @('SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','PRODUCTION_DB_PASSWORD','DATABASE_URL','DIRECT_URL','POSTGRES_URL')) {
  if ([Environment]::GetEnvironmentVariable($name)) { throw "Remote database variable present: $name" }
}
if (Get-ChildItem -LiteralPath $repo -Force -File -Filter '.env*' | Where-Object Name -ne '.env.example') {
  throw 'Unexpected repository .env file.'
}
if (Test-Path -LiteralPath $root) { throw "Retry directory already exists: $root. Inspect it; never overwrite a partial run." }
$existing = @(& docker ps -a --format '{{.Names}}'); CheckExit 'docker ps'
if ($existing | Where-Object { $_ -like "supabase_*_$id" }) { throw "Retry project containers already exist: $id" }
$busy = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $ports -contains $_.LocalPort } | Select-Object -ExpandProperty LocalPort -Unique)
if ($busy.Count) { throw "Retry ports occupied: $($busy -join ',')" }
$migrations = @(Get-ChildItem (Join-Path $repo 'supabase\migrations') -Filter '*.sql' -File | Sort-Object Name)
if ($migrations.Count -ne 16) { throw "Expected 16 migrations, found $($migrations.Count)" }
if (-not (Test-Path (Join-Path $repo 'playwright.local-qa.config.ts'))) { throw 'Local QA Playwright config missing.' }
if (-not (Test-Path 'C:\Program Files\Google\Chrome\Application\chrome.exe')) { throw 'Installed Chrome missing.' }
Write-Host "Preflight OK: $id, 16 migrations, Chrome, free ports $($ports -join ',')"
if ($Preflight) { return }

# Copy only Git-tracked source plus the new local QA config. The live manual app's .next is never rebuilt.
New-Item -ItemType Directory -Path $source -Force | Out-Null
$tracked = @(& git -c "safe.directory=$($repo.Replace('\','/'))" -C $repo ls-files); CheckExit 'git ls-files'
foreach ($relative in ($tracked + @('playwright.local-qa.config.ts') | Select-Object -Unique)) {
  $from = Join-Path $repo $relative
  $to = Join-Path $source $relative
  if (-not (Test-Path -LiteralPath $from -PathType Leaf)) { throw "Missing source file: $relative" }
  New-Item -ItemType Directory -Path (Split-Path $to -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $from -Destination $to
}
$target = Join-Path $root 'supabase\migrations'
New-Item -ItemType Directory -Path $target -Force | Out-Null
$config = Get-Content (Join-Path $repo 'supabase\config.toml') -Raw
$config = $config -replace '(?m)^project_id\s*=.*$', 'project_id = "avtoservis-selan-e2e-retry-pr18"'
$section = 'root'; $seen = @{}
$values = @{
  'api.port'='55521'; 'db.port'='55522'; 'db.shadow_port'='55520';
  'db.pooler.port'='55529'; 'studio.port'='55523'; 'local_smtp.port'='55524';
  'analytics.port'='55527'; 'db.seed.enabled'='false';
  'auth.site_url'='"http://127.0.0.1:3001"';
  'auth.additional_redirect_urls'='["http://127.0.0.1:3001/auth/accept-invite"]'
}
$lines = foreach ($line in ($config -split '\r?\n')) {
  if ($line -match '^\[([^\]]+)\]') { $section = $Matches[1] }
  if ($line -match '^\s*([A-Za-z_]+)\s*=') {
    $key = "$section.$($Matches[1])"
    if ($values.ContainsKey($key)) { $seen[$key] = $true; "$($Matches[1]) = $($values[$key])"; continue }
  }
  $line
}
foreach ($key in $values.Keys) { if (-not $seen[$key]) { throw "Missing config key: $key" } }
Set-Content -LiteralPath (Join-Path $root 'supabase\config.toml') -Value $lines -Encoding utf8
foreach ($file in $migrations) { Copy-Item -LiteralPath $file.FullName -Destination $target }

Push-Location $root
try {
  & npx --yes supabase@2.118.0 start --exclude studio --exclude logflare --exclude vector --exclude imgproxy --exclude mailpit; CheckExit 'Retry Supabase start'
  $running = @(& docker ps --format '{{.Names}}'); CheckExit 'docker ps'
  if ($running -notcontains "supabase_db_$id") { throw 'Retry database container absent.' }
  $published = @(& docker port "supabase_db_$id"); CheckExit 'docker port'
  if (-not ($published | Where-Object { $_ -match ':55522$' })) { throw 'Retry database port mismatch.' }
  & npx --yes supabase@2.118.0 migration up; CheckExit 'Retry migrations'
  $status = & npx --yes supabase@2.118.0 status -o json | ConvertFrom-Json -AsHashtable; CheckExit 'Retry Supabase status'
} finally { Pop-Location }
$api = [uri]$status.API_URL
if ($api.Scheme -ne 'http' -or $api.Host -notin @('127.0.0.1','localhost') -or $api.Port -ne 55521) { throw 'Unexpected Supabase API target.' }
$env:CI='true'; $env:SELAN_ISOLATED_E2E='1'
$env:E2E_API_URL=$api.AbsoluteUri.TrimEnd('/')
$env:E2E_SERVICE_ROLE_KEY=$status.SERVICE_ROLE_KEY
$env:NEXT_PUBLIC_SUPABASE_URL=$env:E2E_API_URL
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$status.ANON_KEY
$env:E2E_PASSWORD=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
$env:E2E_FIXTURES_PATH=Join-Path $root 'fixtures.json'
$env:SELAN_E2E_APP_ORIGIN='http://127.0.0.1:3001'
$env:SELAN_E2E_FIXTURE_ORIGIN='http://127.0.0.1:47962'
$env:SELAN_E2E_FIXTURE_PORT='47962'
Push-Location $source
try { & npm ci; CheckExit 'Retry npm ci'; & node scripts/e2e/seed-isolated.mjs; CheckExit 'Retry synthetic seed' }
finally { Pop-Location }
$env:SUPABASE_SERVICE_ROLE_KEY=$env:E2E_SERVICE_ROLE_KEY
Remove-Item Env:E2E_SERVICE_ROLE_KEY
$env:QUIBI_DEV_USERNAME='isolated-e2e'; $env:QUIBI_DEV_PASSWORD=$env:E2E_PASSWORD
$env:QUIBI_E2E_ORIGIN=$env:SELAN_E2E_FIXTURE_ORIGIN
$env:COMPLETION_PUBLIC_ORIGIN=$env:SELAN_E2E_APP_ORIGIN
$env:PUBLIC_APP_ORIGIN=$env:SELAN_E2E_APP_ORIGIN
$fixture = Start-Process -FilePath (Get-Command node).Source -ArgumentList @((Join-Path $source 'scripts\e2e\quibi-fixture.mjs')) -WorkingDirectory $source -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'quibi.out.log') -RedirectStandardError (Join-Path $root 'quibi.err.log')
try {
  Push-Location $source
  try {
    & npm run build; CheckExit 'Retry build'
    & npx playwright test --config playwright.local-qa.config.ts; CheckExit 'Retry desktop/mobile Playwright'
  } finally { Pop-Location }
} finally {
  if (-not $fixture.HasExited) { Stop-Process -Id $fixture.Id -ErrorAction Stop }
}
Write-Host 'Isolated retry completed. Manual project on 3000/55421 was untouched.'
Write-Host "Retry database remains under $root; inspect before any project-scoped stop."
