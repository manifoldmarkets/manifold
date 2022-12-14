#!/bin/bash

SERVICE_NAME="supabase-replicator"

ENV=${1:-dev}
case $ENV in
    dev)
      ENVIRONMENT=DEV
      GCLOUD_CPU=1
      GCLOUD_PROJECT=dev-mantic-markets ;;
    prod)
      ENVIRONMENT=prod
      GCLOUD_CPU=4
      GCLOUD_PROJECT=mantic-markets ;;
    *)
      echo "Invalid environment; must be dev or prod."
      exit 1
esac

yarn build && \
gcloud builds submit --tag gcr.io/${GCLOUD_PROJECT}/${SERVICE_NAME} . && \
gcloud beta run deploy ${SERVICE_NAME} \
       --image gcr.io/${GCLOUD_PROJECT}/${SERVICE_NAME} \
       --region us-central1 \
       --set-env-vars GOOGLE_CLOUD_PROJECT=${GCLOUD_PROJECT} \
       --set-secrets SUPABASE_KEY=SUPABASE_KEY:latest \
       --execution-environment gen2 \
       --cpu ${GCLOUD_CPU} \
       --memory 2Gi \
       --concurrency 1000 \
       --min-instances 1 \
       --no-allow-unauthenticated
