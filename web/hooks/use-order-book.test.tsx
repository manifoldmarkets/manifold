import { act, create, ReactTestRenderer } from 'react-test-renderer'
import { maxCachedAgeMs } from 'common/api/cache'
import { API } from 'common/api/schema'
import { LimitBet } from 'common/bet'
import {
  useUnfilledBets,
  applyLimitOrderUpdates,
} from 'client-common/hooks/use-bets'

let mockVisible = true
let mockGeneration = 0
const mockReconnectListeners = new Set<(count: number) => void>()
const mockSubscriptions = new Set<any>()
jest.mock('client-common/hooks/use-api-subscription', () => {
  const React = jest.requireActual('react')
  return {
    useWebsocketReconnectCount: () => {
      const [count, setCount] = React.useState(mockGeneration)
      React.useEffect(() => {
        mockReconnectListeners.add(setCount)
        return () => mockReconnectListeners.delete(setCount)
      }, [])
      return count
    },
    useApiSubscription: (options: any) => {
      React.useEffect(() => {
        if (options.enabled === false) return
        mockSubscriptions.add(options)
        return () => mockSubscriptions.delete(options)
      }, [options.enabled, JSON.stringify(options.topics)])
    },
  }
})

jest.mock('client-common/hooks/use-staggered-reconnect-count', () => {
  // Load it with the shortest reconnect delay a client can draw.
  const random = jest.spyOn(Math, 'random').mockReturnValue(0)
  try {
    return jest.requireActual(
      'client-common/hooks/use-staggered-reconnect-count'
    )
  } finally {
    random.mockRestore()
  }
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
const order = (contractId: string, id = 'a', fields: Partial<LimitBet> = {}) =>
  ({
    id,
    contractId,
    userId: 'maker',
    createdTime: 1,
    isFilled: false,
    isCancelled: false,
    ...fields,
  } as LimitBet)
let nextId = 0
let root: ReactTestRenderer | undefined
beforeEach(() => {
  ;(globalThis as any).window = {}
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  mockVisible = true
  mockGeneration = 0
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  delete (globalThis as any).window
})

async function mount(
  read: (params: any) => Promise<LimitBet[]>,
  id = `market-${nextId++}`,
  n = 1,
  options: { fresh?: boolean } = {}
) {
  const latest: (LimitBet[] | undefined)[] = []
  let contractId = id
  function Consumer({ i }: { i: number }) {
    latest[i] = useUnfilledBets(contractId, read, () => mockVisible, options)
    return null
  }
  const render = () => (
    <>
      {Array.from({ length: n }, (_, i) => (
        <Consumer key={i} i={i} />
      ))}
    </>
  )
  await act(async () => {
    root = create(render())
  })
  return {
    id,
    latest,
    update: async (id = contractId) => {
      contractId = id
      await act(async () => root!.update(render()))
    },
    broadcast: async (bets: LimitBet[]) =>
      act(async () => {
        for (const sub of mockSubscriptions)
          if (sub.topics.includes(`contract/${contractId}/orders`))
            sub.onBroadcast({ data: { bets } })
      }),
    reconnect: async () =>
      act(async () => {
        mockGeneration++
        for (const listener of mockReconnectListeners) listener(mockGeneration)
      }),
  }
}

it('shares a confirmed cancel across mounted consumers and later mounts', async () => {
  const id = `market-${nextId++}`
  const m = await mount(async () => [order(id)], id, 2)
  await act(async () =>
    applyLimitOrderUpdates([order(id, 'a', { isCancelled: true })])
  )
  expect(m.latest).toEqual([[], []])
  await act(async () => root!.unmount())
  root = undefined
  const later = await mount(() => new Promise(() => {}), id)
  expect(later.latest[0]).toEqual([])
})

it('keeps live additions and cancellations when the initial request finishes', async () => {
  const read = deferred<LimitBet[]>()
  const m = await mount(() => read.promise)
  await m.broadcast([order(m.id, 'a', { isCancelled: true }), order(m.id, 'b')])
  await act(async () => read.resolve([order(m.id)]))
  expect(m.latest[0]?.map((b) => b.id)).toEqual(['b'])
})

it('ignores a request from before reconnect even if it finishes last', async () => {
  const old = deferred<LimitBet[]>(),
    fresh = deferred<LimitBet[]>()
  let calls = 0
  const m = await mount(
    () => (++calls === 1 ? old.promise : fresh.promise),
    undefined,
    1,
    { fresh: true }
  )
  await m.reconnect()
  await act(async () => fresh.resolve([]))
  await act(async () => old.resolve([order(m.id)]))
  expect(m.latest[0]).toEqual([])
})

it('starts a fresh request after refocus instead of reusing the pending pre-hide read', async () => {
  const old = deferred<LimitBet[]>()
  let calls = 0
  const m = await mount(() =>
    ++calls === 1 ? old.promise : Promise.resolve([])
  )
  mockVisible = false
  await m.update()
  expect(calls).toBe(1)
  mockVisible = true
  await m.update()
  expect(calls).toBe(2)
  await act(async () => old.resolve([order(m.id)]))
  expect(m.latest[0]).toEqual([])
})

it('does not write a previous market response into a new market', async () => {
  const old = deferred<LimitBet[]>()
  let calls = 0
  const m = await mount(() =>
    ++calls === 1 ? old.promise : Promise.resolve([])
  )
  await m.update(`other-${nextId++}`)
  await act(async () => old.resolve([order(m.id)]))
  expect(m.latest[0]).toEqual([])
})

it('refreshes a quote book after the subscription acknowledgment', async () => {
  let calls = 0
  const m = await mount(
    async () => {
      calls++
      return []
    },
    undefined,
    1,
    { fresh: true }
  )
  await act(async () => {
    for (const sub of mockSubscriptions)
      if (sub.topics.includes(`contract/${m.id}/orders`)) sub.onSubscribed?.()
  })
  expect(calls).toBe(2)
})

it('keeps the mount read when the acknowledgment read fails', async () => {
  const first = deferred<LimitBet[]>()
  let calls = 0
  const error = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const m = await mount(
      () => (++calls === 1 ? first.promise : Promise.reject(new Error('503'))),
      undefined,
      1,
      { fresh: true }
    )
    await act(async () => {
      for (const sub of mockSubscriptions)
        if (sub.topics.includes(`contract/${m.id}/orders`)) sub.onSubscribed?.()
    })
    await act(async () => first.resolve([order(m.id)]))
    expect(calls).toBe(2)
    expect(m.latest[0]?.map((b) => b.id)).toEqual(['a'])
  } finally {
    error.mockRestore()
  }
})

const advance = async (ms: number) => {
  // In steps, so consumers whose delays differ would refetch separately.
  for (let elapsed = 0; elapsed < ms; elapsed += 1_000)
    await act(async () => {
      jest.advanceTimersByTime(Math.min(1_000, ms - elapsed))
    })
}

it('reads display books through the CDN and reconciles after the first connection', async () => {
  jest.useFakeTimers()
  try {
    const read = jest.fn(async (_params: any) => [] as LimitBet[])
    const m = await mount(read)
    expect(read).toHaveBeenCalledTimes(1)
    expect(read.mock.calls[0][0]).not.toHaveProperty('fresh')
    // No extra read when the subscription is acknowledged.
    await act(async () => {
      for (const sub of mockSubscriptions)
        if (sub.topics.includes(`contract/${m.id}/orders`)) sub.onSubscribed?.()
    })
    expect(read).toHaveBeenCalledTimes(1)
    // The mount read could have missed broadcasts sent before the first
    // connection, so it is reconciled once the CDN's copy must postdate it.
    await m.reconnect()
    await advance(maxCachedAgeMs(API.bets.cache))
    expect(read).toHaveBeenCalledTimes(1)
    await advance(45_000)
    expect(read).toHaveBeenCalledTimes(2)
  } finally {
    jest.useRealTimers()
  }
})

it('reconciles a display book mounted on an open connection only after a reconnect', async () => {
  jest.useFakeTimers()
  try {
    mockGeneration = 1
    const read = jest.fn(async (_params: any) => [] as LimitBet[])
    const m = await mount(read)
    await advance(60_000)
    expect(read).toHaveBeenCalledTimes(1)
    // Were each consumer to draw its own delay, these would set them apart.
    const random = jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.9)
    await m.reconnect()
    random.mockRestore()
    await advance(maxCachedAgeMs(API.bets.cache))
    expect(read).toHaveBeenCalledTimes(1)
    await advance(45_000)
    expect(read).toHaveBeenCalledTimes(2)
  } finally {
    jest.useRealTimers()
  }
})

it('keeps a live cancel when a cached display refresh predates it', async () => {
  const id = `market-${nextId++}`
  // The CDN keeps serving its copy from before the cancel.
  const m = await mount(async () => [order(id)], id)
  await m.broadcast([order(id, 'a', { isCancelled: true })])
  expect(m.latest[0]).toEqual([])
  mockVisible = false
  await m.update()
  mockVisible = true
  await m.update()
  expect(m.latest[0]).toEqual([])
})

it('does not replay an order from before every consumer unmounted', async () => {
  const id = `market-${nextId++}`
  const m = await mount(async () => [], id)
  await m.broadcast([order(id)])
  expect(m.latest[0]?.map((b) => b.id)).toEqual(['a'])
  await act(async () => root!.unmount())
  root = undefined
  // Its cancellation goes unseen, and the remount's read is up to date.
  const later = await mount(async () => [], id)
  expect(later.latest[0]).toEqual([])
})

it('still replays a confirmed cancel over a stale read after remount', async () => {
  const id = `market-${nextId++}`
  await mount(async () => [order(id)], id)
  await act(async () => root!.unmount())
  root = undefined
  await act(async () =>
    applyLimitOrderUpdates([order(id, 'a', { isCancelled: true })])
  )
  // The CDN keeps serving its copy from before the cancel.
  const later = await mount(async () => [order(id)], id)
  expect(later.latest[0]).toEqual([])
})

it('keeps a cached display read out of the quote book', async () => {
  const id = `market-${nextId++}`
  const latest: { quote?: LimitBet[]; display?: LimitBet[] } = {}
  // The CDN copy still lists an order the origin no longer has.
  const readQuote = async () => [] as LimitBet[]
  const readDisplay = async () => [order(id)]
  function Consumer({ fresh }: { fresh: boolean }) {
    latest[fresh ? 'quote' : 'display'] = useUnfilledBets(
      id,
      fresh ? readQuote : readDisplay,
      () => mockVisible,
      { fresh }
    )
    return null
  }
  await act(async () => {
    root = create(
      <>
        <Consumer fresh />
        <Consumer fresh={false} />
      </>
    )
  })
  expect(latest.quote).toEqual([])
  expect(latest.display?.map((b) => b.id)).toEqual(['a'])
  await act(async () =>
    applyLimitOrderUpdates([order(id, 'a', { isCancelled: true })])
  )
  expect(latest.display).toEqual([])
})

it('expires an idle order without waiting for another render or event', async () => {
  jest.useFakeTimers()
  try {
    const id = `market-${nextId++}`
    const m = await mount(
      async () => [order(id, 'a', { expiresAt: Date.now() + 1000 })],
      id
    )
    expect(m.latest[0]).toHaveLength(1)
    await act(async () => {
      jest.advanceTimersByTime(1000)
    })
    expect(m.latest[0]).toEqual([])
  } finally {
    jest.useRealTimers()
  }
})
