# API deployment readiness

All API deploy entry points use `deploy-rollout.cjs`. The API MIG currently has
one VM. Its autohealing check uses `/healthz/live`, which intentionally succeeds
while caches warm. That check cannot authorize deletion of the old VM. The
external Application Load Balancer returns 503 when no backend is ready.

The helper checks that every backend attached to the group uses `/healthz/ready`,
pauses the autoscaler if present, sets the update policy to opportunistic, and adds a second VM using the new
template. It retains the old VM until the replacement is running and HEALTHY in
every attached backend service, including the three read ports and websockets.
Only then does it delete the old VM by name, verify readiness again, and restore
the proactive update policy and the original autoscaling mode. It does not change the autohealing health check.

The helper requires a single-VM MIG with either no autoscaler or an autoscaler
pinned to min=max=1 (the current production configuration). If that
topology changes, update the rollout procedure before deploying.

## Failure and recovery

Readiness has a 15-minute deadline. If warmup, a health check, or a gcloud command
fails before old-VM deletion, the helper exits unsuccessfully and leaves the old
VM in place. It deliberately does not restore proactive updates in a failure
handler: that could delete the old VM based on early liveness. A stopped rollout
can therefore leave two VMs, an opportunistic update policy, and autoscaling OFF.

Inspect the instance group and logs, resolve the startup failure, then retry the
helper with the **same template and original autoscaling mode** from the recovery
command printed before any infrastructure changes. For production this is:

```sh
node deploy-rollout.cjs mantic-markets us-east4-a api-group-east TEMPLATE ON
```

Omit the final argument for groups without an autoscaler. This resumes a two-VM rollout, or verifies a one-VM rollout interrupted after
deletion. Do not resize a two-VM group down arbitrarily: that could delete the
healthy replacement. If the group or template changed independently, the helper
stops for manual inspection rather than guessing which VM to remove.

Run `./update-health-checks.sh prod` (or `dev`) to apply the separate liveness
timing change: 10-second checks and six consecutive failures. Readiness retains
5-second checks and three failures. Deploying the image alone does not change
these infrastructure settings.
