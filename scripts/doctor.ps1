. (Join-Path $PSScriptRoot 'common.ps1')

$problems = New-Object System.Collections.Generic.List[string]

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  $problems.Add('Docker was not found. Install and start Docker Desktop.')
} else {
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    $problems.Add('Docker Desktop is not running.')
  }
  & docker compose version *> $null
  if ($LASTEXITCODE -ne 0) {
    $problems.Add('The Docker Compose plugin is unavailable.')
  }
}

$environmentPath = Ensure-LocalEnvironment
$environmentText = Get-Content -Raw -LiteralPath $environmentPath
if ($environmentText.Contains('__GENERATE_')) {
  $problems.Add('.env.local still contains placeholder secrets.')
}

if ($problems.Count -eq 0) {
  Invoke-Compose @('config', '--quiet')
  Write-Host 'Environment check passed.' -ForegroundColor Green
  exit 0
}

$problems | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
exit 1
