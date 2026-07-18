. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'backup-crypto.ps1')

$projectRoot = Get-ProjectRoot
$values = Read-EnvironmentFile
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dailyRoot = Join-Path $projectRoot 'backups\daily'
$workDirectory = Join-Path $dailyRoot ".work-$stamp"
$zipFile = Join-Path $dailyRoot "$stamp.zip"
$encryptedFile = Join-Path $dailyRoot "$stamp.cwbackup"
New-Item -ItemType Directory -Force -Path $workDirectory | Out-Null

try {
  $containerDump = "/backups/daily/.work-$stamp/database.dump"
  Invoke-Compose @(
    'exec', '-T', '-e', "BACKUP_FILE=$containerDump", 'postgres',
    'sh', '-c', 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$BACKUP_FILE"'
  )
  $storagePath = Join-Path $projectRoot 'data\storage'
  if (Test-Path -LiteralPath $storagePath) {
    Copy-Item -LiteralPath $storagePath -Destination (Join-Path $workDirectory 'storage') -Recurse
  }
  Compress-Archive -Path (Join-Path $workDirectory '*') -DestinationPath $zipFile -CompressionLevel Optimal
  Protect-Backup -InputFile $zipFile -OutputFile $encryptedFile -KeyHex $values.BACKUP_ENCRYPTION_KEY
} finally {
  Remove-Item -LiteralPath $workDirectory -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $zipFile -Force -ErrorAction SilentlyContinue
}

Get-ChildItem -LiteralPath $dailyRoot -Filter '*.cwbackup' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 7 |
  Remove-Item -Force

if ((Get-Date).DayOfWeek -eq [DayOfWeek]::Sunday) {
  $week = Get-Date -UFormat '%Y-W%V'
  $weeklyRoot = Join-Path $projectRoot 'backups\weekly'
  New-Item -ItemType Directory -Force -Path $weeklyRoot | Out-Null
  Copy-Item -LiteralPath $encryptedFile -Destination (Join-Path $weeklyRoot "$week.cwbackup") -Force
  Get-ChildItem -LiteralPath $weeklyRoot -Filter '*.cwbackup' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 4 |
    Remove-Item -Force
}

Write-Host "Encrypted backup completed: $encryptedFile" -ForegroundColor Green
