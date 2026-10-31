[CmdletBinding()]
param([switch]$Preflight, [switch]$RunTests)
if($PSVersionTable.PSVersion -lt [version]'7.2') { throw 'PowerShell 7.2 or newer is required (pwsh).' }
$ErrorActionPreference='Stop'
$id='avtoservis-selan-manual-pr18'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$homeDir=Join-Path $env:LOCALAPPDATA 'AvtoservisSelan\manual-pr18'
$ports=@(3000,47862,55420,55421,55422,55423,55424,55427,55429)
$expectedMigrations=@(
'20260912181715_secure_foundation_slice_a.sql',
'20260928173816_20260913174315_customers.sql',
'20260928175048_20260913174349_vehicles.sql',
'20260928175103_20260913174900_service_requests.sql',
'20260928175120_20260913214500_create_manual_service_request_intake.sql',
'20260928175203_20260914003000_appointments_foundation.sql',
'20260928175302_20260914024500_create_web_service_request_intake.sql',
'20260928175317_20260914033000_create_service_request_completion_links.sql',
'20260928175331_20260917100000_create_offer_preparations.sql',
'20260928175548_20260919140000_create_offer_review_customer_approval.sql',
'20260928175600_20260926120000_quibi_read_links.sql',
'20260928175615_20260927085839_manual_quibi_estimate_v1.sql',
'20260928175644_20260927101529_preliminary_inspection_v1.sql',
'20260928175656_20260927102728_manual_slot_offer_v1.sql',
'20260928175707_20260928163011_protect_public_web_intake_v1.sql',
'20260928183213_quibi_vehicle_links.sql'
)
function CheckExit($name) { if($LASTEXITCODE -ne 0) { throw "$name failed ($LASTEXITCODE)" } }
foreach($tool in @('docker','node','npm','npx')) { if(-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Missing $tool" } }
& docker version --format '{{.Server.Version}}' | Out-Null; CheckExit 'Docker'
foreach($name in @('SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','PRODUCTION_DB_PASSWORD','DATABASE_URL','DIRECT_URL','POSTGRES_URL')) {
  if([Environment]::GetEnvironmentVariable($name)) { throw "Remote DB environment variable present: $name" }
}
if(Get-ChildItem -LiteralPath $repo -Force -File -Filter '.env*' | Where-Object Name -ne '.env.example') { throw 'Unexpected .env file in repo.' }
$names=@(& docker ps -a --format '{{.Names}}'); CheckExit 'docker ps'
if($names | Where-Object { $_ -like "supabase_*_$id" }) { throw "Project $id already has containers." }
$busy=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $ports -contains $_.LocalPort } | Select-Object -ExpandProperty LocalPort -Unique)
if($busy.Count) { throw "Ports in use: $($busy -join ','). If 3000 is occupied, adapt app and E2E origins together." }
$migrations=@(Get-ChildItem (Join-Path $repo 'supabase\migrations') -Filter '*.sql' -File | Sort-Object Name)
if(Compare-Object -ReferenceObject ($expectedMigrations | Sort-Object) -DifferenceObject @($migrations | Select-Object -ExpandProperty Name)) { throw 'Unexpected PR #18 migration chain.' }
Write-Host "Preflight OK: $id; ports $($ports -join ','); 16 migrations."
if($Preflight) { return }
if(Test-Path -LiteralPath $homeDir) { throw "Refusing to overwrite $homeDir" }
$target=Join-Path $homeDir 'supabase\migrations'
New-Item -ItemType Directory -Path $target -Force | Out-Null
$config=Get-Content (Join-Path $repo 'supabase\config.toml') -Raw
$config=$config -replace '(?m)^project_id\s*=.*$', 'project_id = "avtoservis-selan-manual-pr18"'
$section='root'; $seen=@{}
$values=@{'api.port'='55421';'db.port'='55422';'db.shadow_port'='55420';'db.pooler.port'='55429';'studio.port'='55423';'local_smtp.port'='55424';'analytics.port'='55427';'db.seed.enabled'='false';'auth.site_url'='"http://127.0.0.1:3000"';'auth.additional_redirect_urls'='["http://127.0.0.1:3000/auth/accept-invite"]'}
$lines=foreach($line in ($config -split '\r?\n')) {
  if($line -match '^\[([^\]]+)\]') { $section=$Matches[1] }
  if($line -match '^\s*([A-Za-z_]+)\s*=') { $key="$section.$($Matches[1])"; if($values.ContainsKey($key)) { $seen[$key]=$true; "$($Matches[1]) = $($values[$key])"; continue } }
  $line
}
foreach($key in $values.Keys) { if(-not $seen[$key]) { throw "Missing config key: $key" } }
Set-Content -LiteralPath (Join-Path $homeDir 'supabase\config.toml') -Value $lines -Encoding utf8
foreach($file in $migrations) { Copy-Item -LiteralPath $file.FullName -Destination $target }
$manifestPath=Join-Path $homeDir 'runtime.json'
@{projectId=$id;repo=$repo;fixturePid=0;appPid=0} | ConvertTo-Json | Set-Content $manifestPath
Push-Location $homeDir
try {
  & npx --yes supabase@2.118.0 start --exclude studio --exclude logflare --exclude vector --exclude imgproxy --exclude mailpit; CheckExit 'Supabase start'
  $running=@(& docker ps --format '{{.Names}}'); CheckExit 'docker ps'
  if($running -notcontains "supabase_db_$id") { throw 'QA database container absent.' }
  $port=@(& docker port "supabase_db_$id"); CheckExit 'docker port'
  if(-not ($port | Where-Object { $_ -match ':55422$' })) { throw 'QA DB port mismatch.' }
  & npx --yes supabase@2.118.0 migration up; CheckExit 'Migration up'
  $status=& npx --yes supabase@2.118.0 status -o json | ConvertFrom-Json -AsHashtable; CheckExit 'Supabase status'
} finally { Pop-Location }
$api=[uri]$status.API_URL
if($api.Scheme -ne 'http' -or $api.Host -notin @('127.0.0.1','localhost') -or $api.Port -ne 55421) { throw 'Non-loopback Supabase URL.' }
$env:CI='true';$env:SELAN_ISOLATED_E2E='1'
$env:E2E_API_URL=$api.AbsoluteUri.TrimEnd('/')
$env:E2E_SERVICE_ROLE_KEY=$status.SERVICE_ROLE_KEY
$env:NEXT_PUBLIC_SUPABASE_URL=$env:E2E_API_URL
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$status.ANON_KEY
$env:E2E_PASSWORD=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
$env:E2E_FIXTURES_PATH=Join-Path $homeDir 'fixtures.json'

Push-Location $repo
try { & npm ci; CheckExit 'npm ci' } finally { Pop-Location }
& node (Join-Path $repo 'scripts\e2e\seed-isolated.mjs'); CheckExit 'Synthetic seed'
$env:SUPABASE_SERVICE_ROLE_KEY=$env:E2E_SERVICE_ROLE_KEY
Remove-Item Env:E2E_SERVICE_ROLE_KEY
$env:QUIBI_DEV_USERNAME='isolated-e2e';$env:QUIBI_DEV_PASSWORD=$env:E2E_PASSWORD
$env:QUIBI_E2E_ORIGIN='http://127.0.0.1:47862'
$env:COMPLETION_PUBLIC_ORIGIN='http://127.0.0.1:3000'
$env:PUBLIC_APP_ORIGIN='http://127.0.0.1:3000'
$fixture=Start-Process -FilePath (Get-Command node).Source -ArgumentList @((Join-Path $repo 'scripts\e2e\quibi-fixture.mjs')) -WorkingDirectory $repo -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $homeDir 'quibi.out.log') -RedirectStandardError (Join-Path $homeDir 'quibi.err.log')
$manifest=Get-Content $manifestPath -Raw | ConvertFrom-Json
$manifest.fixturePid=$fixture.Id;$manifest | ConvertTo-Json | Set-Content $manifestPath
$testFailed=$false
Push-Location $repo
try {
  & npm run build; CheckExit 'Next build'
  if($RunTests) { & npm run test:e2e; if($LASTEXITCODE -ne 0) { $testFailed=$true; Write-Warning "Playwright failed; QA remains available for diagnosis." } }
} finally { Pop-Location }
Invoke-RestMethod -Uri 'http://127.0.0.1:47862/__control?mode=normal' -Method Post | Out-Null
$env:SELAN_MANUAL_QA='1'; $env:SELAN_MANUAL_SEED='1'
$env:E2E_SERVICE_ROLE_KEY=$status.SERVICE_ROLE_KEY
$env:E2E_FIXTURES_PATH=Join-Path $homeDir 'manual-fixtures.json'
& node (Join-Path $repo 'scripts\e2e\seed-isolated.mjs'); CheckExit 'Fresh manual seed'
$manualSeed=Get-Content $env:E2E_FIXTURES_PATH -Raw | ConvertFrom-Json
if($manualSeed.owner -ne 'selan-manual-owner@example.test') { throw 'Manual owner fixture mismatch.' }
[pscredential]::new($manualSeed.owner,(ConvertTo-SecureString $env:E2E_PASSWORD -AsPlainText -Force)) | Export-Clixml (Join-Path $homeDir 'owner.credential.xml')
Remove-Item Env:E2E_SERVICE_ROLE_KEY; Remove-Item Env:SELAN_MANUAL_SEED
$app=Start-Process -FilePath (Get-Command node).Source -ArgumentList @((Join-Path $repo 'node_modules\next\dist\bin\next'),'start','--hostname','127.0.0.1','--port','3000') -WorkingDirectory $repo -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $homeDir 'app.out.log') -RedirectStandardError (Join-Path $homeDir 'app.err.log')
$manifest.appPid=$app.Id;$manifest | ConvertTo-Json | Set-Content $manifestPath
Start-Sleep -Seconds 3
Invoke-WebRequest 'http://127.0.0.1:3000/login' -UseBasicParsing | Out-Null
Write-Host 'Ready: http://127.0.0.1:3000/login'
Write-Host "Owner credential (DPAPI): $homeDir\owner.credential.xml"
Write-Host 'The stack remains running. Use Stop-ManualQa.ps1 to stop only this project.'
if($testFailed) { throw 'Playwright failed; the isolated app remains running for diagnosis.' }
