param(
  [Parameter(Mandatory = $true)]
  [string] $BackupFile,
  [switch] $Force
)

. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'backup-crypto.ps1')

$projectRoot = Get-ProjectRoot
$backupRoot = Join-Path $projectRoot 'backups'
$resolvedBackup = (Resolve-Path -LiteralPath $BackupFile).Path
$resolvedRoot = (Resolve-Path -LiteralPath $backupRoot).Path.TrimEnd('\') + '\'
if (-not $resolvedBackup.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Restore only accepts backup files stored inside the project backups directory.'
}
if ([System.IO.Path]::GetExtension($resolvedBackup) -ne '.cwbackup') {
  throw 'Restore requires a .cwbackup file.'
}

if (-not $Force) {
  $answer = Read-Host 'Restore replaces the current database and uploaded files. Type RESTORE to continue'
  if ($answer -cne 'RESTORE') { throw 'Restore cancelled.' }
}

$values = Read-EnvironmentFile
$restoreId = [guid]::NewGuid().ToString()
$workDirectory = Join-Path $backupRoot ".restore-$restoreId"
$zipFile = Join-Path $workDirectory 'backup.zip'
New-Item -ItemType Directory -Force -Path $workDirectory | Out-Null

try {
  Unprotect-Backup -InputFile $resolvedBackup -OutputFile $zipFile -KeyHex $values.BACKUP_ENCRYPTION_KEY
  Expand-Archive -LiteralPath $zipFile -DestinationPath $workDirectory -Force
  $databaseDump = Join-Path $workDirectory 'database.dump'
  if (-not (Test-Path -LiteralPath $databaseDump)) { throw 'Backup does not contain database.dump.' }

  Invoke-Compose @('stop', 'web', 'api', 'worker')
  $containerDump = "/backups/.restore-$restoreId/database.dump"
  Invoke-Compose @(
    'exec', '-T', '-e', "BACKUP_FILE=$containerDump", 'postgres',
    'sh', '-c', 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists "$BACKUP_FILE"'
  )

  $storageSource = Join-Path $workDirectory 'storage'
  $storageTarget = Join-Path $projectRoot 'data\storage'
  if (Test-Path -LiteralPath $storageSource) {
    $previousStorage = Join-Path $projectRoot "data\storage.pre-restore-$restoreId"
    if (Test-Path -LiteralPath $storageTarget) {
      Move-Item -LiteralPath $storageTarget -Destination $previousStorage
    }
    Copy-Item -LiteralPath $storageSource -Destination $storageTarget -Recurse
    Write-Host "Previous storage was preserved at $previousStorage"
  }

  Invoke-Compose @('up', '--detach', 'api', 'worker', 'web')
  Write-Host 'Restore completed.' -ForegroundColor Green
} finally {
  Remove-Item -LiteralPath $workDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
