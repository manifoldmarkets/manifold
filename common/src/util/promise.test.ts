import { createRequestDeduper } from './promise'

describe('createRequestDeduper', () => {
  const deferred = <T>() => {
    let resolve!: (value: T) => void
    let reject!: (err: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  it('makes one request for callers arriving while it is in flight', async () => {
    const dedupe = createRequestDeduper<string>()
    const pending = deferred<string>()
    const makeRequest = jest.fn(() => pending.promise)

    const first = dedupe('key', makeRequest)
    const second = dedupe('key', makeRequest)

    expect(makeRequest).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)

    pending.resolve('orders')
    expect(await first).toBe('orders')
    expect(await second).toBe('orders')
  })

  it('keeps different keys apart', () => {
    const dedupe = createRequestDeduper<string>()
    const makeRequest = jest.fn(() => deferred<string>().promise)

    dedupe('contract-a', makeRequest)
    dedupe('contract-b', makeRequest)

    expect(makeRequest).toHaveBeenCalledTimes(2)
  })

  it('makes a fresh request once the previous one settles', async () => {
    const dedupe = createRequestDeduper<string>()
    const makeRequest = jest.fn(() => Promise.resolve('orders'))

    await dedupe('key', makeRequest)
    await dedupe('key', makeRequest)

    // Otherwise this would be a cache, and a panel opening later would be
    // handed a stale order book.
    expect(makeRequest).toHaveBeenCalledTimes(2)
  })

  it('does not wedge the key after a failure', async () => {
    const dedupe = createRequestDeduper<string>()
    const failing = jest.fn(() => Promise.reject(new Error('nope')))

    await expect(dedupe('key', failing)).rejects.toThrow('nope')

    const succeeding = jest.fn(() => Promise.resolve('orders'))
    expect(await dedupe('key', succeeding)).toBe('orders')
  })

  it('gives every waiter the failure', async () => {
    const dedupe = createRequestDeduper<string>()
    const pending = deferred<string>()
    const makeRequest = jest.fn(() => pending.promise)

    const first = dedupe('key', makeRequest)
    const second = dedupe('key', makeRequest)
    pending.reject(new Error('nope'))

    await expect(first).rejects.toThrow('nope')
    await expect(second).rejects.toThrow('nope')
  })
})
