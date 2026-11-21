// What this helper needs from the browser, injectable so tests can pass fakes.
export type VisibleIntervalEnv = {
  doc: {
    readonly hidden: boolean
    addEventListener(type: 'visibilitychange', listener: () => void): void
    removeEventListener(type: 'visibilitychange', listener: () => void): void
  }
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
}

const browserEnv = (): VisibleIntervalEnv => ({
  doc: document,
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id as number),
})

/**
 * A setInterval that stops while the tab is hidden.
 *
 * While `document.hidden` is true, `fn` never runs. When the tab becomes
 * visible again, `fn` runs once right away (the data may be minutes old) and
 * the period restarts from then, so the catch-up call is not followed a moment
 * later by a scheduled one.
 *
 * Returns a cleanup that clears the timer and the listener. It does not call
 * `fn` on start: callers decide whether to fetch immediately.
 */
export function setVisibleInterval(
  fn: () => void,
  ms: number,
  env: VisibleIntervalEnv = browserEnv()
): () => void {
  const { doc } = env
  let id: unknown = undefined
  const stop = () => {
    if (id !== undefined) env.clearInterval(id)
    id = undefined
  }
  const start = () => {
    stop()
    id = env.setInterval(() => {
      // Belt and braces: a tick queued just before the tab hid can fire
      // before the visibilitychange listener runs.
      if (!doc.hidden) fn()
    }, ms)
  }
  const onVisibilityChange = () => {
    if (doc.hidden) {
      stop()
    } else if (id === undefined) {
      fn()
      start()
    }
  }

  if (!doc.hidden) start()
  doc.addEventListener('visibilitychange', onVisibilityChange)
  return () => {
    stop()
    doc.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
