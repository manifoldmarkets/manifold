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

# HTTP check against /healthz/ready (not TCP). A TCP check only proves the port
# is open, so a process that's alive but wedged/saturated keeps passing and the
# LB keeps routing to it. /healthz/ready reports 503 from local pool state (no
# db query) when the instance is saturated, so the LB drains it. The endpoint
# never hangs, and GCP fails open if every backend is unhealthy at once.
#
# unhealthy-threshold is deliberately > healthy-threshold: slow to pull an
# instance out (avoid flapping on a brief burst), quick to put it back.
echo "Creating health check"
gcloud compute health-checks create http ${HEALTH_CHECK_NAME} \
    --project=${GCLOUD_PROJECT} \
    --port-name ${PORT_NAME} \
    --request-path /healthz/ready \
    --check-interval 5s \
    --timeout 5s \
    --healthy-threshold 2 \
    --unhealthy-threshold 3 \
    --global


# Health-check protocol note: a backend service can't switch an existing
# check's protocol in place, so converting the existing prod read services from
# the old TCP checks to the HTTP /healthz/ready checks means creating new HTTP
# checks and re-pointing each service (one-time; the old TCP checks can be
# deleted afterwards once nothing references them):
#
#   for i in 0 1 2; do
#     gcloud compute health-checks create http api-lb-read-service-$i-http-health-check \
#       --project mantic-markets --global \
#       --port-name read-$i --request-path /healthz/ready \
#       --check-interval 5s --timeout 5s \
#       --healthy-threshold 2 --unhealthy-threshold 3
#     gcloud compute backend-services update api-lb-read-service-$i \
#       --project mantic-markets --global \
#       --health-checks api-lb-read-service-$i-http-health-check
#   done
#
# The default api-lb-service (write process + /ws websockets) can be converted
# the same way and benefits equally — readiness is independent of the long
# backend-service timeout that /ws needs, so this is safe:
#
#   gcloud compute health-checks create http api-lb-service-http-health-check \
#     --project mantic-markets --global \
#     --port-name http --request-path /healthz/ready \
#     --check-interval 5s --timeout 5s \
#     --healthy-threshold 2 --unhealthy-threshold 3
#   gcloud compute backend-services update api-lb-service \
#     --project mantic-markets --global \
#     --health-checks api-lb-service-http-health-check

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
    --compression-mode "AUTOMATIC" \
    --no-serve-while-stale \
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
