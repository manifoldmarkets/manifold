#!/bin/bash

SERVICE_NAME="api"

if [ -z "$1" ]; then
echo "Usage: the first argument should be 'dev' or 'prod'"
exit 1
fi

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

yarn build && \
  gcloud builds submit . \
         --tag gcr.io/${GCLOUD_PROJECT}/${SERVICE_NAME} \
         --project ${GCLOUD_PROJECT} && \
  gcloud beta run deploy ${SERVICE_NAME} \
         --image gcr.io/${GCLOUD_PROJECT}/${SERVICE_NAME} \
         --project ${GCLOUD_PROJECT} \
         --region us-central1 \
         --set-env-vars ENVIRONMENT=${ENVIRONMENT} \
         --set-env-vars NEXT_PUBLIC_FIREBASE_ENV=${ENVIRONMENT} \
         --set-env-vars GOOGLE_CLOUD_PROJECT=${GCLOUD_PROJECT} \
         --execution-environment gen2 \
         --cpu 2 \
         --memory 2Gi \
         --concurrency 1000 \
         --min-instances 1
