#!/bin/bash
set -e

# set to true to spin up all the resources for the first time
INITIALIZE=false

SERVICE_NAME="scheduler"
IP_ADDRESS_NAME="scheduler-east"
REGION="us-east4"
ZONE="us-east4-a"
ENV=${1:-dev}

case $ENV in
    dev)
      NEXT_PUBLIC_FIREBASE_ENV=DEV
      GCLOUD_PROJECT=dev-mantic-markets
      # MACHINE_TYPE=n2-standard-2 ;;
      MACHINE_TYPE=e2-small ;;
    prod)
      NEXT_PUBLIC_FIREBASE_ENV=PROD
      GCLOUD_PROJECT=mantic-markets
      MACHINE_TYPE=n2-standard-2 ;;
    *)
      echo "Invalid environment; must be dev or prod."
      exit 1
esac

GIT_REVISION=$(git rev-parse --short HEAD)
TIMESTAMP=$(date +"%s")
IMAGE_TAG="${TIMESTAMP}-${GIT_REVISION}"

echo "Deploy start time: $(date "+%Y-%m-%d %I:%M:%S %p")"

yarn build
if [ "${INITIALIZE}" = false ]; then
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
  --container-env NEXT_PUBLIC_FIREBASE_ENV=${NEXT_PUBLIC_FIREBASE_ENV},GOOGLE_CLOUD_PROJECT=${GCLOUD_PROJECT}
)

# If you augment the instance, be sure to increase --max-old-space-size in the Dockerfile
if [ "${INITIALIZE}" = true ]; then
#    If you just deleted the instance you don't need this line
#    gcloud compute addresses create ${SERVICE_NAME} --project ${GCLOUD_PROJECT} --region ${REGION}
    gcloud compute instances create-with-container ${SERVICE_NAME} \
           "${COMMON_ARGS[@]}" \
           --address ${IP_ADDRESS_NAME} \
           --machine-type ${MACHINE_TYPE} \
           --scopes default,cloud-platform \
           --tags http-server
else
    gcloud compute instances update-container ${SERVICE_NAME} \
           "${COMMON_ARGS[@]}"
fi
