import { RequestHandler, Response } from 'express'
import { apiProducers, ProducerDrain } from 'shared/helpers/producer-drain'

// Leave headroom below PM2's explicit 8s kill_timeout and Docker's default
// 10s stop budget. The final Redis marker has its own 500ms upper bound.
export const PRODUCER_DRAIN_TIMEOUT_MS = 6_000

const requestPhases = new WeakMap<Response, 'validation' | 'producer'>()

// Only endpoint wrappers that can prove no business handler has run may mark
// validation. Raw handlers remain producers by default, including on 4xx errors.
export function setRequestPhase(
  response: Response,
  phase: 'validation' | 'producer'
) {
  requestPhases.set(response, phase)
}

export function trackRequest(
  handler: RequestHandler,
  producers = apiProducers
): RequestHandler {
  return (req, res, next) => {
    // Check synchronously before auth, database access, or other async work.
    if (producers.draining) {
      res.setHeader('Retry-After', '1')
      res.setHeader('Cache-Control', 'no-store')
      res.status(503).json({ message: 'Server is restarting. Please retry.' })
      return
    }
    void producers
      .track(async () => {
        await handler(req, res, (error?: unknown) => {
          if (error && requestPhases.get(res) !== 'validation')
            producers.recordFailure()
          next(error)
        })
        if (res.statusCode >= 500 && requestPhases.get(res) !== 'validation')
          producers.recordFailure()
      })
      .catch(next)
  }
}

/** One shutdown operation even if SIGINT and SIGTERM arrive repeatedly. */
export function createShutdown({
  producers = apiProducers,
  timeoutMs = PRODUCER_DRAIN_TIMEOUT_MS,
  stopAcceptingSockets,
  announce,
  exit,
  report,
}: {
  producers?: ProducerDrain
  timeoutMs?: number
  stopAcceptingSockets: () => void
  announce: () => Promise<boolean>
  exit: () => void
  report: (drained: boolean, announced: boolean) => void
}) {
  let stopping: Promise<void> | undefined
  return () => {
    if (stopping) return stopping
    producers.stopAccepting()
    stopAcceptingSockets()
    stopping = (async () => {
      let drained = false
      let announced = false
      try {
        drained = await producers.waitForIdle(timeoutMs)
        // Never publish a final count on timeout: active work can still emit.
        if (drained && producers.complete) announced = await announce()
      } finally {
        report(drained, announced)
        exit()
      }
    })()
    return stopping
  }
}
