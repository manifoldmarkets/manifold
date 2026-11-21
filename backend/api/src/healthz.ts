import { RequestHandler } from 'express'
import { createSupabaseDirectClient } from 'shared/supabase/init'

// Liveness: is this process up with a responsive event loop? Used for restart
// decisions. Deliberately does NOT touch the db or the connection pool — a
// live-but-saturated instance should be drained, not killed and restarted
// (restart just throws away warm caches and stampedes the db again).
export const healthzLive: RequestHandler = (_req, res) => {
  res.status(200).json({ status: 'ok' })
}

// How saturated this process's pg pool must be before we ask the LB to stop
// sending us new traffic: every pooled connection busy AND at least this many
// requests already queued waiting for one. The small queue allowance avoids
// flapping on a single in-flight burst.
const READY_MAX_WAITING = 5

// Readiness: should the load balancer route new requests to this instance right
// now? We report not-ready purely from local pool state and run NO db query, so
// a db-wide slowdown can never make the check itself hang. This is per-instance
// backpressure: a hot instance sheds load onto cooler ones.
//
// On the failure mode this is meant to survive — every instance saturating at
// once during a true db-wide pin — GCP health checking fails open: when all
// backends in a service are unhealthy it routes to all of them anyway. So the
// worst case degrades to today's behaviour rather than a full blackout, and the
// common case (one wedged instance) gets traffic pulled off it automatically.
export const healthzReady: RequestHandler = (_req, res) => {
  const pool = createSupabaseDirectClient().$pool
  const { idleCount, waitingCount } = pool
  const saturated = idleCount === 0 && waitingCount > READY_MAX_WAITING
  res.status(saturated ? 503 : 200).json({
    status: saturated ? 'saturated' : 'ok',
  })
}
