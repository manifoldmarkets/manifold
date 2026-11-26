#!/bin/bash
# Deploys the AskManifold bot to Cloud Run, the same way as backend/discord-bot.
# Usage: ./deploy.sh dev   (markets go to dev.manifold.markets)
#        ./deploy.sh prod  (markets go to manifold.markets)
#
# Keys come from GCP Secret Manager (create these once per project):
#   TWITTER_BOT_X_API_KEY, TWITTER_BOT_X_API_SECRET,
#   TWITTER_BOT_X_ACCESS_TOKEN, TWITTER_BOT_X_ACCESS_SECRET,
#   TWITTER_BOT_ANTHROPIC_API_KEY, TWITTER_BOT_MANIFOLD_API_KEY

SERVICE_NAME="twitter-bot"

ENV=${1:-dev}
case $ENV in
    dev)
      GCLOUD_PROJECT=dev-mantic-markets
      MANIFOLD_API_URL=https://api.dev.manifold.markets
      ALLOWED_USERNAME=${ALLOWED_USERNAME:-TestManifold} ;;
    prod)
      GCLOUD_PROJECT=mantic-markets
      MANIFOLD_API_URL=https://api.manifold.markets
      ALLOWED_USERNAME=${ALLOWED_USERNAME:?set ALLOWED_USERNAME for prod} ;;
    *)
      echo "Invalid environment; must be dev or prod."
      exit 1
esac

gcloud builds submit . \
       --tag gcr.io/${GCLOUD_PROJECT}/${SERVICE_NAME} \
       --project ${GCLOUD_PROJECT} && \
gcloud beta run deploy ${SERVICE_NAME} \
       --image gcr.io/${GCLOUD_PROJECT}/${SERVICE_NAME} \
       --project ${GCLOUD_PROJECT} \
       --region us-central1 \
       --set-env-vars MANIFOLD_API_URL=${MANIFOLD_API_URL} \
       --set-env-vars ALLOWED_USERNAME=${ALLOWED_USERNAME} \
       --set-env-vars DRY_RUN=false \
       --set-secrets X_API_KEY=TWITTER_BOT_X_API_KEY:latest \
       --set-secrets X_API_SECRET=TWITTER_BOT_X_API_SECRET:latest \
       --set-secrets X_ACCESS_TOKEN=TWITTER_BOT_X_ACCESS_TOKEN:latest \
       --set-secrets X_ACCESS_SECRET=TWITTER_BOT_X_ACCESS_SECRET:latest \
       --set-secrets ANTHROPIC_API_KEY=TWITTER_BOT_ANTHROPIC_API_KEY:latest \
       --set-secrets MANIFOLD_API_KEY=TWITTER_BOT_MANIFOLD_API_KEY:latest \
       --execution-environment gen2 \
       --cpu 1 \
       --memory 512Mi \
       --min-instances 1 \
       --max-instances 1 \
       --no-allow-unauthenticated \
       --no-cpu-throttling
