#!/bin/bash

# Windows-compatible deploy script for the API.
# Run from Git Bash: ./deploy-api-windows.sh [dev|prod]
#
# Differences from deploy-api.sh:
# - Replaces `yarn build` with Windows-compatible build steps
#   (yarn's subshell syntax doesn't work on Windows cmd.exe)

# Uncomment this line if you don't want to install Docker locally!
# MANIFOLD_CLOUD_BUILD=1

set -e

if [ -z "$1" ]; then
    echo "Usage: the first argument should be 'dev' or 'prod'"
    exit 1
fi

SERVICE_NAME="api"
SERVICE_GROUP="${SERVICE_NAME}-group-east"
REGION="us-east4" # Ashburn, Virginia
ZONE="us-east4-a"
ENV=${1:-dev}

case $ENV in
    dev)
        NEXT_PUBLIC_FIREBASE_ENV=DEV
        REDIS_URL=
        DISABLE_REDIS_CACHE=true
        GCLOUD_PROJECT=dev-mantic-markets
        MACHINE_TYPE=e2-small ;;
    prod)
        NEXT_PUBLIC_FIREBASE_ENV=PROD
        # Private Memorystore instance. Passed at the container level so both
        # the main API process and PM2 read replicas inherit it.
        REDIS_URL=redis://10.215.204.211:6379
        DISABLE_REDIS_CACHE=false
        GCLOUD_PROJECT=mantic-markets
        MACHINE_TYPE=c2-standard-4 ;;
    *)
        echo "Invalid environment; must be dev or prod."
        exit 1
esac

echo "Deploy start time: $(date "+%Y-%m-%d %I:%M:%S %p")"

GIT_REVISION=$(git rev-parse --short HEAD)
TIMESTAMP=$(date +"%s")
IMAGE_TAG="${TIMESTAMP}-${GIT_REVISION}"

# Windows-compatible build: run each step directly in bash
# instead of going through yarn's cmd.exe script runner
echo "Building..."
cd "$(dirname "$0")"
npx tsc -b
(cd ../../common && npx tsc-alias)
(cd ../shared && npx tsc-alias)
npx tsc-alias

# dist:prepare
rm -rf dist
mkdir -p dist/common/lib dist/backend/shared/lib dist/backend/api/lib

# dist:copy (using cp -r instead of rsync for Windows compatibility)
cp -r ../../common/lib/* dist/common/lib
cp -r ../shared/lib/* dist/backend/shared/lib
cp -r ./lib/* dist/backend/api/lib
cp ../../yarn.lock dist
cp package.json dist

echo "Build complete."

if [ -z "${MANIFOLD_CLOUD_BUILD}" ]; then
    if ! command -v docker &> /dev/null
    then
       echo "Docker not found. You should install Docker for local builds. https://docs.docker.com/engine/install/"
       echo
       echo "After installing docker, run:"
       echo "  gcloud auth configure-docker ${REGION}-docker.pkg.dev"
       echo "to authenticate Docker to push to Google Artifact Registry."
       echo
       echo "If you really don't want to figure out how to install Docker, you can set MANIFOLD_CLOUD_BUILD=1."
       echo "Then it will do remote builds like before, at the cost of it being slow, like before."
       exit 1
    fi
    IMAGE_NAME="us-east4-docker.pkg.dev/${GCLOUD_PROJECT}/builds/${SERVICE_NAME}"
    IMAGE_URL="${IMAGE_NAME}:${IMAGE_TAG}"
    docker build . --tag ${IMAGE_URL} --platform linux/amd64
    docker push ${IMAGE_URL}
else
    # not really any reason to do this other than if you have been too lazy to install docker
    IMAGE_NAME="gcr.io/${GCLOUD_PROJECT}/${SERVICE_NAME}"
    IMAGE_URL="${IMAGE_NAME}:${IMAGE_TAG}"
    gcloud builds submit . --tag ${IMAGE_URL} --project ${GCLOUD_PROJECT}
fi

TEMPLATE_NAME="${SERVICE_NAME}-${IMAGE_TAG}"
GROUP_PAGE_URL="https://console.cloud.google.com/compute/instanceGroups/details/${ZONE}/${SERVICE_GROUP}?project=${GCLOUD_PROJECT}"

echo "Creating new instance template ${TEMPLATE_NAME} using Docker image https://${IMAGE_URL}..."
gcloud compute instance-templates create-with-container ${TEMPLATE_NAME} \
       --project ${GCLOUD_PROJECT} \
       --image-project "cos-cloud" \
       --image-family "cos-121-lts" \
       --container-image ${IMAGE_URL} \
       --machine-type ${MACHINE_TYPE} \
       --boot-disk-size=100GB \
       --container-env NEXT_PUBLIC_FIREBASE_ENV=${NEXT_PUBLIC_FIREBASE_ENV},GOOGLE_CLOUD_PROJECT=${GCLOUD_PROJECT},REDIS_URL=${REDIS_URL},DISABLE_REDIS_CACHE=${DISABLE_REDIS_CACHE} \
       --no-user-output-enabled \
       --scopes default,cloud-platform \
       --tags lb-health-check

echo "Updating ${SERVICE_GROUP} to ${TEMPLATE_NAME}. See status here: ${GROUP_PAGE_URL}"
gcloud compute instance-groups managed rolling-action start-update ${SERVICE_GROUP} \
       --project ${GCLOUD_PROJECT} \
       --zone ${ZONE} \
       --version template=${TEMPLATE_NAME} \
       --no-user-output-enabled \
       --max-unavailable 0 \
       --max-surge 1 # don't kill old one until new one is healthy

echo "Rollout underway. Waiting for update to finish rolling out"
echo "Current time: $(date "+%Y-%m-%d %I:%M:%S %p")"
gcloud compute instance-groups managed wait-until --stable ${SERVICE_GROUP} \
       --project ${GCLOUD_PROJECT} \
       --zone ${ZONE}
