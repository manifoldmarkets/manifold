import { SubscriptionRecovery } from './subscription-recovery'

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
    recovery.connectionChanged(false)
    recovery.connectionChanged(true)
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
    jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(1)
    const early = jest.fn().mockRejectedValue(new Error('503'))
    const late = jest.fn().mockRejectedValue(new Error('503'))
    const first = new SubscriptionRecovery(early, jest.fn())
    const second = new SubscriptionRecovery(late, jest.fn())
    first.connectionChanged(true)
    second.connectionChanged(true)
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
    recovery.stop()
    request.resolve(commit)
    await flush()
    jest.advanceTimersByTime(30000)
    expect(snapshot).toHaveBeenCalledTimes(1)
    expect(commit).not.toHaveBeenCalled()
  })
})
