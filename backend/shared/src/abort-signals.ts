// Combining AbortSignals, without AbortSignal.any.
//
// Deliberately a leaf module with no imports. Node 22 has AbortSignal.any at
// runtime, but it is absent from the lib types this project compiles against,
// and widening `lib` to reach one static method would change type resolution
// for every file in the repo. This is the same contract in ten lines.

/**
 * A signal that aborts as soon as ANY of its inputs does.
 *
 * Undefined inputs are ignored, so a caller that has no cancellation of its own
 * can pass one through without branching. Listeners are registered `once` and
 * the combined signal is not retained by its inputs beyond the first abort, so
 * this is safe to call per request on a hot path.
 */
export const anySignal = (
  ...signals: (AbortSignal | undefined)[]
): AbortSignal => {
  const controller = new AbortController()
  const present = signals.filter((s): s is AbortSignal => s != null)

  const abort = (reason: unknown) => {
    controller.abort(reason)
    for (const s of present) s.removeEventListener('abort', handlers.get(s)!)
  }
  const handlers = new Map<AbortSignal, () => void>()

  for (const s of present) {
    if (s.aborted) {
      controller.abort(s.reason)
      return controller.signal
    }
    const handler = () => abort(s.reason)
    handlers.set(s, handler)
    s.addEventListener('abort', handler, { once: true })
  }
  return controller.signal
}
