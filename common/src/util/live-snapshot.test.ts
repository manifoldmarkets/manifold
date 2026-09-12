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

it('keeps the last snapshot on failure, ignores obsolete reads, and allows retry', async () => {
  const store = book()
  store.update([{ id: 'a' }])
  const old = deferred<Order[]>()
  const done = store.refresh(() => old.promise)
  await expect(
    store.refresh(async () => {
      throw new Error('offline')
    })
  ).rejects.toThrow('offline')
  old.resolve([{ id: 'obsolete' }])
  await done
  expect(store.getSnapshot()).toEqual([{ id: 'a' }])
  await store.refresh(async () => [{ id: 'fresh' }])
  expect(store.getSnapshot()).toEqual([{ id: 'fresh' }])
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
