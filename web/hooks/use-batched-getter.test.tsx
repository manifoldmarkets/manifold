import { act, create, ReactTestRenderer } from 'react-test-renderer'
import {
  executeBatchQuery,
  useBatchedGetter,
} from 'client-common/hooks/use-batched-getter'

const deferred = () => {
  let resolve!: (values: any[]) => void
  const promise = new Promise<any[]>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
const roots: ReactTestRenderer[] = []
let id = 0
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount()
  })
  executeBatchQuery.cancel()
})

async function mount(
  read: () => Promise<any[]>,
  market = `batch-${id++}`,
  queryType: 'markets' | 'markets-fresh' = 'markets'
) {
  let root!: ReactTestRenderer
  let latest: any,
    setValue: any,
    refreshKey = 0
  function Consumer() {
    ;[latest, setValue] = useBatchedGetter(
      { [queryType]: read },
      queryType,
      market,
      { id: market, pool: 0 },
      true,
      undefined,
      refreshKey
    )
    return null
  }
  await act(async () => {
    root = create(<Consumer />)
  })
  roots.push(root)
  return {
    market,
    latest: () => latest,
    setValue: async (value: any) => act(async () => setValue(value)),
    refresh: async () => {
      refreshKey++
      await act(async () => root.update(<Consumer />))
    },
    dispatch: () => {
      executeBatchQuery.flush()
    },
  }
}

it('does not deliver an old batch response to callbacks added during that read', async () => {
  const old = deferred(),
    fresh = deferred()
  let calls = 0
  const m = await mount(() => (++calls === 1 ? old.promise : fresh.promise))
  m.dispatch()
  await m.refresh()
  m.dispatch()
  await act(async () => fresh.resolve([{ id: m.market, pool: 2 }]))
  await act(async () => old.resolve([{ id: m.market, pool: 1 }]))
  expect(m.latest().pool).toBe(2)
})

it('gives an older request the newer value when the newer one finishes first', async () => {
  const old = deferred(),
    fresh = deferred()
  let calls = 0
  const read = () => (++calls === 1 ? old.promise : fresh.promise)
  const first = await mount(read)
  first.dispatch()
  const second = await mount(read, first.market)
  second.dispatch()
  await act(async () => fresh.resolve([{ id: first.market, pool: 2 }]))
  await act(async () => old.resolve([{ id: first.market, pool: 1 }]))
  expect(second.latest().pool).toBe(2)
  expect(first.latest().pool).toBe(2)
  // A later mount starts from the shared cache, which must not have regressed.
  const later = await mount(() => new Promise(() => {}), first.market)
  expect(later.latest().pool).toBe(2)
})

it('gives a failed older request the newer value', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  let fail!: (error: Error) => void
  const old = new Promise<any[]>((_, no) => (fail = no))
  const fresh = deferred()
  let calls = 0
  const read = () => (++calls === 1 ? old : fresh.promise)
  const first = await mount(read)
  first.dispatch()
  const second = await mount(read, first.market)
  second.dispatch()
  await act(async () => fresh.resolve([{ id: first.market, pool: 2 }]))
  await act(async () => fail(new Error('offline')))
  expect(first.latest().pool).toBe(2)
  log.mockRestore()
})

it.each(['succeeds', 'fails'])(
  'does not replay an update a newer origin read already includes when the older request %s',
  async (outcome) => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    let settle!: () => void
    const old = new Promise<any[]>((yes, no) => {
      settle = () =>
        outcome === 'fails'
          ? no(new Error('offline'))
          : yes([{ id: market, pool: 1 }])
    })
    const fresh = deferred()
    let calls = 0
    const read = () => (++calls === 1 ? old : fresh.promise)
    const first = await mount(read, undefined, 'markets-fresh')
    const market = first.market
    first.dispatch()
    // Live update received while the first read is in flight.
    await first.setValue((prev: any) => ({ ...prev, pool: 2 }))
    // A later read sees a newer change whose broadcast hasn't arrived.
    const second = await mount(read, market, 'markets-fresh')
    second.dispatch()
    await act(async () => fresh.resolve([{ id: market, pool: 3 }]))
    await act(async () => settle())
    expect(first.latest().pool).toBe(3)
    expect(second.latest().pool).toBe(3)
    const later = await mount(
      () => new Promise(() => {}),
      market,
      'markets-fresh'
    )
    expect(later.latest().pool).toBe(3)
    log.mockRestore()
  }
)

it('replays updates that arrive after the newer origin read started', async () => {
  const old = deferred(),
    fresh = deferred()
  let calls = 0
  const read = () => (++calls === 1 ? old.promise : fresh.promise)
  const first = await mount(read, undefined, 'markets-fresh')
  first.dispatch()
  await first.setValue((prev: any) => ({ ...prev, pool: 2 }))
  const second = await mount(read, first.market, 'markets-fresh')
  second.dispatch()
  await first.setValue((prev: any) => ({ ...prev, pool: 4 }))
  await act(async () => fresh.resolve([{ id: first.market, pool: 3 }]))
  await act(async () => old.resolve([{ id: first.market, pool: 1 }]))
  expect(first.latest().pool).toBe(4)
})

it('replays updates from before dispatch over a cached response', async () => {
  const read = deferred()
  const m = await mount(() => read.promise)
  // A broadcast during the batching delay, missing from the CDN's copy.
  await m.setValue((prev: any) => ({ ...prev, pool: 2 }))
  m.dispatch()
  await act(async () => read.resolve([{ id: m.market, pool: 1 }]))
  expect(m.latest().pool).toBe(2)
})

it('lets an origin read replace updates from before dispatch', async () => {
  const read = deferred()
  const m = await mount(() => read.promise, undefined, 'markets-fresh')
  await m.setValue((prev: any) => ({ ...prev, pool: 2 }))
  m.dispatch()
  await act(async () => read.resolve([{ id: m.market, pool: 3 }]))
  expect(m.latest().pool).toBe(3)
})

it('replays recent updates over a cached refresh until it must include them', async () => {
  let now = 1_000_000
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => now)
  try {
    let pool = 1
    const m = await mount(async () => [{ id: m.market, pool }])
    m.dispatch()
    await act(async () => {})
    await m.setValue((prev: any) => ({ ...prev, pool: 2 }))
    // A refresh soon after can get a cached copy from before that update.
    now += 1_000
    await m.refresh()
    m.dispatch()
    await act(async () => {})
    expect(m.latest().pool).toBe(2)
    // Once any cached copy postdates it, the response wins.
    pool = 3
    now += 60_000
    await m.refresh()
    m.dispatch()
    await act(async () => {})
    expect(m.latest().pool).toBe(3)
  } finally {
    clock.mockRestore()
  }
})

it('replays live pool changes over the fetched market snapshot', async () => {
  const read = deferred()
  const m = await mount(() => read.promise)
  m.dispatch()
  await m.setValue((prev: any) => ({ ...prev, pool: 3 }))
  await act(async () =>
    read.resolve([{ id: m.market, pool: 1, title: 'Fresh title' }])
  )
  expect(m.latest()).toEqual({ id: m.market, pool: 3, title: 'Fresh title' })
})

it('keeps the last value on failure and can retry', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  let calls = 0
  const m = await mount(async () => {
    if (++calls === 1) throw new Error('offline')
    return [{ id: m.market, pool: 9 }]
  })
  await act(async () => {
    m.dispatch()
  })
  expect(m.latest().pool).toBe(0)
  await m.refresh()
  await act(async () => {
    m.dispatch()
  })
  expect(m.latest().pool).toBe(9)
  log.mockRestore()
})
