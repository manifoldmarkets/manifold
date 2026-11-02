import { createLiveSnapshot } from './live-snapshot'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
type Order = { id: string; closed?: boolean; amount?: number }
const book = () =>
  createLiveSnapshot<Order>((orders) => orders.filter((o) => !o.closed))

it('keeps cancellations received during a snapshot read', async () => {
  const store = book()
  const read = deferred<Order[]>()
  const done = store.refresh(() => read.promise)
  store.update([{ id: 'a', closed: true }])
  read.resolve([{ id: 'a' }])
  await done
  expect(store.getSnapshot()).toEqual([])
})

it('updates the shared cache even with no mounted subscribers', async () => {
  const store = book()
  await store.refresh(async () => [{ id: 'a' }])
  store.update([{ id: 'a', closed: true }])
  // No TTL or separate stale copy can resurrect this order on a later mount.
  expect(store.getSnapshot()).toEqual([])
})

it('ignores an older response that finishes after a newer refresh', async () => {
  const store = book()
  const old = deferred<Order[]>()
  const done = store.refresh(() => old.promise)
  await store.refresh(async () => [])
  old.resolve([{ id: 'cancelled-offline' }])
  await done
  expect(store.getSnapshot()).toEqual([])
})

it('preserves new and partially filled orders received during a read', async () => {
  const store = book()
  const read = deferred<Order[]>()
  const done = store.refresh(() => read.promise)
  store.update([{ id: 'a', amount: 25 }, { id: 'b' }])
  read.resolve([{ id: 'a', amount: 0 }])
  await done
  expect(store.getSnapshot()).toEqual([{ id: 'a', amount: 25 }, { id: 'b' }])
})

it('keeps the last snapshot when a read fails, and allows retry', async () => {
  const store = book()
  store.update([{ id: 'a' }])
  await expect(
    store.refresh(async () => {
      throw new Error('offline')
    })
  ).rejects.toThrow('offline')
  expect(store.getSnapshot()).toEqual([{ id: 'a' }])
  await store.refresh(async () => [{ id: 'fresh' }])
  expect(store.getSnapshot()).toEqual([{ id: 'fresh' }])
})

it('still applies an older response when the newer read fails', async () => {
  const store = book()
  const old = deferred<Order[]>()
  const done = store.refresh(() => old.promise)
  await expect(
    store.refresh(async () => {
      throw new Error('offline')
    })
  ).rejects.toThrow('offline')
  store.update([{ id: 'b' }])
  old.resolve([{ id: 'a' }])
  await done
  expect(store.getSnapshot()).toEqual([{ id: 'a' }, { id: 'b' }])
})

it('applies an older response that finishes first until the newer one arrives', async () => {
  const store = book()
  const old = deferred<Order[]>(),
    fresh = deferred<Order[]>()
  const first = store.refresh(() => old.promise)
  const second = store.refresh(() => fresh.promise)
  old.resolve([{ id: 'a' }])
  await first
  expect(store.getSnapshot()).toEqual([{ id: 'a' }])
  store.update([{ id: 'a', closed: true }])
  fresh.resolve([{ id: 'a' }, { id: 'b' }])
  await second
  expect(store.getSnapshot()).toEqual([{ id: 'b' }])
})

it('notifies all subscribers and stops after unsubscribe', () => {
  const store = book()
  const first = jest.fn(),
    second = jest.fn()
  const unsubscribe = store.subscribe(first)
  store.subscribe(second)
  store.update([{ id: 'a' }])
  unsubscribe()
  store.update([{ id: 'a', closed: true }])
  expect(first).toHaveBeenCalledTimes(1)
  expect(second).toHaveBeenCalledTimes(2)
})

it('lets a response replace updates received before its read started', async () => {
  const store = book()
  store.update([{ id: 'a', amount: 1 }])
  await store.refresh(async () => [{ id: 'a', amount: 2 }])
  expect(store.getSnapshot()).toEqual([{ id: 'a', amount: 2 }])
})

it('replays recent updates over a cached response that can predate them', async () => {
  let now = 1_000_000
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => now)
  try {
    const store = createLiveSnapshot<Order>(
      (orders) => orders.filter((o) => !o.closed),
      10_000
    )
    store.update([{ id: 'a', closed: true }])
    now += 9_000
    // A cached copy from before the cancel.
    await store.refresh(async () => [{ id: 'a' }, { id: 'b', amount: 1 }])
    expect(store.getSnapshot()).toEqual([{ id: 'b', amount: 1 }])
    store.update([{ id: 'b', amount: 2 }])
    now += 10_001
    // Any cached copy now postdates that update, so the response wins.
    await store.refresh(async () => [{ id: 'b', amount: 3 }])
    expect(store.getSnapshot()).toEqual([{ id: 'b', amount: 3 }])
  } finally {
    clock.mockRestore()
  }
})

it('stops replaying updates from before a gap in them, unless final', async () => {
  const store = createLiveSnapshot<Order>(
    (orders) => orders.filter((o) => !o.closed),
    10_000,
    (o) => !!o.closed
  )
  const release = store.hold()
  store.update([{ id: 'a' }, { id: 'b', closed: true }])
  release()
  // Updates are missed until a consumer holds again, so 'a' may have closed.
  store.hold()
  store.update([{ id: 'c' }])
  // Up to date, apart from a cached copy of 'b' from before it closed.
  await store.refresh(async () => [{ id: 'b' }])
  expect(store.getSnapshot()).toEqual([{ id: 'c' }])
})

it('has no gap while any consumer holds', async () => {
  const store = createLiveSnapshot<Order>(undefined, 10_000)
  const first = store.hold()
  const second = store.hold()
  store.update([{ id: 'a', amount: 1 }])
  first()
  first()
  store.hold()
  second()
  await store.refresh(async () => [])
  expect(store.getSnapshot()).toEqual([{ id: 'a', amount: 1 }])
})

it('keeps one live update per id while a read stalls', () => {
  const isFinal = jest.fn(() => false)
  const store = createLiveSnapshot<Order>(undefined, 0, isFinal)
  store.refresh(() => new Promise(() => {}))
  for (let amount = 1; amount <= 10_000; amount++)
    store.update([{ id: 'a', amount }])
  // Starting to hold checks each update kept, once.
  store.hold()
  expect(isFinal).toHaveBeenCalledTimes(1)
})
