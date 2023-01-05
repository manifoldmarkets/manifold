export type RetryPolicy = {
  initialBackoffSec: number
  retries: number
}

export const delay = (ms: number) => {
  return new Promise<void>((resolve) => setTimeout(() => resolve(), ms))
}

export async function withRetries<T>(q: PromiseLike<T>, policy?: RetryPolicy) {
  let err: any
  let delaySec = policy?.initialBackoffSec ?? 5
  const maxRetries = policy?.retries ?? 5
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await q
    } catch (e) {
      err = e
      if (i < maxRetries) {
        console.debug(`Error: ${e?.toString()} - Retrying in ${delaySec}s.`)
        await delay(delaySec * 1000)
        delaySec *= 2
      }
    }
  }
  throw err
}

export const mapAsync = <T, U>(
  items: T[],
  f: (item: T, index: number) => Promise<U>,
  maxConcurrentRequests = 100
) => {
  let index = 0
  let currRequests = 0
  const results: U[] = []

  // Hack to get around Node bug: https://github.com/nodejs/node/issues/22088
  const intervalId = setInterval(() => {
    // Do nothing, but prevent early process exit.
  }, 10000)

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

    doWork()
  }).finally(() => clearInterval(intervalId))
}
