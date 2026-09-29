#!/bin/bash
#
# Boot-time launcher for a single Docker container on a Container-Optimized OS
# (COS) VM. Replaces the deprecated GCE "container startup agent" (konlet),
# which read the `gce-container-declaration` metadata key and ran the container
# for us. That agent is shut down for new VMs as of 2026-07-31:
#   Deprecation notice: https://cloud.google.com/compute/docs/deprecations/container-startup-agent-on-compute
#   Migration guide:    https://cloud.google.com/compute/docs/containers/migrate-containers
#
# The deploy scripts (backend/api/deploy-api.sh, backend/scheduler/deploy-scheduler.sh
# and their -windows variants) attach this file as the VM's `startup-script`
# metadata and pass the container config in three more metadata keys, so this
# file is the same for every service and never changes per deploy:
#   container-image  full image URL, e.g. us-east4-docker.pkg.dev/<project>/builds/api:<tag>
#   container-name   docker container name (the service name)
#   container-env    KEY=VALUE, one per line
#
# Startup scripts run as root on every boot:
#   https://cloud.google.com/compute/docs/instances/startup-scripts/linux
# To re-run it on a live VM without rebooting (e.g. after add-metadata):
#   sudo google_metadata_script_runner startup
# Metadata is read from the metadata server:
#   https://cloud.google.com/compute/docs/metadata/querying-metadata
#
# This reproduces what the old agent did (checked against the running VMs):
#   - host networking, restart=always, json-file logs rotated at 3 x 500 MB
#   - inbound TCP/UDP allowed through the COS host firewall (default policy DROP)
#   - image pulled from Artifact Registry with the VM's service account
# Container logs keep flowing to Cloud Logging: the COS logging agent tails the
# json-file logs of every container when `google-logging-enabled=true` is set.
#   https://cloud.google.com/container-optimized-os/docs/how-to/logging

set -euo pipefail

MD_URL="http://metadata.google.internal/computeMetadata/v1/instance/attributes"
md() { curl -sf -H 'Metadata-Flavor: Google' "${MD_URL}/$1"; }

IMAGE=$(md container-image)
NAME=$(md container-name)
ENV_LINES=$(md container-env)

echo "cos-container-startup: launching ${NAME} from ${IMAGE}"

# COS ships iptables with INPUT policy DROP. With --network host nothing
# publishes ports, so open TCP/UDP inbound the way the agent did. The GCP VPC
# firewall rules (network tags) still apply in front of this.
#   https://cloud.google.com/container-optimized-os/docs/how-to/create-configure-instance#host_firewall
for proto in tcp udp; do
    iptables -w -C INPUT -p "${proto}" -j ACCEPT 2>/dev/null \
        || iptables -w -A INPUT -p "${proto}" -j ACCEPT
done

# Authenticate docker to Artifact Registry / GCR with the VM service account.
# docker-credential-gcr ships with COS. /root is on the read-only rootfs, so
# point the docker CLI config at the writable stateful partition instead.
#   https://cloud.google.com/artifact-registry/docs/docker/authentication#standalone-helper
#   https://cloud.google.com/container-optimized-os/docs/how-to/run-container-instance
export DOCKER_CONFIG=/var/lib/docker-config
mkdir -p "${DOCKER_CONFIG}"
docker-credential-gcr configure-docker --registries=us-east4-docker.pkg.dev,gcr.io

# Housekeeping: drop images no container uses (the scheduler deploy script used
# to do this over SSH). Runs before the pull so a full disk can't block it.
docker image prune -af >/dev/null || true

docker pull "${IMAGE}"

ENV_ARGS=()
while IFS= read -r line; do
    line=${line%$'\r'}
    if [ -n "${line}" ]; then
        ENV_ARGS+=(--env "${line}")
    fi
done <<< "${ENV_LINES}"

# Replace whatever is running. On a plain reboot docker's restart policy will
# already have brought the previous container back up; `stop` sends SIGTERM
# and waits (pm2 / node shut down cleanly), unlike `rm -f`.
if [ -n "$(docker ps -aq --filter "name=^${NAME}$")" ]; then
    docker stop "${NAME}" || true
    docker rm "${NAME}" || true
fi

# Same runtime settings the container startup agent used.
docker run --detach \
    --name "${NAME}" \
    --network host \
    --restart always \
    --log-driver json-file \
    --log-opt max-size=500m \
    --log-opt max-file=3 \
    --log-opt tag='{{.Name}}' \
    "${ENV_ARGS[@]}" \
    "${IMAGE}"

echo "cos-container-startup: ${NAME} started"
