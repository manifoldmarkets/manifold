export type RetryPolicy = {
  initialBackoffSec: number
  retries: number
}

export const delay = (ms: number) => {
  return new Promise<void>((resolve) => setTimeout(() => resolve(), ms))
}

export async function withRetries<T>(q: PromiseLike<T>, policy?: RetryPolicy) {
  let err: Error | undefined
  let delaySec = policy?.initialBackoffSec ?? 5
  const maxRetries = policy?.retries ?? 5
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await q
    } catch (e) {
      err = e as Error
      if (i < maxRetries) {
        console.debug(`Error: ${err.message} - Retrying in ${delaySec}s.`)
        await delay(delaySec * 1000)
        delaySec *= 2
      }
    }
  }
  throw err
}

export const mapAsyncChunked = async <T, U>(
  items: T[],
  f: (item: T, index: number) => Promise<U>,
  chunkSize = 20
) => {
  const results: U[] = []

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    const chunkResults = await Promise.all(
      chunk.map((item, index) => f(item, i + index))
    )
    results.push(...chunkResults)
  }

  return results
}

export const mapAsync = <T, U>(
  items: T[],
  f: (item: T, index: number) => Promise<U>,
  maxConcurrentRequests = 20
) => {
  let index = 0
  let currRequests = 0
  const results: U[] = []

  return new Promise((resolve: (results: U[]) => void, reject) => {
    const doWork = () => {
      while (index < items.length && currRequests < maxConcurrentRequests) {
        const itemIndex = index
        f(items[itemIndex], itemIndex)
          .then((data) => {
            results[itemIndex] = data
            currRequests--
            if (index === items.length && currRequests === 0) resolve(results)
            else doWork()
          })
          .catch(reject)

        index++
        currRequests++
      }
    }

    if (items.length === 0) resolve([])
    else doWork()
  })
}

/** Collapses concurrent requests for the same key onto a single promise, so a
 * burst of callers wanting the same thing at the same moment makes one request
 * between them. The entry is dropped as soon as it settles: this dedupes, it
 * does not cache, so a caller arriving afterwards still gets fresh data. */
export const createRequestDeduper = <T>(
  scope: 'in-flight' | 'burst' = 'in-flight'
) => {
  const inFlight = new Map<string, Promise<T>>()

  return (key: string, makeRequest: () => Promise<T>) => {
    const existing = inFlight.get(key)
    if (existing) return existing

    const request = makeRequest()
    inFlight.set(key, request)
    const clear = () => {
      if (inFlight.get(key) === request) inFlight.delete(key)
    }
    // Burst mode joins callers from the current batch of effects only. A later
    // visibility/reconnect event must start a new read even if this one hangs.
    if (scope === 'burst') queueMicrotask(clear)
    else request.then(clear, clear)
    return request
  }
}
