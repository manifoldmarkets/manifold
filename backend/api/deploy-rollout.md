# API deployment

All API deploy entry points (`deploy-api.sh`, `deploy-api-windows.sh`,
`deploy-dev-windows.ps1`) build a template and hand it to `deploy-rollout.cjs`.
The API MIG has one VM: one writer process (HTTP writes and `/ws`) and three
read replicas. Its autohealing check uses `/healthz/live`, which succeeds while
caches warm, so it cannot authorize deleting the old VM. The external
Application Load Balancer returns 503 when no backend is ready.

## How a rollout works

1. Check that every backend service attached to the group (write, websocket and
   the three read ports) uses `/healthz/ready`, and that any autoscaler is pinned
   to min=max=1. The helper refuses other topologies.
2. Switch the group to opportunistic updates with the new template, pause the
   autoscaler, and add a second VM.
3. Wait until the replacement is running and HEALTHY in every backend service.
   Both writers serve during this overlap.
4. Record the coming handover on the replacement, delete the old VM by name,
   and wait until Compute no longer lists it.
5. Tell the replacement's writer the old VM is gone (instance metadata
   `api-websocket-handover`; see below).
6. Verify the final VM in every backend, then restore the original autoscaling
   mode and the proactive update policy.

The helper does not change health checks. Run `./update-health-checks.sh prod`
(or `dev`) separately to apply the liveness timing: 10-second checks and six
failures. Readiness keeps 5-second checks and three failures.

## WebSocket delivery while two writers serve

During the overlap the load balancer sends writes and new sockets to either
writer, and each writer delivers broadcasts to its own sockets. In production
the writers also relay every broadcast to each other through the existing
Memorystore instance (`REDIS_URL`), so a socket on either VM receives both
writers' events.

Redis pub/sub delivers at most once, so each writer numbers its broadcasts,
sends a heartbeat with its count every five seconds, and announces its last
count when PM2 stops it. When the deploy reports the old VM gone, the surviving
writer keeps its connections only if it received every broadcast the retired
writer numbered, through its shutdown announcement. Otherwise it closes all of
its connections with code 1012, so clients reconnect and backfill. That happens
when:

- the retired writer predates this relay (the first production rollout),
- Redis is not configured (dev) or was unreachable during the overlap,
- a relayed broadcast was lost, or
- the retired writer stopped without announcing it (a crash or a kill).

The relay is best effort. Readiness never depends on Redis, broadcasts are
never queued or delayed waiting for it, and a Redis outage outside a deploy
changes nothing for clients. Sockets on the old VM always disconnect when it is
deleted.

## Failures and recovery

The helper rolls back by itself when the replacement does not become ready:

- in every backend within 15 minutes, or
- in the remaining backends within 3 minutes of becoming ready in some (while
  it serves some backends, two writers are already live).

A rollback first checks that the old VM is still ready in every backend, then
retargets the group to the old template, deletes the replacement by name, tells
the old writer about the handover, and restores the original autoscaling mode
and proactive updates. It then exits with an error naming the cause. If the old
VM is not ready, it deletes nothing and stops.

Other failures stop the helper without rolling back: the group, its template or
its instances changing underneath the rollout, a gcloud command failing outside
a wait, or a problem after the old VM was deleted. Failed gcloud calls inside a
wait count as "not ready yet" until the deadline.

To resume, run the recovery command printed at the start, which names the same
template and the original autoscaling mode. For production:

```sh
node deploy-rollout.cjs mantic-markets us-east4-a api-group-east TEMPLATE ON
```

A rollback prints its own recovery command, naming the old template. Omit the
final argument for groups without an autoscaler. A rerun resumes a two-VM
rollout, finishes a handover interrupted after the deletion, or just verifies a
finished rollout. The autoscaler is only paused while the update policy is
opportunistic, and the helper refuses to continue an opportunistic group
without the original mode, since the live mode may be its own pause.

Do not resize a two-VM group down by hand: that could delete the healthy VM. If
the group changed independently, the helper stops rather than guess which VM to
remove.

## First production rollout from the current writer

No maintenance window is needed. The running writer predates the relay and the
handover watcher, so during that overlap each VM's sockets receive only its own
VM's events. Its sockets disconnect when it is deleted, as with every earlier
deploy, and the new writer then closes its own connections once with 1012. If
that first rollout fails and rolls back, the old writer cannot act on the
handover signal: sockets that stayed on it get no signal for events the
replacement sent during the overlap.

The operator's gcloud account needs to describe, list and set metadata on
Compute instances, in addition to the instance group and backend service access
deploys already use.

## Dev

Dev has no Redis, so every dev rollout ends with the surviving writer closing
its connections once with 1012.

## Client-facing change note

Publish after the first production rollout is confirmed.

|                              | Before                                                                                                         | After                                                                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduled disconnects        | Daily at 08:00 UTC the API restarted. All sockets dropped and the API was often unavailable for 2–3.5 minutes. | None.                                                                                                                                                                  |
| Deploy disconnects           | Sockets on the old VM dropped when it was removed.                                                             | Same. Sockets on the new VM may also get one 1012 close after the old VM is gone, if delivery from it cannot be verified (always on the first rollout of this change). |
| Events missed during deploys | Both VMs served for a while. A socket received only its own VM's events, with no signal.                       | Production VMs relay events to each other. A socket that may have missed any is closed with 1012.                                                                      |
| Other disconnects            | Crashes, network, the load balancer's 24-hour connection limit, 60–120 s without a ping.                       | Unchanged.                                                                                                                                                             |
| What clients must do         | Reconnect, resubscribe and backfill.                                                                           | Unchanged. Reconnect after any close except 1000, resubscribe, and backfill over HTTP after every reconnect: events sent while disconnected are not replayed.          |
