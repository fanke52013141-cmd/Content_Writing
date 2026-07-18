. (Join-Path $PSScriptRoot 'common.ps1')

& (Join-Path $PSScriptRoot 'doctor.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$projectRoot = Get-ProjectRoot
New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot 'data\storage') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot 'backups') | Out-Null

Invoke-Compose @('up', '--detach', '--build', '--remove-orphans')

$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000' -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 2
  }
}

if (-not $ready) {
  Invoke-Compose @('ps')
  throw 'The platform did not become ready in time. Review the service status above.'
}

Start-Process 'http://127.0.0.1:3000'
Write-Host 'Content Writing is ready at http://127.0.0.1:3000' -ForegroundColor Green
