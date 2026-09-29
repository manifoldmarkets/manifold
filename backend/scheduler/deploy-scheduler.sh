#!/bin/bash
set -e

SERVICE_NAME="scheduler"
IP_ADDRESS_NAME="scheduler-east"
REGION="us-east4"
ZONE="us-east4-a"
ENV=${1:-dev}
# Which job set this instance runs (SCHEDULER_JOBS in scheduler/src/jobs):
#   all   — every job on one instance (local single-instance mode; rejected by this deploy script)
#   main  — everything except the PERP jobs (instance: scheduler)
#   perps — only the PERP oracle/funding jobs (instance: scheduler-perps)
# DEV and PROD require an explicit main/perps pair so the 2s oracle tick never
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

if [ "$TARGET" = "all" ]; then
    echo "$ENV runs a split scheduler pair. Deploy each instance explicitly:"
    echo "  ./deploy-scheduler.sh $ENV main    # batch jobs (instance: scheduler)"
    echo "  ./deploy-scheduler.sh $ENV perps   # PERP oracle/funding jobs (instance: scheduler-perps)"
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

# The VM boots stock Container-Optimized OS and runs
# backend/deploy/cos-container-startup.sh as its startup script, which reads
# the image + env from the metadata keys below and does the `docker run`
# (and prunes unused images, which this script used to do over SSH). This
# replaces `create-with-container` / `update-container`: the GCE container
# startup agent behind them is deprecated and shut down for new VMs as of
# 2026-07-31.
#   https://cloud.google.com/compute/docs/deprecations/container-startup-agent-on-compute
#   https://cloud.google.com/compute/docs/containers/migrate-containers
#   https://cloud.google.com/compute/docs/instances/startup-scripts/linux
STARTUP_SCRIPT="$(dirname "$0")/../deploy/cos-container-startup.sh"
# Container env, one KEY=VALUE per line. It goes through a file because
# gcloud's --metadata flag splits values on commas; --metadata-from-file
# does not.
ENV_FILE=$(mktemp)
printf '%s\n' \
    "NEXT_PUBLIC_FIREBASE_ENV=${NEXT_PUBLIC_FIREBASE_ENV}" \
    "GOOGLE_CLOUD_PROJECT=${GCLOUD_PROJECT}" \
    "SCHEDULER_JOBS=${TARGET}" > "${ENV_FILE}"

METADATA_ARGS=(
  --metadata container-image=${IMAGE_URL},container-name=${SERVICE_NAME},google-logging-enabled=true
  --metadata-from-file startup-script=${STARTUP_SCRIPT},container-env=${ENV_FILE}
)

# If you augment the instance, be sure to increase --max-old-space-size in the Dockerfile
if [ "${INSTANCE_EXISTS}" = false ]; then
#    If you just deleted the instance you don't need this line
#    gcloud compute addresses create ${SERVICE_NAME} --project ${GCLOUD_PROJECT} --region ${REGION}
    ADDRESS_ARGS=()
    if [ "${TARGET}" != "perps" ]; then
        # No reserved address for perps: that instance is egress-only (reach
        # its status page via the ephemeral IP or the GCP console).
        ADDRESS_ARGS=(--address ${IP_ADDRESS_NAME})
    fi
    #   https://cloud.google.com/sdk/gcloud/reference/compute/instances/create
    gcloud compute instances create ${SERVICE_NAME} \
           --project ${GCLOUD_PROJECT} \
           --zone ${ZONE} \
           --image-project "cos-cloud" \
           --image-family "cos-121-lts" \
           --machine-type ${MACHINE_TYPE} \
           --scopes default,cloud-platform \
           --tags http-server \
           "${ADDRESS_ARGS[@]}" \
           "${METADATA_ARGS[@]}"
else
    # One-time migration for VMs made with create-with-container: the old
    # agent (konlet-startup.service) still runs on every boot and would start
    # a second copy of the scheduler next to ours if its metadata key stayed.
    # Removing the key turns it into a no-op.
    #   https://cloud.google.com/compute/docs/containers/migrate-containers#identify-vms
    if gcloud compute instances describe ${SERVICE_NAME} \
         --project ${GCLOUD_PROJECT} --zone ${ZONE} \
         --format="value(metadata.items.filter(\"key='gce-container-declaration'\").extract(key))" \
         | grep -q gce-container-declaration; then
        echo "Removing legacy gce-container-declaration metadata from ${SERVICE_NAME}"
        gcloud compute instances remove-metadata ${SERVICE_NAME} \
               --project ${GCLOUD_PROJECT} \
               --zone ${ZONE} \
               --keys gce-container-declaration
    fi

    # Point the VM at the new image, then restart it so the startup script
    # runs again (the scheduler is down for about a minute, as with
    # update-container). To redeploy without a reboot, SSH in and run
    # `sudo google_metadata_script_runner startup` instead of stop/start.
    #   https://cloud.google.com/sdk/gcloud/reference/compute/instances/add-metadata
    gcloud compute instances add-metadata ${SERVICE_NAME} \
           --project ${GCLOUD_PROJECT} \
           --zone ${ZONE} \
           "${METADATA_ARGS[@]}"
    gcloud compute instances stop ${SERVICE_NAME} --project ${GCLOUD_PROJECT} --zone ${ZONE}
    gcloud compute instances start ${SERVICE_NAME} --project ${GCLOUD_PROJECT} --zone ${ZONE}
fi
rm -f "${ENV_FILE}"

echo "Deploy finished: $(date "+%Y-%m-%d %I:%M:%S %p"). The VM pulls and starts the container on boot; follow along with:"
echo "  gcloud compute instances tail-serial-port-output ${SERVICE_NAME} --project ${GCLOUD_PROJECT} --zone ${ZONE}"
