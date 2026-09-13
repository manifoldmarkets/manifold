import {
  buildUserInterestsCache,
  clearUserInterestsCache,
} from './topic-interests'
import { createSupabaseDirectClient } from './supabase/init'
import { scheduleDailyAtUtcHour } from './helpers/daily-schedule'

jest.mock('./topic-interests', () => ({
  buildUserInterestsCache: jest.fn(),
  clearUserInterestsCache: jest.fn(),
}))
jest.mock('./supabase/init', () => ({ createSupabaseDirectClient: jest.fn() }))
jest.mock('./helpers/daily-schedule', () => ({
  scheduleDailyAtUtcHour: jest.fn(),
}))
jest.mock('shared/utils', () => ({ log: jest.fn() }))

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

describe('cache initialization', () => {
  const map = jest.fn()
  let initCaches: typeof import('./init-caches')['initCaches']
  let scheduleDailyCacheRefresh: typeof import('./init-caches')['scheduleDailyCacheRefresh']

  beforeAll(() => {
    // Production initialization must be tested on developer Macs too.
    const platform = process.platform
    try {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      const caches =
        jest.requireActual<typeof import('./init-caches')>('./init-caches')
      initCaches = caches.initCaches
      scheduleDailyCacheRefresh = caches.scheduleDailyCacheRefresh
    } finally {
      Object.defineProperty(process, 'platform', { value: platform })
    }
  })
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    jest.mocked(createSupabaseDirectClient).mockReturnValue({ map } as never)
    map.mockResolvedValue(['user-1'])
    jest.mocked(buildUserInterestsCache).mockResolvedValue(undefined)
  })
  afterEach(() => jest.useRealTimers())

  it('waits for the complete cache build before resolving startup', async () => {
    const build = deferred()
    const buildStarted = deferred()
    jest.mocked(buildUserInterestsCache).mockImplementation(() => {
      buildStarted.resolve()
      return build.promise
    })
    let ready = false
    const startup = initCaches().then(() => (ready = true))
    await buildStarted.promise
    expect(buildUserInterestsCache).toHaveBeenCalledWith(['user-1'])
    expect(ready).toBe(false)
    // The DB response deadline must not cut off a long, batched build.
    jest.advanceTimersByTime(60_000)
    expect(ready).toBe(false)
    build.resolve()
    await startup
    expect(ready).toBe(true)
  })

  it('propagates build failure to the startup error handler', async () => {
    jest
      .mocked(buildUserInterestsCache)
      .mockRejectedValue(new Error('build failed'))
    await expect(initCaches()).rejects.toThrow('build failed')
    expect(jest.getTimerCount()).toBe(0)
  })

  it('rejects on a DB timeout without an uncaught timer exception', async () => {
    map.mockReturnValue(new Promise(() => {}))
    const failure = expect(initCaches()).rejects.toThrow('30000ms')
    jest.advanceTimersByTime(30_000)
    await failure
    expect(buildUserInterestsCache).not.toHaveBeenCalled()
  })

  it('preserves the cache when the daily active-user query fails', async () => {
    scheduleDailyCacheRefresh()
    const refresh = jest.mocked(scheduleDailyAtUtcHour).mock.calls[0][2]
    map.mockRejectedValue(new Error('db unavailable'))
    await expect(refresh()).rejects.toThrow('db unavailable')
    expect(clearUserInterestsCache).not.toHaveBeenCalled()
    expect(buildUserInterestsCache).not.toHaveBeenCalled()
  })

  it('clears only after the daily active-user query completes', async () => {
    const query = deferred()
    map.mockReturnValue(query.promise.then(() => ['user-1']))
    scheduleDailyCacheRefresh()
    const refresh = jest.mocked(scheduleDailyAtUtcHour).mock.calls[0][2]()
    expect(clearUserInterestsCache).not.toHaveBeenCalled()
    query.resolve()
    await refresh
    expect(clearUserInterestsCache).toHaveBeenCalledTimes(1)
    expect(buildUserInterestsCache).toHaveBeenCalledWith(['user-1'])
  })
})
