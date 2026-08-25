import { createFeedDispatcher } from './oracle-feed-dispatcher'

const DEADLINE_MS = 60_000

const makeLog = () => {
  const errors: string[] = []
  const infos: string[] = []
  const log = Object.assign((m: string) => void infos.push(m), {
    error: (m: string) => void errors.push(m),
  })
  return { log, errors, infos }
}

const makeDispatcher = (
  over: Partial<{ perFeed: number; total: number }> = {}
) => {
  const { log, errors, infos } = makeLog()
  return {
    d: createFeedDispatcher({
      deadlineMs: DEADLINE_MS,
      maxAbandonedPerFeed: over.perFeed ?? 3,
      maxAbandonedTotal: over.total ?? 10,
      refusalLogIntervalMs: 5 * 60_000,
      log,
    }),
    errors,
    infos,
  }
}

/** A promise that never settles, plus the signal it was handed. */
const neverSettles = () => {
  const signals: AbortSignal[] = []
  const setters: ((s: string) => void)[] = []
  const run = ({
    signal,
    setPhase,
  }: {
    signal: AbortSignal
    setPhase: (s: string) => void
  }) => {
    signals.push(signal)
    setters.push(setPhase)
    return new Promise<void>(() => {})
  }
  return { run, signals, setters }
}

const makeDispatcher0 = () => {
  const { d } = makeDispatcher()
  return { d, setters: neverSettles() }
}

/** Let queued microtasks (the .finally chains) run. */
const flush = () => Promise.resolve().then(() => Promise.resolve())

describe('createFeedDispatcher', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('runs one poll at a time per feed', async () => {
    const { d } = makeDispatcher()
    const { run } = neverSettles()
    d.dispatch('btc-usd', run)
    d.dispatch('btc-usd', run)
    d.dispatch('btc-usd', run)
    // Two of the three were skipped by the in-flight guard, not queued.
    expect(d.outstandingAbandoned('btc-usd')).toBe(0)
    expect(d.inFlightSince('btc-usd')).toBeDefined()
  })

  it('cancels the run it gives up on, rather than only dropping it', async () => {
    // The regression this guards: a plain Promise.race frees the slot but
    // leaves the work running, so the socket is stranded with nothing holding
    // a reference to it.
    const { d } = makeDispatcher()
    const { run, signals } = neverSettles()
    d.dispatch('btc-usd', run)
    expect(signals[0].aborted).toBe(false)

    jest.advanceTimersByTime(DEADLINE_MS)
    await flush()

    expect(signals[0].aborted).toBe(true)
  })

  it('re-arms the feed after the deadline so it is not dark forever', async () => {
    const { d } = makeDispatcher()
    const { run } = neverSettles()
    d.dispatch('btc-usd', run)
    expect(d.inFlightSince('btc-usd')).toBeDefined()

    jest.advanceTimersByTime(DEADLINE_MS)
    await flush()

    expect(d.inFlightSince('btc-usd')).toBeUndefined()
  })

  it('keeps outstanding work BOUNDED when the source never settles', async () => {
    // The core safety property. Before cancellation and counting, a
    // permanently hung venue produced one orphan per poll indefinitely — the
    // same unbounded accumulation the guard exists to prevent, only quieter.
    const { d, errors } = makeDispatcher({ perFeed: 3 })
    const { run, signals } = neverSettles()

    for (let i = 0; i < 50; i++) {
      d.dispatch('btc-usd', run)
      jest.advanceTimersByTime(DEADLINE_MS)
      await flush()
    }

    expect(d.outstandingAbandoned('btc-usd')).toBe(3)
    expect(signals.length).toBe(3)
    expect(d.isRefused('btc-usd')).toBe(true)
    expect(errors.some((e) => e.includes('refusing to poll'))).toBe(true)
  })

  it('bounds the PROCESS, not just each feed', async () => {
    // The per-feed cap is fairness. dispatch serves every feed in the registry
    // including the daily probes, so at 8 feeds a per-feed cap of 3 alone
    // permits 24 orphans against a 40-connection pool.
    const { d } = makeDispatcher({ perFeed: 3, total: 5 })
    const { run } = neverSettles()
    const feeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

    for (let round = 0; round < 5; round++) {
      for (const f of feeds) {
        d.dispatch(f, run)
        jest.advanceTimersByTime(DEADLINE_MS)
        await flush()
      }
    }

    expect(d.totalAbandoned()).toBeLessThanOrEqual(5)
    // and per-feed never exceeded its own cap either
    for (const f of feeds)
      expect(d.outstandingAbandoned(f)).toBeLessThanOrEqual(3)
  })

  it('gives the budget back when an abandoned run settles late', async () => {
    // Otherwise a feed that recovers on its own stays refused forever.
    const { d, infos } = makeDispatcher({ perFeed: 1 })
    let release!: () => void
    const run = () => new Promise<void>((res) => (release = res))

    d.dispatch('btc-usd', run)
    jest.advanceTimersByTime(DEADLINE_MS)
    await flush()
    expect(d.outstandingAbandoned('btc-usd')).toBe(1)
    expect(d.isRefused('btc-usd')).toBe(false)

    d.dispatch('btc-usd', run) // refused: at the per-feed cap
    expect(d.isRefused('btc-usd')).toBe(true)

    release()
    await flush()

    expect(d.outstandingAbandoned('btc-usd')).toBe(0)
    expect(infos.some((m) => m.includes('settled late'))).toBe(true)
    d.dispatch('btc-usd', run) // budget returned, polling resumes
    expect(d.isRefused('btc-usd')).toBe(false)
  })

  it('does not count a run that settles normally', async () => {
    const { d } = makeDispatcher()
    d.dispatch('btc-usd', async () => {})
    await flush()

    expect(d.outstandingAbandoned('btc-usd')).toBe(0)
    expect(d.inFlightSince('btc-usd')).toBeUndefined()
    expect(d.lastSuccessAt('btc-usd')).toBeDefined()
  })

  it('does not treat a throwing run as abandoned', async () => {
    // tickOneFeed catches internally, but a future edit that lets one throw
    // must not consume orphan budget — it settled, it just settled badly.
    const { d, errors } = makeDispatcher()
    d.dispatch('btc-usd', async () => {
      throw new Error('boom')
    })
    await flush()

    expect(d.outstandingAbandoned('btc-usd')).toBe(0)
    expect(d.inFlightSince('btc-usd')).toBeUndefined()
    expect(errors.some((e) => e.includes('unhandled'))).toBe(true)
  })

  it('reports the phase the wedged run stopped on', async () => {
    // Both latches were diagnosed to "the promise never settled" and no
    // further, because a tick logs nothing between dispatch and completion.
    const { d, errors } = makeDispatcher()
    const { run, setters } = neverSettles()
    d.dispatch('btc-usd', run)
    setters[0]('apply:runOracleUpdate(bitcoin-price-usd)')

    jest.advanceTimersByTime(DEADLINE_MS)
    await flush()

    expect(
      errors.some((e) => e.includes('apply:runOracleUpdate(bitcoin-price-usd)'))
    ).toBe(true)
  })

  it('ignores a phase write from a run that no longer owns the slot', async () => {
    // An abandoned run keeps executing; it must not relabel the feed's state.
    const { d, setters } = makeDispatcher0()
    d.dispatch('btc-usd', setters.run)
    jest.advanceTimersByTime(DEADLINE_MS)
    await flush()

    setters.setters[0]('stale-write-from-the-orphan')
    expect(d.phaseOf('btc-usd')).toBeUndefined()
  })

  it('an orphan cannot relabel the phase of the run that REPLACED it', async () => {
    // The defect this guards: setPhase gated on slot occupancy rather than run
    // identity, so a run abandoned at the deadline that later resumed would
    // overwrite its successor's phase — mislabelling the wedge in exactly the
    // multi-orphan scenario the label exists to diagnose. A wrong label is
    // worse than the "unknown" it replaced.
    const { d, errors } = makeDispatcher()
    const orphan = neverSettles()
    d.dispatch('btc-usd', orphan.run)

    jest.advanceTimersByTime(DEADLINE_MS)
    await flush()

    // A replacement takes the slot and reports where IT is.
    const live = neverSettles()
    d.dispatch('btc-usd', live.run)
    live.setters[0]('read-latest-point')

    // The orphan resumes and tries to write its own, much later, step.
    orphan.setters[0]('apply:runOracleUpdate(bitcoin-price-usd)')

    expect(d.phaseOf('btc-usd')).toBe('read-latest-point')

    jest.advanceTimersByTime(DEADLINE_MS)
    await flush()

    const live_line = errors.filter((e) => e.includes('run exceeded')).pop()!
    expect(live_line).toContain('read-latest-point')
    expect(live_line).not.toContain('apply:runOracleUpdate')
  })
})
