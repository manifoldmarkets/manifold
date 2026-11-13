import { DAY_MS, MINUTE_MS, MONTH_MS, WEEK_MS } from 'common/util/time'
import { ProbChanges } from './prob-changes'
import { updateContractMetricsCore } from './update-contract-metrics-core'

// Included in the shared CI suite. To run just this regression:
//   yarn --cwd backend/shared test --testPathPattern update-contract-metrics-core

type FakeBet = { time: number; probBefore: number; probAfter: number }
type FakeAnswer = {
  id: string
  // The pool's probability, which is also what the answers table stores.
  prob: number
  probChanges: ProbChanges
  resolution?: 'YES' | 'NO'
  resolutionTime?: number
}
type FakeMarket = {
  id: string
  lastBetTime: number
  // Binary markets: the pool's probability, the probability stored on the
  // contract (the job stores the resolution value there once resolved), and
  // the resolution.
  poolProb?: number
  storedProb?: number
  resolution?: 'YES' | 'NO'
  resolutionTime?: number
  probChanges?: ProbChanges
  // Multiple choice markets.
  shouldAnswersSumToOne?: boolean
  answers?: FakeAnswer[]
}

const mockState: {
  pg: unknown
  contractUpdates: { id: string; prob?: number; probChanges?: ProbChanges }[]
  answerUpdates: { id: string; probChanges: ProbChanges }[]
} = { pg: undefined, contractUpdates: [], answerUpdates: [] }

jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: () => mockState.pg,
}))
jest.mock('shared/utils', () => ({
  log: () => undefined,
  contractColumnsToSelect: 'data',
}))
jest.mock('common/calculate-metrics', () => ({ computeElasticity: () => 1 }))
jest.mock('./supabase/utils', () => ({
  bulkUpdateData: async (
    _pg: unknown,
    _table: string,
    updates: { id: string; prob?: number; probChanges?: ProbChanges }[]
  ) => {
    mockState.contractUpdates.push(...updates)
  },
}))
jest.mock('./supabase/answers', () => ({
  bulkUpdateAnswers: async (
    _pg: unknown,
    updates: { id: string; probChanges: ProbChanges }[]
  ) => {
    mockState.answerUpdates.push(...updates)
  },
}))

const start = Date.parse('2026-11-11T12:00:00Z')
let clock = start
const iso = (ms: number) => new Date(ms).toISOString()
const ZERO: ProbChanges = { day: 0, week: 0, month: 0 }
// How far apart the scheduler's frequent runs are.
const RUN_GAP_MS = 21 * MINUTE_MS

// A stand-in for the tables the job reads and writes. `bets` is keyed the way
// the job keys its lookups: the contract id, plus the answer id for an answer.
const fakeDb = (markets: FakeMarket[], bets: Record<string, FakeBet[]>) => {
  // Every historical-probability lookup of the latest run: the time it asked
  // about and the contracts it asked for.
  const lookups: { when: number; contractIds: string[] }[] = []

  // What the job's LATERAL pair returns: prob_before of the first bet at or
  // after `when`, else prob_after of the last bet before it, else no row.
  const probAt = (key: string, when: number) => {
    const sorted = [...(bets[key] ?? [])].sort((a, b) => a.time - b.time)
    const firstAfter = sorted.find((b) => b.time >= when)
    if (firstAfter) return firstAfter.probBefore
    const before = sorted.filter((b) => b.time < when)
    return before.length ? before[before.length - 1].probAfter : undefined
  }
  const find = (ids: string[]) => markets.filter((m) => ids.includes(m.id))
  const resProb = (resolution: 'YES' | 'NO' | undefined) =>
    resolution === 'YES' ? '1' : resolution === 'NO' ? '0' : null

  const pg = {
    multi: async () => [
      markets.map((m) => ({
        data: {
          id: m.id,
          mechanism: m.answers ? 'cpmm-multi-1' : 'cpmm-1',
          shouldAnswersSumToOne: !!m.shouldAnswersSumToOne,
          lastBetTime: m.lastBetTime,
          prob: m.storedProb,
          probChanges: m.probChanges,
          volume24Hours: 0,
          uniqueBettorCountDay: 0,
          elasticity: 1,
        },
        importance_score: 0,
      })),
      markets.flatMap((m) =>
        (m.answers ?? []).map((a, index) => ({
          id: a.id,
          contract_id: m.id,
          index,
          prob: a.prob,
          resolution: a.resolution ?? null,
          resolution_time: a.resolutionTime ? iso(a.resolutionTime) : null,
          prob_change_day: a.probChanges.day,
          prob_change_week: a.probChanges.week,
          prob_change_month: a.probChanges.month,
        }))
      ),
    ],
    manyOrNone: async (query: string, values: unknown[]) => {
      if (query.includes('FROM answers WHERE contract_id = ANY($1)'))
        return find(values[0] as string[]).flatMap((m) =>
          (m.answers ?? []).map((a) => ({ contract_id: m.id, answer_id: a.id }))
        )
      if (query.includes('limitProb')) return []
      throw new Error('unexpected manyOrNone query: ' + query)
    },
    map: async (
      query: string,
      values: unknown[],
      cb: (row: Record<string, unknown>) => unknown
    ) => {
      if (query.includes('get_cpmm_pool_prob'))
        return find(values[0] as string[])
          .filter((m) => !m.answers)
          .map((m) =>
            cb({
              id: m.id,
              res_time: m.resolutionTime ? iso(m.resolutionTime) : null,
              pool_prob: String(m.poolProb),
              res_prob: resProb(m.resolution),
            })
          )
      if (query.includes('user_trades')) return []
      if (query.includes('LEFT JOIN LATERAL')) {
        const when = values[0] as number
        const contractIds = values[1] as string[]
        lookups.push({ when, contractIds })
        return find(contractIds)
          .flatMap((m) =>
            m.answers
              ? m.answers.map((a) => ({
                  contract_id: m.id,
                  answer_id: a.id,
                  prob: probAt(m.id + a.id, when),
                }))
              : [{ contract_id: m.id, prob: probAt(m.id, when) }]
          )
          .filter((row) => row.prob !== undefined)
          .map((row) => cb({ ...row, prob: String(row.prob) }))
      }
      throw new Error('unexpected map query: ' + query)
    },
  }

  const allAnswers = () => markets.flatMap((m) => m.answers ?? [])

  // Run the job, then store what it wrote, as the real tables would.
  const run = async (wholeMonth: boolean) => {
    lookups.length = 0
    mockState.pg = pg
    mockState.contractUpdates = []
    mockState.answerUpdates = []
    await updateContractMetricsCore(wholeMonth)
    for (const update of mockState.contractUpdates) {
      const market = markets.find((m) => m.id === update.id)
      if (!market) continue
      if (update.probChanges) market.probChanges = update.probChanges
      if (update.prob !== undefined) market.storedProb = update.prob
    }
    for (const update of mockState.answerUpdates) {
      const answer = allAnswers().find((a) => a.id === update.id)
      if (answer) answer.probChanges = update.probChanges
    }
  }
  // The next frequent run, 21 minutes after the last one.
  const frequentRun = async () => {
    clock += RUN_GAP_MS
    await run(false)
  }

  // A bet that moves a binary market, or one answer, to `toProb` right now.
  const trade = (marketId: string, toProb: number, answerId?: string) => {
    const market = markets.find((m) => m.id === marketId)
    if (!market) throw new Error('no market ' + marketId)
    const answer = market.answers?.find((a) => a.id === answerId)
    const key = marketId + (answerId ?? '')
    const from = answer ? answer.prob : market.poolProb
    bets[key] = [
      ...(bets[key] ?? []),
      { time: clock, probBefore: from as number, probAfter: toProb },
    ]
    market.lastBetTime = clock
    if (answer) answer.prob = toProb
    else {
      market.poolProb = toProb
      // Placing a bet stores the new probability on the contract too.
      market.storedProb = toProb
    }
  }

  const lookupIdsAt = (when: number) =>
    lookups
      .filter((l) => l.when === when)
      .flatMap((l) => l.contractIds)
      .sort()
  const monthLookupIds = () => lookupIdsAt(clock - MONTH_MS)

  return { run, frequentRun, trade, monthLookupIds, lookupIdsAt }
}

// A binary market that last traded three days ago: 40% a month ago, 70% now.
const quietBinary = (): FakeMarket => ({
  id: 'quiet',
  lastBetTime: start - 3 * DAY_MS,
  poolProb: 0.7,
  storedProb: 0.7,
  probChanges: ZERO,
})
const quietBinaryBets = (): FakeBet[] => [
  { time: start - 40 * DAY_MS, probBefore: 0.5, probAfter: 0.4 },
  { time: start - 3 * DAY_MS, probBefore: 0.4, probAfter: 0.7 },
]

// An independent multiple choice market that last traded three days ago. Its
// answer went from 80% a month ago to 100% of its pool.
const quietMulti = (): FakeMarket & { answers: FakeAnswer[] } => ({
  id: 'house',
  lastBetTime: start - 3 * DAY_MS,
  answers: [{ id: 'az1', prob: 1, probChanges: ZERO }],
})
const quietMultiBets = (): FakeBet[] => [
  { time: start - 40 * DAY_MS, probBefore: 0.5, probAfter: 0.8 },
  { time: start - 3 * DAY_MS, probBefore: 0.8, probAfter: 1 },
]

describe('updateContractMetricsCore month change', () => {
  beforeEach(() => {
    clock = start
    jest.spyOn(Date, 'now').mockImplementation(() => clock)
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('frequent runs leave a quiet binary market alone, run after run', async () => {
    const quiet = quietBinary()
    const db = fakeDb([quiet], { quiet: quietBinaryBets() })

    await db.run(true)
    const afterFullRun = quiet.probChanges
    expect(afterFullRun?.month).toBeCloseTo(0.3, 12)
    expect(afterFullRun?.week).toBeCloseTo(0.3, 12)
    expect(afterFullRun?.day).toBe(0)

    for (let i = 0; i < 4; i++) {
      await db.frequentRun()
      // The old code wrote 0.7 - 0.3 = 0.4 here, then 0.3, then 0.4, ...
      expect(quiet.probChanges).toEqual(afterFullRun)
      expect(db.monthLookupIds()).toEqual([])
      // Day and week are still recomputed from history on every run.
      expect(db.lookupIdsAt(clock - DAY_MS)).toEqual(['quiet'])
      expect(db.lookupIdsAt(clock - WEEK_MS)).toEqual(['quiet'])
    }
  })

  it('frequent runs leave a quiet answer alone, run after run', async () => {
    // The prod observation: an answer at 100% whose stored month change of
    // 0.200 read 0.800 after one run and 0.200 after the next.
    const market = quietMulti()
    const db = fakeDb([market], { houseaz1: quietMultiBets() })

    await db.run(true)
    const afterFullRun = market.answers[0].probChanges
    expect(afterFullRun.month).toBeCloseTo(0.2, 12)

    for (let i = 0; i < 4; i++) {
      await db.frequentRun()
      expect(market.answers[0].probChanges).toEqual(afterFullRun)
      expect(db.monthLookupIds()).toEqual([])
    }
  })

  it('frequent runs leave the answers of a sum-to-one market alone too', async () => {
    const answers: FakeAnswer[] = [
      { id: 'other', prob: 0.12, probChanges: ZERO },
      { id: 'a', prob: 0.88, probChanges: ZERO },
    ]
    const market: FakeMarket = {
      id: 'nominee',
      lastBetTime: start - 10 * DAY_MS,
      shouldAnswersSumToOne: true,
      answers,
    }
    const db = fakeDb([market], {
      nomineeother: [
        { time: start - 40 * DAY_MS, probBefore: 0.2, probAfter: 0.1 },
        { time: start - 10 * DAY_MS, probBefore: 0.1, probAfter: 0.12 },
      ],
      nomineea: [
        { time: start - 40 * DAY_MS, probBefore: 0.8, probAfter: 0.9 },
        { time: start - 10 * DAY_MS, probBefore: 0.9, probAfter: 0.88 },
      ],
    })

    await db.run(true)
    expect(answers[0].probChanges.month).toBeCloseTo(0.02, 12)
    expect(answers[1].probChanges.month).toBeCloseTo(-0.02, 12)
    const afterFullRun = answers.map((a) => a.probChanges)

    for (let i = 0; i < 3; i++) {
      await db.frequentRun()
      expect(answers.map((a) => a.probChanges)).toEqual(afterFullRun)
      expect(db.monthLookupIds()).toEqual([])
    }
  })

  it('a trade moves day and week at the next run, and month at the next full run', async () => {
    // The month change is a daily figure. Between full runs it stays as of the
    // last one, whatever happens to the market.
    const quiet = quietBinary()
    const market = quietMulti()
    const answer = market.answers[0]
    const db = fakeDb([quiet, market], {
      quiet: quietBinaryBets(),
      houseaz1: quietMultiBets(),
    })
    await db.run(true)

    clock += 5 * MINUTE_MS
    db.trade('quiet', 0.55)
    db.trade('house', 0.9, 'az1')
    for (let i = 0; i < 2; i++) {
      await db.frequentRun()
      expect(db.monthLookupIds()).toEqual([])
      expect(quiet.probChanges?.day).toBeCloseTo(0.55 - 0.7, 12)
      expect(quiet.probChanges?.week).toBeCloseTo(0.55 - 0.4, 12)
      expect(quiet.probChanges?.month).toBeCloseTo(0.7 - 0.4, 12)
      expect(answer.probChanges.day).toBeCloseTo(0.9 - 1, 12)
      expect(answer.probChanges.month).toBeCloseTo(1 - 0.8, 12)
    }

    await db.run(true)
    expect(db.monthLookupIds()).toEqual(['house', 'quiet'])
    expect(quiet.probChanges?.month).toBeCloseTo(0.55 - 0.4, 12)
    expect(answer.probChanges.month).toBeCloseTo(0.9 - 0.8, 12)
  })

  it('a resolution is measured from its value: day and week at once, month at the next full run', async () => {
    const quiet = quietBinary()
    const market = quietMulti()
    market.answers = [
      { id: 'won', prob: 0.8, probChanges: ZERO },
      { id: 'open', prob: 0.25, probChanges: ZERO },
    ]
    const db = fakeDb([quiet, market], {
      quiet: quietBinaryBets(),
      housewon: [
        { time: start - 40 * DAY_MS, probBefore: 0.5, probAfter: 0.3 },
        { time: start - 3 * DAY_MS, probBefore: 0.3, probAfter: 0.8 },
      ],
      houseopen: [
        { time: start - 40 * DAY_MS, probBefore: 0.5, probAfter: 0.15 },
        { time: start - 3 * DAY_MS, probBefore: 0.15, probAfter: 0.25 },
      ],
    })
    await db.run(true)
    expect(market.answers[0].probChanges.month).toBeCloseTo(0.5, 12)

    clock += 5 * MINUTE_MS
    quiet.resolution = 'NO'
    quiet.resolutionTime = clock
    market.answers[0].resolution = 'YES'
    market.answers[0].resolutionTime = clock

    await db.frequentRun()
    expect(db.monthLookupIds()).toEqual([])
    expect(quiet.probChanges?.day).toBeCloseTo(0 - 0.7, 12)
    expect(quiet.probChanges?.week).toBeCloseTo(0 - 0.4, 12)
    expect(quiet.probChanges?.month).toBeCloseTo(0.3, 12)
    expect(market.answers[0].probChanges.week).toBeCloseTo(1 - 0.3, 12)
    expect(market.answers[0].probChanges.month).toBeCloseTo(0.5, 12)

    await db.run(true)
    expect(quiet.probChanges?.month).toBeCloseTo(0 - 0.4, 12)
    expect(market.answers[0].probChanges.month).toBeCloseTo(1 - 0.3, 12)
    expect(market.answers[1].probChanges.month).toBeCloseTo(0.25 - 0.15, 12)
  })

  it('a market resolved more than a month ago reads zero on any run', async () => {
    const quiet = quietBinary()
    quiet.resolution = 'YES'
    quiet.resolutionTime = start - 31 * DAY_MS
    quiet.probChanges = { day: 0.1, week: 0.2, month: 0.6 }
    const db = fakeDb([quiet], { quiet: quietBinaryBets() })

    await db.frequentRun()
    expect(quiet.probChanges).toEqual(ZERO)
  })

  it('a wrong stored month change stays until the full run repairs it', async () => {
    const quiet = quietBinary()
    const market = quietMulti()
    const answer = market.answers[0]
    const db = fakeDb([quiet, market], {
      quiet: quietBinaryBets(),
      houseaz1: quietMultiBets(),
    })
    await db.run(true)
    // What the old code left behind after an odd number of frequent runs.
    quiet.probChanges = { ...ZERO, ...quiet.probChanges, month: 0.4 }
    answer.probChanges = { ...answer.probChanges, month: 0.8 }

    await db.frequentRun()
    expect(db.monthLookupIds()).toEqual([])
    expect(quiet.probChanges.month).toBe(0.4)
    expect(answer.probChanges.month).toBe(0.8)

    await db.run(true)
    expect(db.monthLookupIds()).toEqual(['house', 'quiet'])
    expect(quiet.probChanges.month).toBeCloseTo(0.3, 12)
    expect(answer.probChanges.month).toBeCloseTo(0.2, 12)

    // And each frequent run after that keeps the repaired values.
    for (let i = 0; i < 3; i++) {
      await db.frequentRun()
      expect(quiet.probChanges?.month).toBeCloseTo(0.3, 12)
      expect(answer.probChanges.month).toBeCloseTo(0.2, 12)
    }
  })
})
