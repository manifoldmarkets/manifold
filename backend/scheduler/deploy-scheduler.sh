#!/bin/bash
set -e

SERVICE_NAME="scheduler"
IP_ADDRESS_NAME="scheduler-east"
REGION="us-east4"
ZONE="us-east4-a"
ENV=${1:-dev}
# Which job set this instance runs (SCHEDULER_JOBS in scheduler/src/jobs):
#   all   — every job on one instance (single-instance mode; the dev default)
#   main  — everything except the PERP jobs (instance: scheduler)
#   perps — only the PERP oracle/funding jobs (instance: scheduler-perps)
# Prod requires an explicit main/perps pair so the 15s oracle tick never
# shares an event loop with heavy batch jobs, which stall it for minutes.
TARGET=${2:-all}

case $ENV in
    dev)
      NEXT_PUBLIC_FIREBASE_ENV=DEV
      GCLOUD_PROJECT=dev-mantic-markets
      # MACHINE_TYPE=n2-standard-2 ;;
      MACHINE_TYPE=e2-small ;;  # If you want to change this, you have to change it in the GCP console
    prod)
      NEXT_PUBLIC_FIREBASE_ENV=PROD
      GCLOUD_PROJECT=mantic-markets
      MACHINE_TYPE=n2-highmem-2;;  # If you want to change this, you have to change it in the GCP console
    *)
      echo "Invalid environment; must be dev or prod."
      exit 1
esac

case $TARGET in
    all|main|perps) ;;
    *)
      echo "Invalid target; must be all, main, or perps."
      exit 1
esac

if [ "$ENV" = "prod" ] && [ "$TARGET" = "all" ]; then
    echo "PROD runs a split scheduler pair. Deploy each instance explicitly:"
    echo "  ./deploy-scheduler.sh prod main    # batch jobs (instance: scheduler)"
    echo "  ./deploy-scheduler.sh prod perps   # PERP oracle/funding jobs (instance: scheduler-perps)"
    echo "Deploy main first, then perps, so the PERP jobs never run on two instances at once."
    exit 1
fi

if [ "$TARGET" = "perps" ]; then
    # The PERP jobs are lightweight (feed fetches + per-contract engine
    # updates); what they need is an unshared event loop, not a big machine.
    SERVICE_NAME="scheduler-perps"
    MACHINE_TYPE=e2-small
fi

GIT_REVISION=$(git rev-parse --short HEAD)
TIMESTAMP=$(date +"%s")
IMAGE_TAG="${TIMESTAMP}-${GIT_REVISION}"

echo "Deploy start time: $(date "+%Y-%m-%d %I:%M:%S %p")"

if gcloud compute instances describe ${SERVICE_NAME} \
     --project ${GCLOUD_PROJECT} --zone ${ZONE} \
     --format="value(name)" >/dev/null 2>&1; then
    INSTANCE_EXISTS=true
else
    INSTANCE_EXISTS=false
    echo "Instance ${SERVICE_NAME} not found in ${GCLOUD_PROJECT}; it will be created."
fi

yarn build
if [ "${INSTANCE_EXISTS}" = true ]; then
  gcloud compute ssh ${SERVICE_NAME} \
       --project ${GCLOUD_PROJECT} \
       --zone ${ZONE} \
       --command 'sudo docker image prune -af'
       fi

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
    IMAGE_NAME="${REGION}-docker.pkg.dev/${GCLOUD_PROJECT}/builds/${SERVICE_NAME}"
    IMAGE_URL="${IMAGE_NAME}:${IMAGE_TAG}"
    docker build . --tag ${IMAGE_URL} --platform linux/amd64
    docker push ${IMAGE_URL}
else
    # not really any reason to do this other than if you have been too lazy to install docker
    IMAGE_NAME="gcr.io/${GCLOUD_PROJECT}/${SERVICE_NAME}"
    IMAGE_URL="${IMAGE_NAME}:${IMAGE_TAG}"
    gcloud builds submit . --tag ${IMAGE_URL} --project ${GCLOUD_PROJECT}
fi

echo "Current time: $(date "+%Y-%m-%d %I:%M:%S %p")"

COMMON_ARGS=(
  --project ${GCLOUD_PROJECT}
  --zone ${ZONE}
  --container-image ${IMAGE_URL}
  --container-env NEXT_PUBLIC_FIREBASE_ENV=${NEXT_PUBLIC_FIREBASE_ENV},GOOGLE_CLOUD_PROJECT=${GCLOUD_PROJECT},SCHEDULER_JOBS=${TARGET}
)

# If you augment the instance, be sure to increase --max-old-space-size in the Dockerfile
if [ "${INSTANCE_EXISTS}" = false ]; then
#    If you just deleted the instance you don't need this line
#    gcloud compute addresses create ${SERVICE_NAME} --project ${GCLOUD_PROJECT} --region ${REGION}
    if [ "${TARGET}" = "perps" ]; then
        # No reserved address: the perps instance is egress-only (reach its
        # status page via the ephemeral IP or the GCP console).
        gcloud compute instances create-with-container ${SERVICE_NAME} \
               "${COMMON_ARGS[@]}" \
               --machine-type ${MACHINE_TYPE} \
               --scopes default,cloud-platform \
               --tags http-server
    else
        gcloud compute instances create-with-container ${SERVICE_NAME} \
               "${COMMON_ARGS[@]}" \
               --address ${IP_ADDRESS_NAME} \
               --machine-type ${MACHINE_TYPE} \
               --scopes default,cloud-platform \
               --tags http-server
    fi
else
    gcloud compute instances update-container ${SERVICE_NAME} \
           "${COMMON_ARGS[@]}"
fi
