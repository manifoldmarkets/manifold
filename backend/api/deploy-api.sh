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

case $ENV in
    dev)
        NEXT_PUBLIC_FIREBASE_ENV=DEV
        GCLOUD_PROJECT=dev-mantic-markets
        MACHINE_TYPE=n2-standard-2 ;;
    prod)
        NEXT_PUBLIC_FIREBASE_ENV=PROD
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

# ian: GambleId requires a static IP address for the API
STATIC_IP_NAME="${SERVICE_NAME}-static-ip"
MAX_IPS=4  # Maximum number of static IPs to cycle through

for i in $(seq 1 $MAX_IPS); do
    CURRENT_IP_NAME="${STATIC_IP_NAME}-${i}"
    STATIC_IP_ADDRESS=$(gcloud compute addresses describe ${CURRENT_IP_NAME} --region=${REGION} --project=${GCLOUD_PROJECT} --format='get(address)' 2>/dev/null || echo "")

    if [ -z "${STATIC_IP_ADDRESS}" ]; then
        echo "Creating new static IP address ${CURRENT_IP_NAME}..."
        gcloud compute addresses create ${CURRENT_IP_NAME} --region=${REGION} --project=${GCLOUD_PROJECT}
        STATIC_IP_ADDRESS=$(gcloud compute addresses describe ${CURRENT_IP_NAME} --region=${REGION} --project=${GCLOUD_PROJECT} --format='get(address)')
    fi

    # Check if any instance is using this IP
    INSTANCE_USING_IP=$(gcloud compute instances list --project=${GCLOUD_PROJECT} --filter="networkInterfaces.accessConfigs.natIP:${STATIC_IP_ADDRESS}" --format="value(name)")

    if [ -z "${INSTANCE_USING_IP}" ]; then
        echo "Using available static IP address: ${STATIC_IP_ADDRESS}"
        break
    else
        echo "IP ${STATIC_IP_ADDRESS} is currently in use by instance ${INSTANCE_USING_IP}. Trying next IP."
    fi
done

if [ -z "${STATIC_IP_ADDRESS}" ]; then
    echo "Error: No available static IPs found. Are there too many concurrent deploys? Check your GCP virtual machine dashboard."
    exit 1
fi

echo "Using static IP address: ${STATIC_IP_ADDRESS}"
echo
echo "Creating new instance template ${TEMPLATE_NAME} using Docker image https://${IMAGE_URL}..."
gcloud compute instance-templates create-with-container ${TEMPLATE_NAME} \
       --project ${GCLOUD_PROJECT} \
       --image-project "cos-cloud" \
       --image-family "cos-109-lts" \
       --container-image ${IMAGE_URL} \
       --machine-type ${MACHINE_TYPE} \
       --container-env NEXT_PUBLIC_FIREBASE_ENV=${NEXT_PUBLIC_FIREBASE_ENV},GOOGLE_CLOUD_PROJECT=${GCLOUD_PROJECT} \
       --no-user-output-enabled \
       --scopes default,cloud-platform \
       --tags lb-health-check \
       --address ${STATIC_IP_ADDRESS}

echo "Importing url-map config"
gcloud compute url-maps import api-lb \
        --source=url-map-config.yaml \
        --project ${GCLOUD_PROJECT} \
        --global \
        --quiet

echo "Updating ${SERVICE_GROUP} to ${TEMPLATE_NAME}. See status here: ${GROUP_PAGE_URL}"
gcloud compute instance-groups managed rolling-action start-update ${SERVICE_GROUP} \
       --project ${GCLOUD_PROJECT} \
       --zone ${ZONE} \
       --version template=${TEMPLATE_NAME} \
       --no-user-output-enabled \
       --max-unavailable 0 # don't kill old one until new one is healthy

echo "Rollout underway. Waiting for update to finish rolling out"
echo "Current time: $(date "+%Y-%m-%d %I:%M:%S %p")"
gcloud compute instance-groups managed wait-until --stable ${SERVICE_GROUP} \
       --project ${GCLOUD_PROJECT} \
       --zone ${ZONE}
