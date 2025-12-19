# Deploy backend API to dev environment (Windows)
# Run from: c:\Projects\manifold\backend\api
# Usage: .\deploy-dev-windows.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== Starting dev deployment ===" -ForegroundColor Cyan
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

# Check Docker is running
$dockerStatus = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker is not running. Start Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Step 1: Build TypeScript
Write-Host "`n=== Step 1: Building TypeScript ===" -ForegroundColor Yellow

Set-Location $PSScriptRoot
Write-Host "Running tsc -b..."
yarn tsc -b
if ($LASTEXITCODE -ne 0) { Write-Host "tsc -b failed" -ForegroundColor Red; exit 1 }

Set-Location "$PSScriptRoot\..\..\common"
Write-Host "Running tsc-alias in common..."
yarn tsc-alias
if ($LASTEXITCODE -ne 0) { Write-Host "tsc-alias failed in common" -ForegroundColor Red; exit 1 }

Set-Location "$PSScriptRoot\..\shared"
Write-Host "Running tsc-alias in shared..."
yarn tsc-alias
if ($LASTEXITCODE -ne 0) { Write-Host "tsc-alias failed in shared" -ForegroundColor Red; exit 1 }

Set-Location $PSScriptRoot
Write-Host "Running tsc-alias in api..."
yarn tsc-alias
if ($LASTEXITCODE -ne 0) { Write-Host "tsc-alias failed in api" -ForegroundColor Red; exit 1 }

# Step 2: Prepare dist folder
Write-Host "`n=== Step 2: Preparing dist folder ===" -ForegroundColor Yellow

Set-Location $PSScriptRoot
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
New-Item -ItemType Directory -Force -Path "dist\common\lib" | Out-Null
New-Item -ItemType Directory -Force -Path "dist\backend\shared\lib" | Out-Null
New-Item -ItemType Directory -Force -Path "dist\backend\api\lib" | Out-Null

Copy-Item -Recurse -Force "..\..\common\lib\*" "dist\common\lib\"
Copy-Item -Recurse -Force "..\shared\lib\*" "dist\backend\shared\lib\"
Copy-Item -Recurse -Force ".\lib\*" "dist\backend\api\lib\"
Copy-Item "..\..\yarn.lock" "dist\"
Copy-Item "package.json" "dist\"

Write-Host "dist folder prepared"

# Step 3: Build and push Docker image
Write-Host "`n=== Step 3: Building Docker image ===" -ForegroundColor Yellow

$GIT_REVISION = git rev-parse --short HEAD
$TIMESTAMP = [int][double]::Parse((Get-Date -UFormat %s))
$IMAGE_TAG = "$TIMESTAMP-$GIT_REVISION"
$IMAGE_URL = "us-east4-docker.pkg.dev/dev-mantic-markets/builds/api:$IMAGE_TAG"

Write-Host "Building image: $IMAGE_URL"
docker build . --tag $IMAGE_URL --platform linux/amd64
if ($LASTEXITCODE -ne 0) { Write-Host "Docker build failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Step 4: Pushing Docker image ===" -ForegroundColor Yellow
docker push $IMAGE_URL
if ($LASTEXITCODE -ne 0) { Write-Host "Docker push failed" -ForegroundColor Red; exit 1 }

# Step 5: Find available static IP
Write-Host "`n=== Step 5: Finding available static IP ===" -ForegroundColor Yellow

$STATIC_IP_ADDRESS = $null
foreach ($i in 1..4) {
    $ip = gcloud compute addresses describe "api-static-ip-$i" --region=us-east4 --project=dev-mantic-markets --format="get(address)" 2>$null
    if ($ip) {
        $inUse = gcloud compute instances list --project=dev-mantic-markets --filter="networkInterfaces.accessConfigs.natIP:$ip" --format="value(name)" 2>$null
        if (-not $inUse) {
            $STATIC_IP_ADDRESS = $ip
            Write-Host "Using available IP: $STATIC_IP_ADDRESS (api-static-ip-$i)"
            break
        } else {
            Write-Host "IP api-static-ip-$i ($ip) is in use by $inUse, trying next..."
        }
    }
}

if (-not $STATIC_IP_ADDRESS) {
    Write-Host "ERROR: No available static IPs found. Too many concurrent deploys?" -ForegroundColor Red
    exit 1
}

# Step 6: Create instance template
Write-Host "`n=== Step 6: Creating instance template ===" -ForegroundColor Yellow

$TEMPLATE_NAME = "api-$IMAGE_TAG"
Write-Host "Creating template: $TEMPLATE_NAME"

gcloud compute instance-templates create-with-container $TEMPLATE_NAME `
    --project=dev-mantic-markets `
    --image-project="cos-cloud" `
    --image-family="cos-121-lts" `
    --container-image=$IMAGE_URL `
    --machine-type=e2-small `
    --boot-disk-size=100GB `
    --container-env="NEXT_PUBLIC_FIREBASE_ENV=DEV,GOOGLE_CLOUD_PROJECT=dev-mantic-markets" `
    --scopes="default,cloud-platform" `
    --tags=lb-health-check `
    --address=$STATIC_IP_ADDRESS

if ($LASTEXITCODE -ne 0) { Write-Host "Template creation failed" -ForegroundColor Red; exit 1 }

# Step 7: Start rollout
Write-Host "`n=== Step 7: Starting rollout ===" -ForegroundColor Yellow

gcloud compute instance-groups managed rolling-action start-update api-group-east `
    --project=dev-mantic-markets `
    --zone=us-east4-a `
    --version=template=$TEMPLATE_NAME `
    --max-unavailable=0

if ($LASTEXITCODE -ne 0) { Write-Host "Rollout failed to start" -ForegroundColor Red; exit 1 }

# Step 8: Wait for completion
Write-Host "`n=== Step 8: Waiting for rollout to complete ===" -ForegroundColor Yellow
Write-Host "This usually takes 2-5 minutes..."

gcloud compute instance-groups managed wait-until --stable api-group-east `
    --project=dev-mantic-markets `
    --zone=us-east4-a

if ($LASTEXITCODE -ne 0) {
    Write-Host "Rollout may have failed. Check GCP console." -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Deployment complete! ===" -ForegroundColor Green
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "Your backend changes are now live on dev."
