# Run API server locally for development (Windows)
# Usage: .\dev-windows.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== Starting API dev server ===" -ForegroundColor Cyan
Write-Host "This will compile TypeScript and start the server with auto-reload." -ForegroundColor Gray
Write-Host ""
Write-Host "In another terminal, run the frontend with:" -ForegroundColor Yellow
Write-Host "  cd C:\Projects\manifold\web" -ForegroundColor White
Write-Host "  yarn dev:local" -ForegroundColor White
Write-Host ""

Set-Location $PSScriptRoot

# Set environment variables
$env:NEXT_PUBLIC_FIREBASE_ENV = "DEV"
$env:GOOGLE_CLOUD_PROJECT = "dev-mantic-markets"
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Projects\secretmanifoldkey\dev-mantic-markets-firebase-adminsdk.json"

# Initial compile
Write-Host "Initial compile..." -ForegroundColor Yellow
& "$PSScriptRoot\compile-windows.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Initial compilation failed!" -ForegroundColor Red
    exit 1
}

# Start the server with nodemon for auto-reload
Write-Host ""
Write-Host "Starting server on http://localhost:8088 ..." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

$env:NEXT_PUBLIC_FIREBASE_ENV = "DEV"
$env:GOOGLE_CLOUD_PROJECT = "dev-mantic-markets"
npx nodemon --watch src --watch "../../common/src" --watch "../shared/src" -e ts --exec "powershell -ExecutionPolicy Bypass -File compile-windows.ps1 && node lib/serve.js"
