$ErrorActionPreference = 'Stop'

function Get-ProjectRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Get-RandomHex([int] $ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function Ensure-LocalEnvironment {
  $projectRoot = Get-ProjectRoot
  $environmentPath = Join-Path $projectRoot '.env.local'
  if (-not (Test-Path -LiteralPath $environmentPath)) {
    $template = Get-Content -Raw -LiteralPath (Join-Path $projectRoot '.env.example')
    $template = $template.Replace('__GENERATE_32_BYTES__', (Get-RandomHex 32))
    $template = $template.Replace('__GENERATE_64_BYTES__', (Get-RandomHex 64))
    $template = $template.Replace('__GENERATE_LOCAL_SECRET__', (Get-RandomHex 32))
    Set-Content -LiteralPath $environmentPath -Value $template -Encoding utf8
  } else {
    $existing = Get-Content -Raw -LiteralPath $environmentPath
    if ($existing.Contains('__GENERATE_LOCAL_SECRET__')) {
      $existing = $existing.Replace('__GENERATE_LOCAL_SECRET__', (Get-RandomHex 32))
    }
    if ($existing.Contains('__GENERATE_64_BYTES__')) {
      $existing = $existing.Replace('__GENERATE_64_BYTES__', (Get-RandomHex 64))
    }
    if ($existing -notmatch '(?m)^MODEL_ENCRYPTION_KEY=') {
      $existing = $existing.TrimEnd() + "`r`nMODEL_ENCRYPTION_KEY=$(Get-RandomHex 64)`r`n"
    }
    if ($existing -notmatch '(?m)^SEARXNG_SECRET=') {
      $existing = $existing.TrimEnd() + "`r`nSEARXNG_SECRET=$(Get-RandomHex 32)`r`n"
    }
    if ($existing -ne (Get-Content -Raw -LiteralPath $environmentPath)) {
      Set-Content -LiteralPath $environmentPath -Value $existing -Encoding utf8
    }
  }
  return $environmentPath
}

function Invoke-Compose([string[]] $Arguments) {
  $projectRoot = Get-ProjectRoot
  $environmentPath = Ensure-LocalEnvironment
  & docker compose --env-file $environmentPath --project-directory $projectRoot @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose failed with exit code $LASTEXITCODE"
  }
}

function Read-EnvironmentFile {
  $values = @{}
  Get-Content -LiteralPath (Ensure-LocalEnvironment) | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') {
      $values[$matches[1].Trim()] = $matches[2].Trim()
    }
  }
  return $values
}
