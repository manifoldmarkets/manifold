# API deployment

All API deploy entry points (`deploy-api.sh`, `deploy-api-windows.sh`,
`deploy-dev-windows.ps1`) build a template and hand it to `deploy-rollout.cjs`.
The API MIG has one VM: one writer process (HTTP writes and `/ws`) and three
read-only API workers. Its autohealing check uses `/healthz/live`, which succeeds while
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

Redis pub/sub delivers at most once, so each writer numbers its broadcasts and
sends a heartbeat with its count every five seconds. On SIGINT or SIGTERM the
retiring process stops admitting requests and sockets, marks readiness unhealthy,
and allows up to six seconds for accepted request handlers, authentication,
post-response continuations and registered background producers to finish.
Concurrent producer branches settle before a failure escapes their parent.
Only a complete drain permits a final count; pending Redis publications and
the final marker share a further 500ms deadline. Timeout or producer failure
withholds that marker. Repeated signals reuse the same shutdown operation.
Authentication and schema failures before the business handler starts do not
invalidate the count. Once a handler starts, any failure remains conservative,
including a 4xx error after work may have been committed.

When the deploy reports the old VM gone, the surviving
writer keeps its connections only if it received every broadcast the retired
writer numbered, through its shutdown announcement. Otherwise it closes all of
its connections with code 1012, so updated clients reconnect and refetch state. That happens
when:

- the retired writer predates this relay (the first production rollout),
- Redis is not configured (dev) or was unreachable during the overlap,
- a relayed broadcast was lost, or
- the retired writer stopped without announcing it (a crash or a kill).

PM2 has an explicit eight-second `kill_timeout`. The six-second drain plus
500ms marker budget leaves process-exit headroom, but this is not proof of the
hosting platform's grace period. Before rollout, verify on the actual image and
VM that PM2 receives the shutdown signal and the writer gets at least this
budget before the container or VM forces termination. Local tests use real
HTTP/WebSocket connections with mock Redis; they do not simulate PM2/COS/VM
deletion. A forcibly interrupted transaction can have an uncertain outcome;
this protocol neither retries money-moving requests nor guarantees completion
of every accepted operation.

The relay is best effort. Readiness never depends on Redis, broadcasts are
never queued or delayed waiting for it, and a Redis outage outside a deploy
changes nothing for clients. Sockets on the old VM always disconnect when it is
deleted.

Serving does not wait for the metadata watcher to initialize. Its first
successful read therefore checks any handover value against the writer's
received broadcasts, just like a later change. If metadata was unavailable
while clients connected, recovery cannot silently discard the handover.
An older value left on the VM may conservatively close those early connections
once; connections established after that check are unaffected by repeated reads
of the same value.

## Client state recovery

The first-party client preserves healthy replacement sockets. After a disconnect
it waits for subscription acknowledgements, then refetches the state used by
active subscriptions. API snapshots bypass browser and getter caches. A read
from an obsolete connection or filter cannot commit; a live broadcast racing
the read causes a retry instead of overwriting newer state. Failed or ten-second
timed-out snapshots retry with exponential backoff and jitter, capped at one
attempt every 24-30 seconds plus request duration. Retries continue at that rate
until recovery succeeds or the subscription stops. Later mounts after a
reconnect also fetch fresh state, which can add a request alongside a consumer's
ordinary cached or incremental read. There is no shared snapshot/event watermark, so a
continuously busy topic can postpone reconciliation until a read finishes
between broadcasts. Existing list limits still apply; this is state recovery,
not an unlimited event history or exactly-once delivery protocol.

Refresh-all commands and the diagnostic event log have no retained snapshot.
The legacy GIDX redemption flow has no read-only status endpoint: after reconnect
it clears the old status and asks the user to check transaction history, without
repeating a monetary request. Dormant native-only subscription callers have not
been migrated or built as part of this change.

Ship the updated web client before relying on this fallback. An already-open
older client only reconnects and resubscribes; the server cannot upgrade its
recovery behavior. Configure and verify the shared Redis relay separately before
claiming seamless overlapping writers. An unconfigured relay deliberately falls
back to reconnection. The final count proves delivery to the surviving writer,
not acknowledgement or application by each browser.

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

The running writer may predate the relay and the
handover watcher, so during that overlap each VM's sockets receive only its own
VM's events. Its sockets disconnect when it is deleted, as with every earlier
deploy, and the new writer then closes its own connections once with 1012. If
that first rollout fails and rolls back, the old writer cannot act on the
handover signal: sockets that stayed on it get no signal for events the
replacement sent during the overlap. Plan the first rollout and rollback with
this limitation, old browser versions, Redis configuration, and the verified
host shutdown grace period in view. Do not announce seamless first-rollout
delivery from the local tests alone.

The operator's gcloud account needs to describe, list and set metadata on
Compute instances, in addition to the instance group and backend service access
deploys already use.

## Dev

Dev has no Redis, so every dev rollout ends with the surviving writer closing
its connections once with 1012.
