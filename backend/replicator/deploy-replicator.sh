#!/bin/bash

SERVICE_NAME="supabase-replicator"

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

# note that we deploy this onto us-east-4, nearest to supabase, not us-central like most stuff

yarn build && \
  gcloud builds submit . \
         --tag gcr.io/${GCLOUD_PROJECT}/${SERVICE_NAME} \
         --project ${GCLOUD_PROJECT} && \
  gcloud beta run deploy ${SERVICE_NAME} \
         --image gcr.io/${GCLOUD_PROJECT}/${SERVICE_NAME} \
         --project ${GCLOUD_PROJECT} \
         --region us-east4 \
         --set-env-vars ENVIRONMENT=${ENVIRONMENT} \
         --set-env-vars GOOGLE_CLOUD_PROJECT=${GCLOUD_PROJECT} \
         --set-secrets SUPABASE_PASSWORD=SUPABASE_PASSWORD:latest \
         --execution-environment gen2 \
         --cpu 1 \
         --memory 512Mi \
         --concurrency 1000 \
         --min-instances 1 \
         --no-cpu-throttling

# to establish subscription to service, e.g.:
# gcloud pubsub subscriptions create supabaseReplicationSubscription --topic firestoreWrite --ack-deadline 600 --push-endpoint https://supabase-replicator-w3txbmd3ba-uc.a.run.app
# and make sure subscription push service account is authed to call service
