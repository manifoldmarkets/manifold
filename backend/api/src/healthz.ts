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

// Whether startup cache init has finished. The server starts listening before
// initCaches so liveness answers within seconds of a process restart;
// readiness holds off the LB until the caches are warm.
let cachesLoaded = false
export const markCachesLoaded = () => {
  cachesLoaded = true
}

// Readiness: should the load balancer route new requests to this instance right
// now? We report not-ready purely from local pool state and run NO db query, so
// a db-wide slowdown can never make the check itself hang. This is per-instance
// backpressure: a hot instance sheds load onto cooler ones.
//
// The external Application Load Balancer returns 503 if all backends are
// unhealthy. Deployments must retain the old VM until the replacement passes
// this check on every serving port, not just the MIG's liveness check.
export const healthzReady: RequestHandler = (_req, res) => {
  if (!cachesLoaded) {
    res.status(503).json({ status: 'warming' })
    return
  }
  const pool = createSupabaseDirectClient().$pool
  const { idleCount, waitingCount } = pool
  const saturated = idleCount === 0 && waitingCount > READY_MAX_WAITING
  res.status(saturated ? 503 : 200).json({
    status: saturated ? 'saturated' : 'ok',
  })
}
