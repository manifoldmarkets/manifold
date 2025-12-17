# Compile TypeScript for Windows
# This is called by dev-windows.ps1 and nodemon

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Set-Location $PSScriptRoot
yarn tsc -b
if ($LASTEXITCODE -ne 0) { exit 1 }

Set-Location "$root\common"
yarn tsc-alias
if ($LASTEXITCODE -ne 0) { exit 1 }

Set-Location "$root\backend\shared"
yarn tsc-alias
if ($LASTEXITCODE -ne 0) { exit 1 }

Set-Location "$root\backend\api"
yarn tsc-alias
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "Compiled!" -ForegroundColor Green
