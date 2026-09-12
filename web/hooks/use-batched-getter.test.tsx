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
let root: ReactTestRenderer
let id = 0
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(async () => {
  await act(async () => root?.unmount())
  executeBatchQuery.cancel()
})

async function mount(read: () => Promise<any[]>) {
  const market = `batch-${id++}`
  let latest: any,
    setValue: any,
    refreshKey = 0
  function Consumer() {
    ;[latest, setValue] = useBatchedGetter(
      { markets: read },
      'markets',
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
