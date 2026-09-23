#!/bin/bash

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
    # The container declaration arrives with escaped newlines on some
    # platforms (observed \\n on Windows gcloud); normalize before parsing.
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
        MACHINE_TYPE=e2-small ;; # previously n2-standard-2
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

# steps to deploy new version to GCP:
# 1. build new docker image & upload to Google
# 2. create a new GCP instance template with the new docker image
# 3. tell the GCP 'backend service' for the API to update to the new template
# 4. a. GCP creates a new instance with the new template
#    b. wait for the new instance to be healthy (serving TCP connections)
#    c. route new connections to the new instance
#    d. delete the old instance

yarn build

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

# mqp: if trying to upgrade container OS above 109 LTS, you will need to figure out
# how to handle iptables correctly, right now it seems like there is some problem
# where container OS versions >= 113 drop TCP packets, maybe due to an issue related
# to upgrading from iptables-legacy to iptables-nft
# UPDATE 2025-10-02: cos-109-lts no longer exists, upgraded to cos-121-lts to test

echo "Creating new instance template ${TEMPLATE_NAME} using Docker image https://${IMAGE_URL}..."
gcloud compute instance-templates create-with-container ${TEMPLATE_NAME} \
       --project ${GCLOUD_PROJECT} \
       --image-project "cos-cloud" \
       --image-family "cos-121-lts" \
       --container-image ${IMAGE_URL} \
       --machine-type ${MACHINE_TYPE} \
       --boot-disk-size=100GB \
       --container-env NEXT_PUBLIC_FIREBASE_ENV=${NEXT_PUBLIC_FIREBASE_ENV},GOOGLE_CLOUD_PROJECT=${GCLOUD_PROJECT},REDIS_URL=${REDIS_URL},DISABLE_REDIS_CACHE=${DISABLE_REDIS_CACHE},PERP_TRADING_MODE=${PERP_TRADING_MODE} \
       --no-user-output-enabled \
       --scopes default,cloud-platform \
       --tags lb-health-check

# ian: Uncomment this after you update the url-map config
# echo "Importing url-map config"
# gcloud compute url-maps import api-lb \
#         --source=url-map-config.yaml \
#         --project ${GCLOUD_PROJECT} \
#         --global

echo "Updating ${SERVICE_GROUP} to ${TEMPLATE_NAME}. See status here: ${GROUP_PAGE_URL}"
gcloud compute instance-groups managed rolling-action start-update ${SERVICE_GROUP} \
        --project ${GCLOUD_PROJECT} \
        --zone ${ZONE} \
        --version template=${TEMPLATE_NAME} \
        --no-user-output-enabled \
        --max-unavailable 0 \
        --max-surge 1

echo "Rollout underway. Waiting for update to finish rolling out"
echo "Current time: $(date "+%Y-%m-%d %I:%M:%S %p")"
gcloud compute instance-groups managed wait-until --stable ${SERVICE_GROUP} \
        --project ${GCLOUD_PROJECT} \
        --zone ${ZONE}
