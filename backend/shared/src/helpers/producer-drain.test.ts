import { ProducerDrain, settleAll, settleMap } from './producer-drain'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

it('waits for a sibling producer after a fanout rejects', async () => {
  const drain = new ProducerDrain()
  const sibling = deferred<void>()
  const failure = new Error('first branch failed')
  const work = drain.track(() =>
    settleAll([Promise.reject(failure), sibling.promise])
  )
  const caught = work.catch((error: unknown) => error)
  drain.stopAccepting()
  expect(await drain.waitForIdle(5)).toBe(false)
  sibling.resolve()
  expect(await caught).toBe(failure)
  expect(await drain.waitForIdle(5)).toBe(true)
  expect(drain.complete).toBe(false)
})

it('finishes an active bounded batch without starting another after failure', async () => {
  const held = deferred<void>()
  const started: number[] = []
  const work = settleMap(
    [0, 1, 2, 3],
    async (item) => {
      started.push(item)
      if (item === 0) throw new Error('failed')
      await held.promise
    },
    2
  )
  let finished = false
  const caught = work.catch(() => {
    finished = true
  })
  await new Promise((resolve) => setTimeout(resolve, 5))
  expect(started).toEqual([0, 1])
  expect(finished).toBe(false)
  held.resolve()
  await caught
  expect(started).toEqual([0, 1])
})

it('includes a child task registered before the accepted parent returns', async () => {
  const drain = new ProducerDrain()
  const child = deferred<void>()
  await drain.track(async () => {
    void drain.track(() => child.promise)
  })
  drain.stopAccepting()
  expect(await drain.waitForIdle(5)).toBe(false)
  child.resolve()
  expect(await drain.waitForIdle(100)).toBe(true)
  expect(drain.pending).toBe(0)
})
