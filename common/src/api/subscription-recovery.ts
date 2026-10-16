// A snapshot is fetched without changing UI state; the returned commit is only
// invoked if this connection, subscription and its live data are still current.
export type RecoverySnapshot = (
  signal: AbortSignal
) => Promise<() => void | boolean>

const RETRY_MS = 1000
const TIMEOUT_MS = 10_000

export class SubscriptionRecovery {
  private generation = 0
  private revision = 0
  private connected = false
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
    this.stop()
    this.connected = connected
    if (connected) void this.fetch()
  }

  stop() {
    this.connected = false
    this.generation++
    this.controller?.abort()
    clearTimeout(this.retry)
    clearTimeout(this.timeout)
  }

  private scheduleRetry() {
    if (this.connected)
      this.retry = setTimeout(() => void this.fetch(), RETRY_MS)
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
