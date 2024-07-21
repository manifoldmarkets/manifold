import { remove } from 'lodash'
import { APIError } from 'common/api/utils'

const DEFAULT_QUEUE_TIME_LIMIT = 5000

type WorkItem = {
  fn: () => Promise<any>
  dependencies: string[]
  resolve: (value: any) => void
  reject: (reason: any) => void
  timestamp: number
}

export const createFnQueue = (props?: {
  timeout?: number
  maxConcurrent?: number
}) => {
  const { timeout = DEFAULT_QUEUE_TIME_LIMIT, maxConcurrent = 5 } = props || {}

  const state = {
    fnQueue: [] as WorkItem[],
    activeItems: [] as WorkItem[],
  }
  const { fnQueue, activeItems } = state

  const enqueuePrivate = async <T>(
    fn: () => Promise<T>,
    dependencies: string[],
    first: boolean
  ) => {
    return await new Promise<T>((resolve, reject) => {
      const item = {
        fn,
        resolve,
        reject,
        dependencies,
        timestamp: Date.now(),
      }
      if (first) {
        fnQueue.unshift(item)
      } else {
        fnQueue.push(item)
      }
      run()
    })
  }

  const enqueueFn = async <T>(fn: () => Promise<T>, dependencies: string[]) => {
    return await enqueuePrivate(fn, dependencies, false)
  }

  const enqueueFnFirst = async <T>(
    fn: () => Promise<T>,
    dependencies: string[]
  ) => {
    return await enqueuePrivate(fn, dependencies, true)
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

  const runItem = async (item: WorkItem) => {
    const { fn, resolve, reject } = item

    activeItems.push(item)

    try {
      const result = await fn()
      resolve(result)
    } catch (e) {
      reject(e)
    } finally {
      remove(activeItems, (i) => i === item)
      run()
    }
  }

  const run = () => {
    const expiredItems = spliceExpiredItems(fnQueue)
    for (const item of expiredItems) {
      item.reject(
        new APIError(
          503,
          `High volume of requests (${fnQueue.length} requests in queue); please try again later.`
        )
      )
    }

    while (activeItems.length < maxConcurrent && fnQueue.length > 0) {
      const cumulativeDependencies = new Set<string>(
        activeItems.flatMap((item) => item.dependencies)
      )
      const itemIndex = fnQueue.findIndex(
        (item) => !item.dependencies.some((d) => cumulativeDependencies.has(d))
      )

      if (itemIndex === -1) break

      const item = fnQueue.splice(itemIndex, 1)[0]
      runItem(item)
    }
  }

  return { enqueueFn, enqueueFnFirst }
}

export const betsQueue = createFnQueue({ maxConcurrent: 10 })
export const pollQueue = createFnQueue({ maxConcurrent: 10 })
