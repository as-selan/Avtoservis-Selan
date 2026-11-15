[CmdletBinding()]
param([switch]$Partial)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion -lt [version]'7.2') { throw 'PowerShell 7.2 or newer is required (pwsh).' }
$id='avtoservis-selan-manual-pr18'
$dbName="supabase_db_$id"
$homeDir=Join-Path $env:LOCALAPPDATA 'AvtoservisSelan\manual-pr18'
$manifestPath=Join-Path $homeDir 'runtime.json'
$configPath=Join-Path $homeDir 'supabase\config.toml'
if(-not (Test-Path -LiteralPath $manifestPath) -or -not (Test-Path -LiteralPath $configPath)) { throw 'QA manifest or config missing; nothing stopped.' }
$manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if($manifest.projectId -ne $id) { throw 'QA manifest project ID mismatch.' }
$config=Get-Content -LiteralPath $configPath -Raw
if($config -notmatch '(?m)^project_id\s*=\s*"avtoservis-selan-manual-pr18"\s*$' -or $config -notmatch '(?m)^port\s*=\s*55422\s*$') {
  throw 'QA config identity or database port mismatch.'
}
$allNames=@(& docker ps -a --format '{{.Names}}')
if($LASTEXITCODE -ne 0) { throw 'Cannot inspect Docker; nothing stopped.' }
$qaNames=@($allNames | Where-Object { $_ -like "supabase_*_$id" })
if($qaNames.Count -and $qaNames -notcontains $dbName -and -not $Partial) { throw 'Partial QA containers have no expected DB. Inspect them, then use -Partial to stop only this project.' }
if($qaNames -contains $dbName) {
  $mapping=@(& docker port $dbName '5432/tcp')
  if($LASTEXITCODE -ne 0 -or -not ($mapping | Where-Object { $_ -match ':55422$' })) {
    throw "The exact QA DB container does not publish port 55422; nothing stopped."
  }
}
$verified=@()
foreach($entry in @(@{pid=$manifest.appPid;name='app'},@{pid=$manifest.fixturePid;name='fixture'})) {
  if($entry.pid -le 0) { continue }
  $process=Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.pid)" -ErrorAction SilentlyContinue
  if(-not $process) { continue }
  $expected=if($entry.name -eq 'app') { 'node_modules\next\dist\bin\next' } else { 'scripts\e2e\quibi-fixture.mjs' }
  if($process.Name -notmatch '^node(\.exe)?$' -or $process.CommandLine -notlike "*$expected*") {
    throw "PID $($entry.pid) is not the expected QA $($entry.name) process; nothing stopped."
  }
  $verified += $entry.pid
}
foreach($pidValue in $verified) { Stop-Process -Id $pidValue -ErrorAction Stop }
if($qaNames.Count) {
  Push-Location $homeDir
  try {
    & npx --yes supabase@2.118.0 stop
    if($LASTEXITCODE -ne 0) { throw "Supabase stop failed: $LASTEXITCODE" }
  } finally { Pop-Location }
}
Start-Sleep -Seconds 2
$runningNames=@(& docker ps --format '{{.Names}}')
if($LASTEXITCODE -ne 0) { throw 'Cannot verify Docker state after stop.' }
$remaining=@($runningNames | Where-Object { $_ -like "supabase_*_$id" })
$livePids=@($verified | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
if($remaining.Count -or $livePids.Count) {
  throw "QA stop incomplete: $($remaining.Count) running containers, $($livePids.Count) Node processes remain."
}
Write-Host "Stopped only $id. Verified no QA containers or recorded Node processes are running. QA files were preserved."
