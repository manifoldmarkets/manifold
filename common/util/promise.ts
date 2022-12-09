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

export const batchedWaitAll = async <T>(
  createPromises: (() => Promise<T>)[],
  batchSize = 10
) => {
  const numBatches = Math.ceil(createPromises.length / batchSize)
  const result: T[] = []
  for (let batchIndex = 0; batchIndex < numBatches; batchIndex++) {
    const from = batchIndex * batchSize
    const to = from + batchSize

    const promises = createPromises.slice(from, to).map((f) => f())

    const batch = await Promise.all(promises)
    result.push(...batch)
  }

  return result
}
