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
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

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
