#!/bin/bash

# GCP allows you to add multiple "backend services" for the same VM.
# Like, this is useful for load balancing to different ports.

# remember to add a new express instance on the port via the ecosystem.config.js file
# remember to add the new service to the url-map-config.yaml file
# remember to re-run deploy-api.sh after adding a new backend service

set -e

if [ -z "$1" ]; then
    echo "Usage: the first argument should be 'dev' or 'prod'"
    exit 1
fi

# ~*~.~*~ Change these values ~*~.~*~.
BACKEND_NAME="api-lb-read-service-2"
PORT_NAME="read-2"
PORT="8092"
DESCRIPTION="read only instance"

SERVICE_GROUP="api-group-east"
REGION="us-east4" # Ashburn, Virginia
ZONE="us-east4-a"
ENV=${1:-dev}

case $ENV in
    dev)
        GCLOUD_PROJECT=dev-mantic-markets
        ;;
    prod)
        GCLOUD_PROJECT=mantic-markets
        ;;
    *)
        echo "Invalid environment; must be dev or prod."
        exit 1
esac

echo "Adding named port ${PORT_NAME}:${PORT}"
CURRENT_PORTS=$(gcloud compute instance-groups unmanaged get-named-ports \
    ${SERVICE_GROUP} \
    --zone=${ZONE} \
    --format="value(name, port)" \
    | tr "\t" ":" | tr '\n' ',')

ALL_PORTS="${CURRENT_PORTS}${PORT_NAME}:${PORT}"

gcloud compute instance-groups unmanaged set-named-ports \
    ${SERVICE_GROUP} \
    --project=${GCLOUD_PROJECT} \
    --named-ports=${ALL_PORTS} \
    --zone=${ZONE}

HEALTH_CHECK_NAME="${BACKEND_NAME}-health-check"

echo "Creating health check"
gcloud compute health-checks create tcp ${HEALTH_CHECK_NAME} \
    --project=${GCLOUD_PROJECT} \
    --port-name ${PORT_NAME} \
    --global


# backend type instance group
echo "Creating backend service ${BACKEND_NAME}"
gcloud compute backend-services create ${BACKEND_NAME} \
    --project ${GCLOUD_PROJECT} \
    --global \
    --description "${DESCRIPTION}" \
    --load-balancing-scheme "EXTERNAL_MANAGED" \
    --protocol "HTTP" \
    --port-name ${PORT_NAME} \
    --timeout 86400 \
    --enable-cdn \
    --cache-mode "USE_ORIGIN_HEADERS" \
    --health-checks ${HEALTH_CHECK_NAME} \
    --enable-logging
#    --ip-address-selection-policy "IPV4_ONLY" \


echo "Adding backend service ${BACKEND_NAME} to ${SERVICE_GROUP} in ${ZONE}..."
gcloud compute backend-services add-backend ${BACKEND_NAME} \
    --project ${GCLOUD_PROJECT} \
    --instance-group ${SERVICE_GROUP} \
    --instance-group-zone ${ZONE} \
    --global \
    --balancing-mode UTILIZATION
