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

IMAGE_URL="gcr.io/${GCLOUD_PROJECT}/${SERVICE_NAME}"

yarn build
gcloud builds submit . --tag ${IMAGE_URL} --project ${GCLOUD_PROJECT}

TIMESTAMP=$(date +"%s")
TEMPLATE_NAME=${SERVICE_NAME}-${TIMESTAMP}

gcloud compute instance-templates create-with-container ${TEMPLATE_NAME} \
       --project ${GCLOUD_PROJECT} \
       --container-image ${IMAGE_URL} \
       --machine-type n2-standard-4 \
       --container-env ENVIRONMENT=${ENVIRONMENT},GOOGLE_CLOUD_PROJECT=${GCLOUD_PROJECT} \
       --scopes default,cloud-platform

gcloud compute instance-groups managed rolling-action start-update ${SERVICE_GROUP} \
       --project ${GCLOUD_PROJECT} \
       --zone ${ZONE} \
       --version="template=${TEMPLATE_NAME}" \
       --max-unavailable=0 # don't kill old one until new one is healthy

DASHBOARD_URL="https://console.cloud.google.com/compute/instanceGroups/details/${ZONE}/${SERVICE_GROUP}?project=${GCLOUD_PROJECT}"

echo "Waiting for update to roll out... Dashboard: ${DASHBOARD_URL}"
gcloud compute instance-groups managed wait-until ${SERVICE_GROUP} \
       --project ${GCLOUD_PROJECT} \
       --zone ${ZONE} \
       --stable
