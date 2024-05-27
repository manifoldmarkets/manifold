import { APIError } from 'common/api/utils'

const DEFAULT_QUEUE_TIME_LIMIT = 5000

export const createFnQueue = (props?: { timeout?: number }) => {
  const { timeout = DEFAULT_QUEUE_TIME_LIMIT } = props || {}

  const fnQueue: {
    fn: () => Promise<any>
    resolve: (value: any) => void
    reject: (reason: any) => void
    timestamp: number
  }[] = []

  const enqueueFn = async <T>(fn: () => Promise<T>) => {
    return await new Promise<T>((resolve, reject) => {
      fnQueue.push({
        fn,
        resolve,
        reject,
        timestamp: Date.now(),
      })
      runFnQueue()
    })
  }

  const spliceExpiredItems = (queue: typeof fnQueue) => {
    // Queue is sorted with oldest first.
    // Find the first item that has not expired, and splice everything before it.
    const now = Date.now()
    const expiredBeforeIndex = queue.findIndex(
      (item) => now - item.timestamp < timeout
    )
    const expiredCount =
      expiredBeforeIndex === -1 ? queue.length : expiredBeforeIndex
    const expiredItems = queue.splice(0, expiredCount)
    return expiredItems
  }

  let queueRunning = false

  const runFnQueue = async () => {
    if (queueRunning) return
    queueRunning = true

    while (fnQueue.length > 0) {
      const expiredItems = spliceExpiredItems(fnQueue)
      for (const item of expiredItems) {
        item.reject(
          new APIError(503, 'High volume of requests. Please try again later.')
        )
      }

      const item = fnQueue.shift()

      if (item) {
        const { fn, resolve, reject } = item

        try {
          const result = await fn()
          resolve(result)
        } catch (e) {
          reject(e)
        }
      }
    }
    queueRunning = false
  }

  return { enqueueFn }
}

export const betsQueue = createFnQueue()
