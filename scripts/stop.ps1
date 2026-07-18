. (Join-Path $PSScriptRoot 'common.ps1')

Invoke-Compose @('stop')
Write-Host 'The platform is stopped. Database and uploaded files were preserved.' -ForegroundColor Green
