#!/bin/bash
set -e

if [ -z "$1" ]; then
    echo "Usage: the first argument should be 'dev' or 'prod'"
    exit 1
fi

# set to true to spin up all the resources for the first time
INITIALIZE=false

SERVICE_NAME="api"
SERVICE_GROUP="${SERVICE_NAME}-group"
REGION="us-central1"
ZONE="us-central1-a"
ENV=${1:-dev}

case $ENV in
    dev)
        ENVIRONMENT=DEV
        GCLOUD_PROJECT=dev-mantic-markets ;;
    prod)
        ENVIRONMENT=PROD
        GCLOUD_PROJECT=mantic-markets ;;
    *)
        echo "Invalid environment; must be dev or prod."
        exit 1
esac

GIT_REVISION=$(git rev-parse --short HEAD)
TIMESTAMP=$(date +"%s")
IMAGE_TAG="${TIMESTAMP}-${GIT_REVISION}"
IMAGE_NAME="gcr.io/${GCLOUD_PROJECT}/${SERVICE_NAME}"
IMAGE_URL="${IMAGE_NAME}:${IMAGE_TAG}"
TEMPLATE_NAME="${SERVICE_NAME}-${IMAGE_TAG}"
GROUP_PAGE_URL="https://console.cloud.google.com/compute/instanceGroups/details/${ZONE}/${SERVICE_GROUP}?project=${GCLOUD_PROJECT}"

# steps to deploy new version to GCP:
# 1. build new docker image & upload to GCR
# 2. create a new GCP instance template with the new docker image
# 3. tell the GCP 'backend service' for the API to update to the new template
# 4. a. GCP creates a new instance with the new template
#    b. wait for the new instance to be healthy (serving TCP connections)
#    c. route new connections to the new instance
#    d. delete the old instance

yarn build
gcloud builds submit . --tag ${IMAGE_URL} --project ${GCLOUD_PROJECT}

echo
echo "Creating new instance template ${TEMPLATE_NAME} using Docker image https://${IMAGE_URL}..."
gcloud compute instance-templates create-with-container ${TEMPLATE_NAME} \
       --project ${GCLOUD_PROJECT} \
       --container-image ${IMAGE_URL} \
       --machine-type n2-standard-8 \
       --container-env ENVIRONMENT=${ENVIRONMENT},GOOGLE_CLOUD_PROJECT=${GCLOUD_PROJECT} \
       --no-user-output-enabled \
       --scopes default,cloud-platform

echo "Updating ${SERVICE_GROUP} to ${TEMPLATE_NAME}. See status here: ${GROUP_PAGE_URL}"
gcloud compute instance-groups managed rolling-action start-update ${SERVICE_GROUP} \
       --project ${GCLOUD_PROJECT} \
       --zone ${ZONE} \
       --version template=${TEMPLATE_NAME} \
       --no-user-output-enabled \
       --max-unavailable 0 # don't kill old one until new one is healthy

echo "Rollout underway. Waiting for update to finish rolling out (you can CTRL-C if bored...)"
gcloud compute instance-groups managed wait-until --stable ${SERVICE_GROUP} \
       --project ${GCLOUD_PROJECT} \
       --zone ${ZONE}
