import { sleep } from 'common/util/time'

export const QUEUE_TIME_LIMIT = 5000

const fnQueue: {
  fn: () => Promise<any>
  resolve: (value: any) => void
  reject: (reason: any) => void
  timestamp: number
}[] = []

export const enqueueFn = async <T>(fn: () => Promise<T>) => {
  return await new Promise<T>((resolve, reject) => {
    fnQueue.push({
      fn,
      resolve,
      reject,
      timestamp: Date.now(),
    })
  })
}

export const initFnQueue = async () => {
  while (true) {
    const now = Date.now()
    for (const item of fnQueue) {
      // if more than 5 seconds have elapsed, reject the promise
      if (now - item.timestamp > QUEUE_TIME_LIMIT) {
        item.reject(new Error('Queue timeout'))
      }
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
    } else {
      await sleep(100)
    }
  }
}
