import {
  INITIAL_SPREAD_MS,
  SubscriptionRecovery,
} from './subscription-recovery'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

// The outer beforeEach pins Math.random() to 0.5, so the first read after a
// reconnect waits exactly this long before it dispatches.
const FIRST_READ_MS = Math.floor(0.5 * INITIAL_SPREAD_MS)

describe('subscription snapshot recovery', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
  })
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('replaces missed stale state only after a successful recovery', async () => {
    let orders = ['cancelled-during-outage']
    const request = deferred<() => void>()
    const snapshot = jest.fn(() => request.promise)
    const recovery = new SubscriptionRecovery(snapshot, jest.fn())
    expect(snapshot).not.toHaveBeenCalled()
    recovery.connectionChanged(true)
    jest.advanceTimersByTime(FIRST_READ_MS)
    expect(orders).toEqual(['cancelled-during-outage'])
    request.resolve(() => {
      orders = []
    })
    await flush()
    expect(orders).toEqual([])
    recovery.stop()
  })

  it('does not overwrite a live update with a racing snapshot; retries fresh', async () => {
    let balance = 100
    const first = deferred<() => void>()
    const snapshot = jest
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(async () => () => {
        balance = 130
      })
    const recovery = new SubscriptionRecovery(snapshot, jest.fn())
    recovery.connectionChanged(true)
    jest.advanceTimersByTime(FIRST_READ_MS)
    recovery.broadcast()
    balance = 120
    first.resolve(() => {
      balance = 110
    })
    await flush()
    expect(balance).toBe(120)
    jest.advanceTimersByTime(1000)
    await flush()
    expect(balance).toBe(130)
    recovery.stop()
  })

  it('ignores a previous connection response after another reconnect', async () => {
    const old = deferred<() => void>()
    const oldCommit = jest.fn()
    const newCommit = jest.fn()
    const snapshot = jest
      .fn()
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce(newCommit)
    const recovery = new SubscriptionRecovery(snapshot, jest.fn())
    recovery.connectionChanged(true)
    jest.advanceTimersByTime(FIRST_READ_MS)
    recovery.connectionChanged(false)
    recovery.connectionChanged(true)
    jest.advanceTimersByTime(FIRST_READ_MS)
    await flush()
    old.resolve(oldCommit)
    await flush()
    expect(newCommit).toHaveBeenCalledTimes(1)
    expect(oldCommit).not.toHaveBeenCalled()
    recovery.stop()
  })

  it('does not start a second repair for duplicate readiness notifications', async () => {
    const request = deferred<() => void>()
    const commit = jest.fn()
    const snapshot = jest.fn((_signal: AbortSignal) => request.promise)
    const recovery = new SubscriptionRecovery(snapshot, jest.fn())
    recovery.connectionChanged(true)
    recovery.connectionChanged(true)
    jest.advanceTimersByTime(FIRST_READ_MS)
    expect(snapshot).toHaveBeenCalledTimes(1)
    expect(snapshot.mock.calls[0][0].aborted).toBe(false)
    request.resolve(commit)
    await flush()
    expect(commit).toHaveBeenCalledTimes(1)
    recovery.stop()
  })

  it('retries failed reads without discarding live state', async () => {
    const commit = jest.fn()
    const error = new Error('503')
    const snapshot = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(commit)
    const onError = jest.fn()
    const recovery = new SubscriptionRecovery(snapshot, onError)
    recovery.connectionChanged(true)
    jest.advanceTimersByTime(FIRST_READ_MS)
    await flush()
    expect(commit).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(error)
    jest.advanceTimersByTime(1000)
    await flush()
    expect(commit).toHaveBeenCalledTimes(1)
    recovery.stop()
  })

  it('retries when an ordinary read superseded the recovery snapshot', async () => {
    const staleCommit = jest.fn(() => false)
    const freshCommit = jest.fn()
    const snapshot = jest
      .fn()
      .mockResolvedValueOnce(staleCommit)
      .mockResolvedValueOnce(freshCommit)
    const recovery = new SubscriptionRecovery(snapshot, jest.fn())
    recovery.connectionChanged(true)
    jest.advanceTimersByTime(FIRST_READ_MS)
    await flush()
    expect(staleCommit).toHaveBeenCalledTimes(1)
    expect(freshCommit).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1000)
    await flush()
    expect(freshCommit).toHaveBeenCalledTimes(1)
    recovery.stop()
  })

  it.each(['failed read', 'declined commit', 'live update'])(
    'backs off and caps retries after a %s, then resets on reconnect',
    async (reason) => {
      const snapshot = jest.fn(async () => {
        if (reason === 'failed read') throw new Error('503')
        if (reason === 'live update') recovery.broadcast()
        return () => reason !== 'declined commit'
      })
      const recovery = new SubscriptionRecovery(snapshot, jest.fn())
      recovery.connectionChanged(true)
      jest.advanceTimersByTime(FIRST_READ_MS)
      await flush()
      let calls = 1
      for (const delay of [900, 1800, 3600, 7200, 14400, 27000, 27000]) {
        // A repeated ready callback must not reset the backoff either.
        recovery.connectionChanged(true)
        jest.advanceTimersByTime(delay - 1)
        await flush()
        expect(snapshot).toHaveBeenCalledTimes(calls)
        jest.advanceTimersByTime(1)
        await flush()
        expect(snapshot).toHaveBeenCalledTimes(++calls)
      }
      recovery.connectionChanged(false)
      recovery.connectionChanged(true)
      jest.advanceTimersByTime(FIRST_READ_MS)
      await flush()
      expect(snapshot).toHaveBeenCalledTimes(++calls)
      jest.advanceTimersByTime(899)
      await flush()
      expect(snapshot).toHaveBeenCalledTimes(calls)
      jest.advanceTimersByTime(1)
      await flush()
      expect(snapshot).toHaveBeenCalledTimes(++calls)
      recovery.stop()
      jest.advanceTimersByTime(60_000)
      expect(snapshot).toHaveBeenCalledTimes(calls)
    }
  )

  it('jitters retries within their delay window', async () => {
    jest
      .spyOn(Math, 'random')
      // Both clients' initial spread, then each one's first retry jitter.
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
    const early = jest.fn().mockRejectedValue(new Error('503'))
    const late = jest.fn().mockRejectedValue(new Error('503'))
    const first = new SubscriptionRecovery(early, jest.fn())
    const second = new SubscriptionRecovery(late, jest.fn())
    first.connectionChanged(true)
    second.connectionChanged(true)
    jest.advanceTimersByTime(0)
    await flush()
    jest.advanceTimersByTime(800)
    await flush()
    expect(early).toHaveBeenCalledTimes(2)
    expect(late).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(200)
    await flush()
    expect(late).toHaveBeenCalledTimes(2)
    first.stop()
    second.stop()
  })

  it('backs off repeated timeouts and aborts each hung request', async () => {
    const snapshot = jest.fn(
      (_signal: AbortSignal) => new Promise<() => void>(() => {})
    )
    const onError = jest.fn()
    const recovery = new SubscriptionRecovery(snapshot, onError)
    recovery.connectionChanged(true)
    jest.advanceTimersByTime(FIRST_READ_MS)
    jest.advanceTimersByTime(10_000)
    expect(snapshot.mock.calls[0][0].aborted).toBe(true)
    expect(onError).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(899)
    expect(snapshot).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(1)
    expect(snapshot).toHaveBeenCalledTimes(2)
    jest.advanceTimersByTime(10_000)
    expect(snapshot.mock.calls[1][0].aborted).toBe(true)
    expect(onError).toHaveBeenCalledTimes(2)
    jest.advanceTimersByTime(1799)
    expect(snapshot).toHaveBeenCalledTimes(2)
    jest.advanceTimersByTime(1)
    expect(snapshot).toHaveBeenCalledTimes(3)
    recovery.stop()
    expect(snapshot.mock.calls[2][0].aborted).toBe(true)
  })

  it('bounds a hung read and ignores its late response', async () => {
    const hung = deferred<() => void>()
    const lateCommit = jest.fn()
    const newCommit = jest.fn()
    const snapshot = jest
      .fn()
      .mockImplementationOnce(() => hung.promise)
      .mockResolvedValueOnce(newCommit)
    const recovery = new SubscriptionRecovery(snapshot, jest.fn())
    recovery.connectionChanged(true)
    jest.advanceTimersByTime(FIRST_READ_MS)
    const signal = snapshot.mock.calls[0][0] as AbortSignal
    jest.advanceTimersByTime(11000)
    await flush()
    expect(signal.aborted).toBe(true)
    expect(newCommit).toHaveBeenCalledTimes(1)
    hung.resolve(lateCommit)
    await flush()
    expect(lateCommit).not.toHaveBeenCalled()
    recovery.stop()
  })

  it('cancels requests and retries on unmount or changed subscription', async () => {
    const request = deferred<() => void>()
    const commit = jest.fn()
    const snapshot = jest.fn(() => request.promise)
    const recovery = new SubscriptionRecovery(snapshot, jest.fn())
    recovery.connectionChanged(true)
    jest.advanceTimersByTime(FIRST_READ_MS)
    recovery.stop()
    request.resolve(commit)
    await flush()
    jest.advanceTimersByTime(30000)
    expect(snapshot).toHaveBeenCalledTimes(1)
    expect(commit).not.toHaveBeenCalled()
  })
})

// The rollout closes every surviving socket at once with 1012, so these cases
// are about what many clients do in the same instant, not just one.
describe('first recovery attempt after a mass reconnect', () => {
  const settled = () => jest.fn().mockResolvedValue(() => {})

  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('never dispatches the first read in the same tick as the reconnect', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0)
    const snapshot = settled()
    const recovery = new SubscriptionRecovery(snapshot, jest.fn())
    recovery.connectionChanged(true)
    // Every open page reconnects together; a synchronous read here is the burst.
    expect(snapshot).not.toHaveBeenCalled()
    recovery.stop()
  })

  it('dispatches the first read within the spread window', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999)
    const snapshot = settled()
    const recovery = new SubscriptionRecovery(snapshot, jest.fn())
    recovery.connectionChanged(true)
    jest.advanceTimersByTime(INITIAL_SPREAD_MS)
    expect(snapshot).toHaveBeenCalledTimes(1)
    recovery.stop()
  })

  it('spreads two clients across the window instead of firing together', () => {
    jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.999)
    const early = settled()
    const late = settled()
    const first = new SubscriptionRecovery(early, jest.fn())
    const second = new SubscriptionRecovery(late, jest.fn())
    first.connectionChanged(true)
    second.connectionChanged(true)
    jest.advanceTimersByTime(0)
    expect(early).toHaveBeenCalledTimes(1)
    expect(late).not.toHaveBeenCalled()
    jest.advanceTimersByTime(INITIAL_SPREAD_MS)
    expect(late).toHaveBeenCalledTimes(1)
    first.stop()
    second.stop()
  })

  it('cancels a pending first read when the view unsubscribes before it fires', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    const snapshot = settled()
    const recovery = new SubscriptionRecovery(snapshot, jest.fn())
    recovery.connectionChanged(true)
    recovery.stop()
    jest.advanceTimersByTime(60_000)
    expect(snapshot).not.toHaveBeenCalled()
  })

  it('ignores a duplicate readiness signal while the first read is pending', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    const snapshot = settled()
    const recovery = new SubscriptionRecovery(snapshot, jest.fn())
    recovery.connectionChanged(true)
    // The connection callback and the local subscribe ack both report ready.
    recovery.connectionChanged(true)
    recovery.connectionChanged(true)
    jest.advanceTimersByTime(INITIAL_SPREAD_MS)
    expect(snapshot).toHaveBeenCalledTimes(1)
    recovery.stop()
  })

  it('reschedules rather than stacking reads when a reconnect interrupts the wait', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    const snapshot = settled()
    const recovery = new SubscriptionRecovery(snapshot, jest.fn())
    recovery.connectionChanged(true)
    recovery.connectionChanged(false)
    recovery.connectionChanged(true)
    jest.advanceTimersByTime(INITIAL_SPREAD_MS * 4)
    expect(snapshot).toHaveBeenCalledTimes(1)
    recovery.stop()
  })

  it('drops a first read still waiting when the connection is already gone', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    const snapshot = settled()
    const recovery = new SubscriptionRecovery(snapshot, jest.fn())
    recovery.connectionChanged(true)
    recovery.connectionChanged(false)
    jest.advanceTimersByTime(60_000)
    expect(snapshot).not.toHaveBeenCalled()
  })

  it('still backs off and jitters retries after the spread first read fails', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    const snapshot = jest.fn().mockRejectedValue(new Error('503'))
    const onError = jest.fn()
    const recovery = new SubscriptionRecovery(snapshot, onError)
    recovery.connectionChanged(true)
    jest.advanceTimersByTime(INITIAL_SPREAD_MS)
    await flush()
    expect(snapshot).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
    // Retry jitter is unchanged: 0.8 + 0.2*0.5 of the 1000ms first delay.
    jest.advanceTimersByTime(899)
    await flush()
    expect(snapshot).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(1)
    await flush()
    expect(snapshot).toHaveBeenCalledTimes(2)
    recovery.stop()
  })
})
