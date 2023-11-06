#!/bin/bash

SERVICE_NAME="feedmaker"

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
         --set-env-vars GOOGLE_CLOUD_PROJECT=${GCLOUD_PROJECT} \
         --set-secrets SUPABASE_PASSWORD=SUPABASE_PASSWORD:latest \
         --set-secrets SUPABASE_KEY=SUPABASE_KEY:latest \
         --execution-environment gen2 \
         --cpu 2 \
         --memory 4Gi \
         --concurrency 1000 \
         --min-instances 1 \
         --no-cpu-throttling
