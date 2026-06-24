#!/bin/bash

# This script will update the API server to use autoscaling based on CPU utilization.
# Update these values then run this script for the changes to take effect.
# These actions should be idempotent, so running it multiple times is reasonably safe.

set -e

if [ -z "$1" ]; then
    echo "Usage: the first argument should be 'dev' or 'prod'"
    exit 1
fi

# Make sure these are the same as deploy.sh
SERVICE_NAME="api"
SERVICE_GROUP="${SERVICE_NAME}-group-east"
ZONE="us-east4-a"
ENV=${1:-dev}

case $ENV in
    dev)
        GCLOUD_PROJECT=dev-mantic-markets
        MIN_REPLICAS=1
        MAX_REPLICAS=2
        TARGET_CPU_UTILIZATION=0.60
        COOL_DOWN_PERIOD=180 ;;
    prod)
        GCLOUD_PROJECT=mantic-markets
        MIN_REPLICAS=1
        MAX_REPLICAS=2
        TARGET_CPU_UTILIZATION=0.60
        COOL_DOWN_PERIOD=180 ;;
    *)
        echo "Invalid environment; must be dev or prod."
        exit 1
esac

echo "Updating scaling config for ${SERVICE_GROUP} in ${GCLOUD_PROJECT}/${ZONE}"
echo "Autoscaling: min=${MIN_REPLICAS}, max=${MAX_REPLICAS}, target CPU=${TARGET_CPU_UTILIZATION}, cooldown=${COOL_DOWN_PERIOD}s"

# Autoscaling requires the MIG to repair failed VMs. If this is set to DO_NOTHING,
# gcloud returns: "Setting DO_NOTHING in default action on failure and using autoscaler is not supported".
# (The old config was set to DO_NOTHING.)
echo
echo "Ensuring ${SERVICE_GROUP} repairs failed VMs before enabling autoscaling"
gcloud compute instance-groups managed update ${SERVICE_GROUP} \
        --project ${GCLOUD_PROJECT} \
        --zone ${ZONE} \
        --default-action-on-vm-failure repair

echo
echo "Ensuring autoscaling is enabled"
gcloud compute instance-groups managed set-autoscaling ${SERVICE_GROUP} \
        --project ${GCLOUD_PROJECT} \
        --zone ${ZONE} \
        --min-num-replicas ${MIN_REPLICAS} \
        --max-num-replicas ${MAX_REPLICAS} \
        --target-cpu-utilization ${TARGET_CPU_UTILIZATION} \
        --cool-down-period ${COOL_DOWN_PERIOD}

echo
echo "Scaling config updated. Current MIG status:"
gcloud compute instance-groups managed describe ${SERVICE_GROUP} \
        --project ${GCLOUD_PROJECT} \
        --zone ${ZONE} \
        --format="yaml(targetSize,autoscaler,status)"
