import { createSingleFlightCache } from './single-flight-cache'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let now = 1_000_000
beforeEach(() => {
  now = 1_000_000
  jest.spyOn(Date, 'now').mockImplementation(() => now)
})
afterEach(() => {
  jest.restoreAllMocks()
})

describe('createSingleFlightCache', () => {
  it('shares one computation between concurrent callers of a key', async () => {
    const cache = createSingleFlightCache<string>({
      ttlMs: 60_000,
      maxEntries: 10,
    })
    const pending = deferred<string>()
    const compute = jest.fn(() => pending.promise)

    const calls = [1, 2, 3].map(() => cache.get('user-a', compute))
    pending.resolve('result')

    expect(await Promise.all(calls)).toEqual(['result', 'result', 'result'])
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('computes different keys independently', async () => {
    const cache = createSingleFlightCache<string>({
      ttlMs: 60_000,
      maxEntries: 10,
    })
    const compute = jest.fn(async () => 'x')

    await Promise.all([cache.get('a', compute), cache.get('b', compute)])

    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('serves the cached value until the TTL passes, then recomputes', async () => {
    const cache = createSingleFlightCache<number>({
      ttlMs: 60_000,
      maxEntries: 10,
    })
    let calls = 0
    const compute = jest.fn(async () => ++calls)

    expect(await cache.get('a', compute)).toBe(1)
    now += 60_000
    expect(await cache.get('a', compute)).toBe(1)
    now += 1
    expect(await cache.get('a', compute)).toBe(2)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('does not cache a failure, and lets the next caller retry', async () => {
    const cache = createSingleFlightCache<string>({
      ttlMs: 60_000,
      maxEntries: 10,
    })
    const failing = deferred<string>()
    const first = cache.get('a', () => failing.promise)
    const joined = cache.get('a', async () => 'unused')
    failing.reject(new Error('db timeout'))

    await expect(first).rejects.toThrow('db timeout')
    await expect(joined).rejects.toThrow('db timeout')
    expect(await cache.get('a', async () => 'ok')).toBe('ok')
  })

  it('evicts the oldest entries beyond maxEntries', async () => {
    const cache = createSingleFlightCache<string>({
      ttlMs: 60_000,
      maxEntries: 2,
    })
    await cache.get('a', async () => 'a1')
    await cache.get('b', async () => 'b1')
    await cache.get('c', async () => 'c1')

    expect(await cache.get('b', async () => 'b2')).toBe('b1')
    expect(await cache.get('c', async () => 'c2')).toBe('c1')
    expect(await cache.get('a', async () => 'a2')).toBe('a2')
  })
})
