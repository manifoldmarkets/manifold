#!/bin/bash
set -e

if [ -z "$1" ]; then
echo "Usage: the first argument should be 'dev' or 'prod'"
exit 1
fi

# set to true to spin up all the resources for the first time
INITIALIZE=false

SERVICE_NAME="api"
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

echo "Looking up instance IDs to update..."
INSTANCE_IDS=$(gcloud compute instances list --project ${GCLOUD_PROJECT} --filter NAME~"api-group" --format="value(NAME)")
for i in $INSTANCE_IDS; do
    echo "Pulling new image onto instance: $i..."
    gcloud compute instances update-container $i \
           --project ${GCLOUD_PROJECT} \
           --zone ${ZONE} \
           --container-image ${IMAGE_URL}
done
