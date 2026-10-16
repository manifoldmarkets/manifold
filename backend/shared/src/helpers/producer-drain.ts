/** Tracks complete producer tasks, including work after an HTTP response. */
export class ProducerDrain {
  private accepting = true
  private active = 0
  private failed = false
  private readonly idleListeners = new Set<() => void>()

  get draining() {
    return !this.accepting
  }

  get pending() {
    return this.active
  }

  get complete() {
    return !this.failed
  }

  recordFailure() {
    if (this.draining) this.failed = true
  }

  stopAccepting() {
    this.accepting = false
  }

  // Child work of an accepted request may start after admission has closed.
  // Its parent must register it before returning, not from an untracked timer.
  async track<T>(work: () => Promise<T>): Promise<T> {
    this.active++
    try {
      return await work()
    } catch (error) {
      this.recordFailure()
      throw error
    } finally {
      this.active--
      if (this.active === 0) {
        for (const listener of this.idleListeners) listener()
      }
    }
  }

  waitForIdle(timeoutMs: number): Promise<boolean> {
    if (this.active === 0) return Promise.resolve(true)
    return new Promise((resolve) => {
      const finish = (idle: boolean) => {
        clearTimeout(timer)
        this.idleListeners.delete(onIdle)
        resolve(idle)
      }
      const onIdle = () => finish(true)
      const timer = setTimeout(() => finish(false), timeoutMs)
      this.idleListeners.add(onIdle)
    })
  }
}

export const apiProducers = new ProducerDrain()

/** Keep detached post-response work in the API's shutdown accounting. */
export const trackBackgroundProducer = <T>(work: () => Promise<T>) =>
  apiProducers.track(work)

/**
 * Promise.all rejects while siblings may still commit and broadcast. Wait for
 * every started branch before propagating an error to the request lifecycle.
 */
export async function settleAll<T>(tasks: Iterable<T | PromiseLike<T>>) {
  const results = await Promise.allSettled(tasks)
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  )
  if (failure) throw failure.reason
  return results.map((result) => (result as PromiseFulfilledResult<T>).value)
}

/** Bound fanout, stop launching batches after failure, and finish each batch. */
export async function settleMap<T>(
  items: T[],
  work: (item: T) => Promise<unknown>,
  concurrency = 20
) {
  for (let i = 0; i < items.length; i += concurrency) {
    await settleAll(items.slice(i, i + concurrency).map(work))
  }
}
