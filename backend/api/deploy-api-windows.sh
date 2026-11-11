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
PERP_TRADING_MODE=${PERP_TRADING_MODE:-}

# The trading mode the live deployment is currently running. Deploys replace
# the container env wholesale, and the runtime treats a missing var as
# 'enabled' (common/perps/trading-mode.ts), so a deploy that omitted
# PERP_TRADING_MODE used to be able to silently reset an incident stance
# (reduce-only / halted) back to enabled. Instead of making the operator
# retype the mode on every prod deploy, read it off the live template and
# carry it forward: a deploy never changes the kill switch unless told to.
get_deployed_perp_trading_mode() {
    local template
    template=$(gcloud compute instance-groups managed describe ${SERVICE_GROUP} \
        --project ${GCLOUD_PROJECT} --zone ${ZONE} \
        --format="value(instanceTemplate)" 2>/dev/null) || return 1
    template=${template##*/}
    [ -n "${template}" ] || return 1
    # The container env lives in the template's `container-env` metadata key,
    # one KEY=VALUE per line (see backend/deploy/cos-container-startup.sh). The
    # value arrives with escaped newlines on some platforms (observed \\n on
    # Windows gcloud); normalize before parsing.
    local mode
    mode=$(gcloud compute instance-templates describe "${template}" \
        --project ${GCLOUD_PROJECT} \
        --format="value(properties.metadata.items.filter(\"key='container-env'\").extract(value))" \
        2>/dev/null \
      | sed 's/\\\\n/\n/g; s/\\n/\n/g' \
      | tr -d '\r' \
      | grep '^PERP_TRADING_MODE=' | head -1 \
      | cut -d= -f2- \
      | tr -d "[:space:]'\"")
    if [ -n "${mode}" ]; then
        echo "${mode}"
        return 0
    fi
    # Legacy fallback: templates made before the move off the container
    # startup agent keep the env in `gce-container-declaration`. Only needed
    # for the first deploy after the switch; safe to delete afterwards.
    gcloud compute instance-templates describe "${template}" \
        --project ${GCLOUD_PROJECT} \
        --format="value(properties.metadata.items.filter(\"key='gce-container-declaration'\").extract(value))" \
        2>/dev/null \
      | sed 's/\\\\n/\n/g; s/\\n/\n/g' \
      | grep -A1 'name: PERP_TRADING_MODE' \
      | grep 'value:' | head -1 \
      | sed 's/.*value: *//' \
      | tr -d "[:space:]'\""
}

case $ENV in
    dev)
        PERP_TRADING_MODE=${PERP_TRADING_MODE:-enabled}
        NEXT_PUBLIC_FIREBASE_ENV=DEV
        REDIS_URL=
        DISABLE_REDIS_CACHE=true
        GCLOUD_PROJECT=dev-mantic-markets
        MACHINE_TYPE=e2-small ;;
    prod)
        NEXT_PUBLIC_FIREBASE_ENV=PROD
        # Private Memorystore instance. Passed at the container level so both
        # the main API process and PM2 read replicas inherit it.
        # Disabled since we scaled back down to one instance.
        # REDIS_URL=redis://10.215.204.211:6379
        # DISABLE_REDIS_CACHE=false
        REDIS_URL=
        DISABLE_REDIS_CACHE=true
        GCLOUD_PROJECT=mantic-markets
        MACHINE_TYPE=c2-standard-4 ;;
    *)
        echo "Invalid environment; must be dev or prod."
        exit 1
esac

# Prod inherits the live mode when not explicitly overridden, so a routine
# deploy can never flip the kill switch by accident.
if [ "$ENV" = "prod" ] && [ -z "${PERP_TRADING_MODE}" ]; then
    echo "PERP_TRADING_MODE not set; reading the live prod mode so this deploy keeps it..."
    DEPLOYED_MODE=$(get_deployed_perp_trading_mode || true)
    case $DEPLOYED_MODE in
        enabled)
            PERP_TRADING_MODE=enabled
            echo "Prod is currently 'enabled'; keeping it." ;;
        reduce-only|halted)
            PERP_TRADING_MODE=${DEPLOYED_MODE}
            echo "NOTE: prod is currently '${DEPLOYED_MODE}' (incident stance). This deploy KEEPS it."
            echo "Pass PERP_TRADING_MODE=enabled explicitly when the incident is over." ;;
        *)
            echo "Could not read the live PERP_TRADING_MODE from ${SERVICE_GROUP} (got '${DEPLOYED_MODE:-nothing}')."
            echo "Refusing to guess on prod: pass PERP_TRADING_MODE=enabled, reduce-only, or halted explicitly."
            exit 1 ;;
    esac
fi

case $PERP_TRADING_MODE in
    enabled|reduce-only|halted) ;;
    *)
        echo "Invalid PERP_TRADING_MODE; expected enabled, reduce-only, or halted."
        exit 1 ;;
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

# The template no longer uses `create-with-container`: the GCE container
# startup agent behind it is deprecated and shut down for new VMs as of
# 2026-07-31.
#   https://cloud.google.com/compute/docs/deprecations/container-startup-agent-on-compute
#   https://cloud.google.com/compute/docs/containers/migrate-containers
# Instead the VM boots stock Container-Optimized OS and runs
# backend/deploy/cos-container-startup.sh as its startup script, which reads
# the image + env from the metadata keys set below and does the `docker run`.
#   https://cloud.google.com/compute/docs/instances/startup-scripts/linux
#   https://cloud.google.com/sdk/gcloud/reference/compute/instance-templates/create
STARTUP_SCRIPT="../deploy/cos-container-startup.sh"
# Container env, one KEY=VALUE per line. It goes through a file because
# gcloud's --metadata flag splits values on commas; --metadata-from-file
# does not.
ENV_FILE="dist/container-env"
printf '%s\n' \
    "NEXT_PUBLIC_FIREBASE_ENV=${NEXT_PUBLIC_FIREBASE_ENV}" \
    "GOOGLE_CLOUD_PROJECT=${GCLOUD_PROJECT}" \
    "REDIS_URL=${REDIS_URL}" \
    "DISABLE_REDIS_CACHE=${DISABLE_REDIS_CACHE}" \
    "PERP_TRADING_MODE=${PERP_TRADING_MODE}" > "${ENV_FILE}"

echo "Creating new instance template ${TEMPLATE_NAME} using Docker image https://${IMAGE_URL}..."
gcloud compute instance-templates create ${TEMPLATE_NAME} \
       --project ${GCLOUD_PROJECT} \
       --image-project "cos-cloud" \
       --image-family "cos-121-lts" \
       --machine-type ${MACHINE_TYPE} \
       --boot-disk-size=100GB \
       --metadata container-image=${IMAGE_URL},container-name=${SERVICE_NAME},google-logging-enabled=true \
       --metadata-from-file startup-script=${STARTUP_SCRIPT},container-env=${ENV_FILE} \
       --no-user-output-enabled \
       --scopes default,cloud-platform \
       --tags lb-health-check
rm -f "${ENV_FILE}"

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
