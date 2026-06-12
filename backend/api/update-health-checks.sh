#!/bin/bash

# Switch API health checks from TCP port-open checks to HTTP endpoint checks.
#
# Usage:
#   ./update-health-checks.sh dev
#   ./update-health-checks.sh prod
#
# Important split:
# - MIG autohealing uses /healthz/live so saturated-but-live instances are not restarted.
# - Load balancer backend services use /healthz/ready so saturated instances are drained.

set -euo pipefail

if [ -z "${1:-}" ]; then
    echo "Usage: the first argument should be 'dev' or 'prod'"
    exit 1
fi

SERVICE_GROUP="api-group-east"
ZONE="us-east4-a"
ENV=${1:-dev}
INITIAL_DELAY=300

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
        ;;
esac

create_or_update_http_health_check() {
    local name=$1
    local port_name=$2
    local request_path=$3

    if gcloud compute health-checks describe "${name}" \
        --project "${GCLOUD_PROJECT}" \
        --global \
        --format="value(type)" >/dev/null 2>&1; then
        local type
        type=$(gcloud compute health-checks describe "${name}" \
            --project "${GCLOUD_PROJECT}" \
            --global \
            --format="value(type)")

        if [ "${type}" != "HTTP" ]; then
            echo "Health check ${name} already exists but is ${type}, not HTTP."
            echo "Refusing to mutate protocol in place. Use a new name or delete the old check if safe."
            exit 1
        fi

        echo "Updating HTTP health check ${name} -> ${port_name}${request_path}"
        gcloud compute health-checks update http "${name}" \
            --project "${GCLOUD_PROJECT}" \
            --global \
            --port-name "${port_name}" \
            --request-path "${request_path}" \
            --check-interval 5s \
            --timeout 5s \
            --healthy-threshold 2 \
            --unhealthy-threshold 3
    else
        echo "Creating HTTP health check ${name} -> ${port_name}${request_path}"
        gcloud compute health-checks create http "${name}" \
            --project "${GCLOUD_PROJECT}" \
            --global \
            --port-name "${port_name}" \
            --request-path "${request_path}" \
            --check-interval 5s \
            --timeout 5s \
            --healthy-threshold 2 \
            --unhealthy-threshold 3
    fi
}

update_backend_service_health_check() {
    local service_name=$1
    local health_check_name=$2

    if ! gcloud compute backend-services describe "${service_name}" \
        --project "${GCLOUD_PROJECT}" \
        --global \
        --format="value(name)" >/dev/null 2>&1; then
        echo "Skipping backend service ${service_name}; it does not exist in ${GCLOUD_PROJECT}."
        return
    fi

    echo "Updating backend service ${service_name} to use ${health_check_name}"
    gcloud compute backend-services update "${service_name}" \
        --project "${GCLOUD_PROJECT}" \
        --global \
        --health-checks "${health_check_name}"
}

echo "Updating API health checks in ${GCLOUD_PROJECT} (${ENV})"

echo
echo "Creating/updating liveness health check for MIG autohealing"
create_or_update_http_health_check "api-live-health-check" "http" "/healthz/live"

echo
echo "Creating/updating readiness health checks for load balancer backend services"
create_or_update_http_health_check "api-ready-health-check" "http" "/healthz/ready"
for i in 0 1 2; do
    create_or_update_http_health_check "api-lb-read-service-${i}-http-health-check" "read-${i}" "/healthz/ready"
done

echo
echo "Updating MIG autohealing to use liveness check"
gcloud beta compute instance-groups managed set-autohealing "${SERVICE_GROUP}" \
    --project "${GCLOUD_PROJECT}" \
    --zone "${ZONE}" \
    --health-check "api-live-health-check" \
    --initial-delay "${INITIAL_DELAY}"

echo
echo "Updating load balancer backend services to use readiness checks"
update_backend_service_health_check "api-lb-service" "api-ready-health-check"
update_backend_service_health_check "api-websocket-lb-backend" "api-ready-health-check"
for i in 0 1 2; do
    update_backend_service_health_check "api-lb-read-service-${i}" "api-lb-read-service-${i}-http-health-check"
done

echo
echo "Done. Current MIG autohealing policy:"
gcloud compute instance-groups managed describe "${SERVICE_GROUP}" \
    --project "${GCLOUD_PROJECT}" \
    --zone "${ZONE}" \
    --format "yaml(autoHealingPolicies,namedPorts)"

echo
echo "Current backend service health checks:"
gcloud compute backend-services list \
    --project "${GCLOUD_PROJECT}" \
    --global \
    --format "table(name,portName,healthChecks.basename())"
