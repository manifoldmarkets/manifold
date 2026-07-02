#!/bin/bash

# Windows-compatible deploy script for the scheduler.
# Run from Git Bash: ./deploy-scheduler-windows.sh [dev|prod]
#
# Differences from deploy-scheduler.sh:
# - Replaces `yarn build` with the build steps run directly in bash
#   (yarn's subshell + Unix-command script doesn't work through Windows cmd.exe,
#   which is why `yarn build` fails with "The system cannot find the path
#   specified"). Everything else (image build/push + update-container) is the same.

# Uncomment this line if you don't want to install Docker locally!
# MANIFOLD_CLOUD_BUILD=1

set -e

# set to true to spin up the instance for the first time
INITIALIZE=false

SERVICE_NAME="scheduler"
IP_ADDRESS_NAME="scheduler-east"
REGION="us-east4"
ZONE="us-east4-a"
ENV=${1:-dev}

case $ENV in
    dev)
      NEXT_PUBLIC_FIREBASE_ENV=DEV
      GCLOUD_PROJECT=dev-mantic-markets
      MACHINE_TYPE=e2-small ;;  # If you want to change this, change it in the GCP console
    prod)
      NEXT_PUBLIC_FIREBASE_ENV=PROD
      GCLOUD_PROJECT=mantic-markets
      MACHINE_TYPE=n2-highmem-2 ;;  # If you want to change this, change it in the GCP console
    *)
      echo "Invalid environment; must be dev or prod."
      exit 1
esac

# Resolve paths relative to this script so it works from any cwd, and so the
# Docker build context (.) below is the scheduler dir.
cd "$(dirname "$0")"

echo "Deploy start time: $(date "+%Y-%m-%d %I:%M:%S %p")"

GIT_REVISION=$(git rev-parse --short HEAD)
TIMESTAMP=$(date +"%s")
IMAGE_TAG="${TIMESTAMP}-${GIT_REVISION}"

# Windows-compatible build: run each step directly in bash instead of going
# through yarn's cmd.exe script runner.
echo "Building..."
npx tsc -b
(cd ../../common && npx tsc-alias)
(cd ../shared && npx tsc-alias)
npx tsc-alias

# dist:prepare
rm -rf dist
mkdir -p dist/common/lib dist/backend/shared/lib dist/backend/scheduler/lib

# dist:copy (cp -r for Windows compatibility)
cp -r ../../common/lib/* dist/common/lib
cp -r ../shared/lib/* dist/backend/shared/lib
cp -r ./lib/* dist/backend/scheduler/lib
cp ../../yarn.lock dist
cp package.json dist
cp -r src/templates dist/backend/scheduler/lib

echo "Build complete."

# Housekeeping only: free disk on the VM by pruning old images. Non-fatal —
# Windows SSH (plink) can flake, and it must not block the actual deploy below,
# which goes through the gcloud API, not SSH.
if [ "${INITIALIZE}" = false ]; then
  gcloud compute ssh ${SERVICE_NAME} \
       --project ${GCLOUD_PROJECT} \
       --zone ${ZONE} \
       --command 'sudo docker image prune -af' \
    || echo "WARN: image prune skipped (SSH failed) — continuing deploy."
fi

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
    IMAGE_NAME="${REGION}-docker.pkg.dev/${GCLOUD_PROJECT}/builds/${SERVICE_NAME}"
    IMAGE_URL="${IMAGE_NAME}:${IMAGE_TAG}"
    docker build . --tag ${IMAGE_URL} --platform linux/amd64
    docker push ${IMAGE_URL}
else
    IMAGE_NAME="gcr.io/${GCLOUD_PROJECT}/${SERVICE_NAME}"
    IMAGE_URL="${IMAGE_NAME}:${IMAGE_TAG}"
    gcloud builds submit . --tag ${IMAGE_URL} --project ${GCLOUD_PROJECT}
fi

echo "Current time: $(date "+%Y-%m-%d %I:%M:%S %p")"

COMMON_ARGS=(
  --project ${GCLOUD_PROJECT}
  --zone ${ZONE}
  --container-image ${IMAGE_URL}
  --container-env NEXT_PUBLIC_FIREBASE_ENV=${NEXT_PUBLIC_FIREBASE_ENV},GOOGLE_CLOUD_PROJECT=${GCLOUD_PROJECT}
)

if [ "${INITIALIZE}" = true ]; then
    gcloud compute instances create-with-container ${SERVICE_NAME} \
           "${COMMON_ARGS[@]}" \
           --address ${IP_ADDRESS_NAME} \
           --machine-type ${MACHINE_TYPE} \
           --scopes default,cloud-platform \
           --tags http-server
else
    gcloud compute instances update-container ${SERVICE_NAME} \
           "${COMMON_ARGS[@]}"
fi
