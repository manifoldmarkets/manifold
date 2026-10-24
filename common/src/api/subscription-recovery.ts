// A snapshot is fetched without changing UI state; the returned commit is only
// invoked if this connection, subscription and its live data are still current.
export type RecoverySnapshot = (
  signal: AbortSignal
) => Promise<() => void | boolean>

const INITIAL_RETRY_MS = 1000
// The window the first read after a reconnect is spread across.
export const INITIAL_SPREAD_MS = 1000
const MAX_RETRY_MS = 30_000
const TIMEOUT_MS = 10_000

export class SubscriptionRecovery {
  private generation = 0
  private revision = 0
  private connected = false
  private retryDelay = INITIAL_RETRY_MS
  private controller?: AbortController
  private retry?: ReturnType<typeof setTimeout>
  private timeout?: ReturnType<typeof setTimeout>

  constructor(
    private snapshot: RecoverySnapshot,
    private onError: (error: Error) => void
  ) {}

  broadcast() {
    this.revision++
  }

  connectionChanged(connected: boolean) {
    // The connection notification and the local subscribe acknowledgement can
    // both report readiness. Keep an in-flight repair and its backoff intact.
    if (connected && this.connected) return
    this.stop()
    this.connected = connected
    this.retryDelay = INITIAL_RETRY_MS
    if (connected) this.scheduleFirst()
  }

  stop() {
    this.connected = false
    this.generation++
    this.controller?.abort()
    clearTimeout(this.retry)
    clearTimeout(this.timeout)
  }

  private scheduleFirst() {
    // A rollout closes every surviving socket at once, so reading here would
    // put every open page's snapshot in the same instant. Spread the first
    // read across the window instead; scheduleRetry jitters everything after
    // it. This reuses the retry timer slot, so stop() cancels either one and
    // only one read can ever be pending per instance.
    this.retry = setTimeout(
      () => void this.fetch(),
      Math.floor(Math.random() * INITIAL_SPREAD_MS)
    )
  }

  private scheduleRetry() {
    if (!this.connected) return
    // Jitter each retry so clients that failed together do not retry together,
    // and bound sustained retries to one every 24-30 seconds. Continue at that
    // rate so an open view eventually repairs even if no further reconnect or
    // visibility change occurs. scheduleFirst spreads the read before these.
    const delay = Math.round(this.retryDelay * (0.8 + 0.2 * Math.random()))
    this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS)
    this.retry = setTimeout(() => void this.fetch(), delay)
  }

  private async fetch() {
    const generation = ++this.generation
    const revision = this.revision
    const controller = new AbortController()
    this.controller = controller
    this.timeout = setTimeout(() => {
      if (generation !== this.generation) return
      this.generation++
      controller.abort()
      this.onError(new Error('Realtime recovery request timed out.'))
      this.scheduleRetry()
    }, TIMEOUT_MS)
    try {
      const commit = await this.snapshot(controller.signal)
      if (generation !== this.generation || !this.connected) return
      if (revision === this.revision) {
        // An ordinary HTTP read/local update may also supersede this snapshot.
        // Retry instead of declaring recovery complete when it could not commit.
        if (commit() === false) this.scheduleRetry()
      } else {
        // There is no shared snapshot/event watermark in this protocol. Never
        // overwrite live changes with a read that raced them, or blindly replay
        // an older buffered event over a newer database snapshot. Retry instead.
        this.scheduleRetry()
      }
    } catch (error) {
      if (generation !== this.generation || !this.connected) return
      this.onError(error instanceof Error ? error : new Error(String(error)))
      this.scheduleRetry()
    } finally {
      if (generation === this.generation) clearTimeout(this.timeout)
      // Also releases resources attached to a snapshot discarded after a live
      // update (e.g. local user-mutation tracking), not just aborted requests.
      controller.abort()
    }
  }
}
