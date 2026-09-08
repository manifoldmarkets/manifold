import {
  createOracleFeedDispatcher,
  MAX_ABANDONED_POLLS_PER_FEED,
  MAX_OUTSTANDING_ORACLE_POLLS,
  ORACLE_POLL_DEADLINE_MS,
  OraclePollProgress,
} from './oracle-feed-dispatcher'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}
const setup = () => {
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { ...createOracleFeedDispatcher(log), log }
}

beforeEach(() => {
  jest.useFakeTimers()
})
afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

it('prevents overlap on one feed while other feeds keep polling', async () => {
  const dispatcher = setup()
  const pending = deferred()
  const sameFeed = jest.fn(async () => undefined)
  const otherFeed = jest.fn(async () => undefined)
  expect(dispatcher.dispatch('btc', () => pending.promise)).toBe(true)
  expect(dispatcher.dispatch('btc', sameFeed)).toBe(false)
  expect(dispatcher.dispatch('spy', otherFeed)).toBe(true)
  await flush()
  expect(otherFeed).toHaveBeenCalledTimes(1)
  expect(sameFeed).not.toHaveBeenCalled()
  pending.resolve()
  await flush()
  expect(dispatcher.dispatch('btc', sameFeed)).toBe(true)
  await flush()
  jest.advanceTimersByTime(ORACLE_POLL_DEADLINE_MS)
  expect(dispatcher.log.error).not.toHaveBeenCalled()
})

it.each(['synchronous', 'asynchronous'])(
  'releases the slot after a %s failure',
  async (kind) => {
    const dispatcher = setup()
    dispatcher.dispatch('btc', () => {
      if (kind === 'synchronous') throw new Error('source failed')
      return Promise.reject(new Error('source failed'))
    })
    await flush()
    expect(dispatcher.log.error).toHaveBeenCalledTimes(1)
    expect(dispatcher.dispatch('btc', async () => undefined)).toBe(true)
    await flush()
    jest.advanceTimersByTime(ORACLE_POLL_DEADLINE_MS)
    expect(dispatcher.log.error).toHaveBeenCalledTimes(1)
  }
)

it('rearms a hung feed and prevents its late read from starting a write', async () => {
  const dispatcher = setup()
  const read = deferred()
  const replacement = deferred()
  const write = jest.fn()
  dispatcher.dispatch('btc', async (progress) => {
    progress.checkpoint('read-latest-point')
    await read.promise
    progress.checkpoint('insert-point')
    write()
  })
  await flush()
  jest.advanceTimersByTime(ORACLE_POLL_DEADLINE_MS)
  expect(dispatcher.log.error).toHaveBeenCalledWith(
    expect.stringContaining('phase "read-latest-point"')
  )
  expect(dispatcher.dispatch('btc', () => replacement.promise)).toBe(true)
  await flush()
  read.resolve()
  await flush()
  expect(write).not.toHaveBeenCalled()
  expect(dispatcher.log.error).toHaveBeenCalledTimes(1)
  // Settling the retired run must not release the replacement's busy flag.
  expect(dispatcher.dispatch('btc', async () => undefined)).toBe(false)
  replacement.resolve()
  await flush()
  expect(dispatcher.dispatch('btc', async () => undefined)).toBe(true)
})

it('keeps progress attached to the replacement when retired work resumes', async () => {
  const dispatcher = setup()
  const first = deferred()
  const second = deferred()
  let oldProgress!: OraclePollProgress
  dispatcher.dispatch('btc', async (progress) => {
    oldProgress = progress
    progress.checkpoint('old-read')
    await first.promise
  })
  await flush()
  jest.advanceTimersByTime(ORACLE_POLL_DEADLINE_MS)
  dispatcher.dispatch('btc', async (progress) => {
    progress.checkpoint('replacement-read')
    await second.promise
  })
  await flush()
  oldProgress.setPhase('late-notification')
  first.resolve()
  await flush()
  jest.advanceTimersByTime(ORACLE_POLL_DEADLINE_MS)
  expect(dispatcher.log.error).toHaveBeenLastCalledWith(
    expect.stringContaining('phase "replacement-read"')
  )
})

it('stops accumulating unfinished work on a single feed and recovers when it settles', async () => {
  const dispatcher = setup()
  const pending = Array.from({ length: MAX_ABANDONED_POLLS_PER_FEED }, deferred)
  for (const poll of pending) {
    expect(dispatcher.dispatch('btc', () => poll.promise)).toBe(true)
    await flush()
    jest.advanceTimersByTime(ORACLE_POLL_DEADLINE_MS)
  }
  const replacement = jest.fn(async () => undefined)
  expect(dispatcher.dispatch('btc', replacement)).toBe(false)
  const errors = dispatcher.log.error.mock.calls.length
  expect(dispatcher.dispatch('btc', replacement)).toBe(false)
  expect(dispatcher.log.error).toHaveBeenCalledTimes(errors)
  expect(dispatcher.dispatch('spy', async () => undefined)).toBe(true)
  pending[0].resolve()
  await flush()
  expect(dispatcher.dispatch('btc', replacement)).toBe(true)
  await flush()
  expect(replacement).toHaveBeenCalledTimes(1)
})

it('reserves an exact process limit before dispatch, including runs not yet timed out', async () => {
  const dispatcher = setup()
  const pending = Array.from({ length: MAX_OUTSTANDING_ORACLE_POLLS }, deferred)
  pending.forEach((poll, i) => {
    expect(dispatcher.dispatch('feed-' + i, () => poll.promise)).toBe(true)
  })
  const extra = jest.fn(async () => undefined)
  expect(dispatcher.dispatch('extra', extra)).toBe(false)
  await flush()
  jest.advanceTimersByTime(ORACLE_POLL_DEADLINE_MS)
  // Abandoning frees polling slots, not the underlying resource reservations.
  expect(dispatcher.dispatch('extra', extra)).toBe(false)
  expect(extra).not.toHaveBeenCalled()
  expect(dispatcher.log.error).toHaveBeenLastCalledWith(
    expect.stringContaining('extra: refusing to poll')
  )
  pending[0].resolve()
  await flush()
  expect(dispatcher.dispatch('extra', extra)).toBe(true)
  await flush()
  expect(extra).toHaveBeenCalledTimes(1)
})

it('clears the deadline when a slow but bounded poll finishes', async () => {
  const dispatcher = setup()
  const pending = deferred()
  dispatcher.dispatch('btc', () => pending.promise)
  await flush()
  jest.advanceTimersByTime(ORACLE_POLL_DEADLINE_MS - 1)
  pending.resolve()
  await flush()
  jest.advanceTimersByTime(1)
  expect(dispatcher.log.error).not.toHaveBeenCalled()
  expect(dispatcher.dispatch('btc', async () => undefined)).toBe(true)
})
