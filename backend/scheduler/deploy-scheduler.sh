#!/bin/bash
set -e

# set to true to spin up all the resources for the first time
INITIALIZE=false

SERVICE_NAME="scheduler"
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

if [ "${INITIALIZE}" = true ]; then
    gcloud compute addresses create scheduler --region ${REGION}
    gcloud compute instances create-with-container scheduler \
           --zone ${ZONE} \
           --address scheduler \
           --container-image ${IMAGE_URL} \
           --machine-type n2-standard-2 \
           --container-env ENVIRONMENT=${ENVIRONMENT} \
           --container-env GOOGLE_CLOUD_PROJECT=${GCLOUD_PROJECT} \
           --scopes default,cloud-platform
else
    gcloud compute instances update-container scheduler \
           --zone ${ZONE} \
           --container-image ${IMAGE_URL}
fi
