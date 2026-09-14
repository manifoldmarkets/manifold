# API deployment and WebSocket continuity

The normal production topology is one VM: one writer/WebSocket process and
three read processes. Removing PM2's 08:00 UTC restart keeps the writer running
while its user-interest cache refreshes. Deployments and process failures can
still interrupt connections; this is not an event replay or exactly-once system.

## Normal deployments

All three API deploy entrypoints use `deploy-rollout.cjs`. Before changing the
MIG, it checks every attached backend uses `/healthz/ready` and reads the current
VM's container configuration and the replacement template. An overlapping
rollout requires **both** writers to use the same Redis URL and broadcast
environment/channel, with `REQUIRE_REDIS_BROADCASTS=true` on both. Merely setting
Redis on the new VM cannot share events from an old writer that has it disabled.

The production scripts use the existing Memorystore instance for broadcasts.
`DISABLE_REDIS_CACHE=true` remains set: shared broadcasts and the L2 data cache
are independent. `REDIS_URL` can override the deployment default, but changing
servers/channels requires the maintenance procedure below.

Writer readiness requires warm caches, a connected Redis publisher, and an
acknowledged subscription. Losing either Redis connection withdraws writer
readiness and disconnects existing WebSocket clients so they reconnect and
reconcile, rather than silently continuing with a partial feed. Read processes
do not require Redis connections. **Redis is now an availability dependency for
the writer**; a Redis outage can interrupt write requests and WebSockets even
while read endpoints continue serving. Pub/Sub remains best-effort, not durable.

The helper pauses the autoscaler, switches the update policy to opportunistic,
and adds the replacement. It keeps the old VM until the replacement is running
and HEALTHY in every attached backend, then deletes the old VM by name, verifies
final health, and restores proactive updates and the original autoscaler mode.
It requires either no autoscaler or one pinned to min=max=1.

Existing WebSockets on the old VM still disconnect when it is deleted. Clients
must retain heartbeat, reconnect, resubscription, and HTTP reconciliation logic.
The global external Application Load Balancer also closes active WebSockets at
24 hours; removing the scheduled restart does not remove that limit.

## First deployment: explicit maintenance window

Production was verified on 2026-09-14 to have Redis disabled on its current
writer. It cannot safely overlap with a new writer. The default deploy refuses
this transition **before changing the MIG**, although image/template creation
may already have finished. Do not enable the new requirement on a legacy image
that does not implement broadcast readiness.

For the first deployment, arrange an API maintenance window and explicitly opt
in to stopping the old VM first:

```sh
ALLOW_DISRUPTIVE_BOOTSTRAP=true ./deploy-api.sh prod
# Git Bash on Windows:
ALLOW_DISRUPTIVE_BOOTSTRAP=true ./deploy-api-windows.sh prod
```

The helper logs the old VM name, deletes it, and waits for it to disappear from
both the MIG and the Compute VM inventory before creating the new VM. This
**interrupts HTTP and WebSocket service for the replacement's full startup**;
allow minutes and do not promise a fixed duration. A failed replacement can
extend the maintenance outage. Once the new version is healthy, ordinary future
deployments use shared broadcasts and do not need this flag.

For a dev deployment without Redis, each replacement requires this explicit
stop-first mode. Alternatively provide a shared `REDIS_URL` to enable overlapping
deployments after the first migration. PowerShell accepts the same environment
variables, for example `$env:ALLOW_DISRUPTIVE_BOOTSTRAP = 'true'` before running
`deploy-dev-windows.ps1`; remove the variable afterward.

## Failure and recovery

Readiness waits have a 15-minute deadline. Before old-VM deletion, a failed
normal rollout leaves both VMs, autoscaling OFF, and an opportunistic update
policy. Both writers must already have matching shared broadcasts for this state
to be allowed. Do not restore proactive updates or arbitrarily resize to one:
either action could remove the healthy old VM.

Resolve the failure, then retry the helper with the **same template and original
autoscaling mode**, using the recovery command printed by the deploy. In prod:

```sh
node deploy-rollout.cjs mantic-markets us-east4-a api-group-east TEMPLATE ON
```

This also verifies a completed replacement and restores policies after an
interruption following old-VM removal. Omit `ON` only for groups without an
autoscaler. If the new VM is still starting, wait for the MIG to stabilize before
retrying. A changed template/group configuration stops for manual inspection.

An interrupted **maintenance bootstrap** can instead leave target size zero.
Use the logged old VM name to verify it is completely absent from Compute, and
verify the MIG still targets the intended template with autoscaling OFF and
opportunistic updates. Only then manually resize to one:

```sh
gcloud compute instances list --project=mantic-markets --zones=us-east4-a --filter='name=OLD_VM'
gcloud compute instance-groups managed describe api-group-east --project=mantic-markets --zone=us-east4-a
# After confirming the conditions above:
gcloud compute instance-groups managed resize api-group-east --project=mantic-markets --zone=us-east4-a --size=1
gcloud compute instance-groups managed wait-until --stable api-group-east --project=mantic-markets --zone=us-east4-a
node deploy-rollout.cjs mantic-markets us-east4-a api-group-east TEMPLATE ON
```

If the new image or Redis configuration is broken, repair it or deliberately roll
back to a known-good template under the maintenance window. Never report success
while any backend is unhealthy. The helper does not automatically roll back.

## Separate liveness configuration

Run `./update-health-checks.sh prod` (or `dev`) to apply 10-second liveness checks
with six failed probes before VM repair. Readiness retains 5-second checks and
three failures. Deploying the image alone does not change these settings.

## Client-facing change note (after deployment is confirmed)

We replaced the scheduled 08:00 UTC API restart with background cache
maintenance, removing that scheduled source of API unavailability and WebSocket
disconnections. No API or subscription changes are required. Keep existing
heartbeat, reconnect, resubscription, and data-reconciliation logic: deployments,
faults, and connection time limits can still interrupt connections. Event replay
and delivery guarantees are unchanged. The initial migration has a separately
announced maintenance window.
