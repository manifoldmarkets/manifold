import { DAY_MS, HOUR_MS, MINUTE_MS, MONTH_MS, WEEK_MS } from 'common/util/time'
import { ProbChanges } from './prob-changes'
import { updateContractMetricsCore } from './update-contract-metrics-core'

// Included in the shared CI suite. To run just this regression:
//   yarn --cwd backend/shared test --testPathPattern update-contract-metrics-core

type FakeBet = { time: number; probBefore: number; probAfter: number }
type FakeAnswer = {
  id: string
  prob: number
  probChanges: ProbChanges
  resolution?: 'YES' | 'NO'
  resolutionTime?: number
}
type FakeMarket = {
  id: string
  lastBetTime: number
  // Binary markets have a pool probability; multiple choice ones have answers.
  prob?: number
  probChanges?: ProbChanges
  answers?: FakeAnswer[]
}

const mockState: {
  pg: unknown
  contractUpdates: { id: string; probChanges?: ProbChanges }[]
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
    updates: { id: string; probChanges?: ProbChanges }[]
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

const now = Date.parse('2026-11-11T12:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()

// A stand-in for the tables the job reads. `bets` is keyed the way the job keys
// its lookups: the contract id, plus the answer id for an answer.
const fakeDb = (markets: FakeMarket[], bets: Record<string, FakeBet[]>) => {
  // Every historical-probability lookup the job makes: the time it asked
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

  const pg = {
    multi: async () => [
      markets.map((m) => ({
        data: {
          id: m.id,
          mechanism: m.answers ? 'cpmm-multi-1' : 'cpmm-1',
          shouldAnswersSumToOne: false,
          lastBetTime: m.lastBetTime,
          prob: m.prob,
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
              res_time: null,
              pool_prob: String(m.prob),
              res_prob: null,
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

  // Run the job, then store what it wrote, as the real tables would.
  const run = async (wholeMonth: boolean) => {
    lookups.length = 0
    mockState.pg = pg
    mockState.contractUpdates = []
    mockState.answerUpdates = []
    await updateContractMetricsCore(wholeMonth)
    for (const update of mockState.contractUpdates) {
      const market = markets.find((m) => m.id === update.id)
      if (market && update.probChanges) market.probChanges = update.probChanges
    }
    for (const update of mockState.answerUpdates) {
      const answer = markets
        .flatMap((m) => m.answers ?? [])
        .find((a) => a.id === update.id)
      if (answer) answer.probChanges = update.probChanges
    }
  }

  const monthLookupIds = () =>
    lookups
      .filter((l) => l.when === now - MONTH_MS)
      .flatMap((l) => l.contractIds)
      .sort()
  const lookupIdsAt = (when: number) =>
    lookups
      .filter((l) => l.when === when)
      .flatMap((l) => l.contractIds)
      .sort()

  return { run, monthLookupIds, lookupIdsAt }
}

// A binary market that last traded three days ago: 40% a month ago, 70% now.
const quietBinary = (): FakeMarket => ({
  id: 'quiet',
  lastBetTime: now - 3 * DAY_MS,
  prob: 0.7,
  probChanges: { day: 0, week: 0.3, month: 0.3 },
})
const quietBinaryBets: FakeBet[] = [
  { time: now - 40 * DAY_MS, probBefore: 0.5, probAfter: 0.4 },
  { time: now - 3 * DAY_MS, probBefore: 0.4, probAfter: 0.7 },
]

// A binary market that traded ten minutes ago: 20% a month ago, 55% now.
const activeBinary = (storedMonthChange: number): FakeMarket => ({
  id: 'active',
  lastBetTime: now - 10 * MINUTE_MS,
  prob: 0.55,
  probChanges: { day: 0, week: 0, month: storedMonthChange },
})
const activeBinaryBets: FakeBet[] = [
  { time: now - 40 * DAY_MS, probBefore: 0.5, probAfter: 0.2 },
  { time: now - 10 * MINUTE_MS, probBefore: 0.2, probAfter: 0.55 },
]

describe('updateContractMetricsCore month change', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now)
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('a frequent run leaves a quiet binary market month change alone, run after run', async () => {
    const quiet = quietBinary()
    const db = fakeDb([quiet], { quiet: quietBinaryBets })

    for (let i = 0; i < 4; i++) {
      await db.run(false)
      // The old code wrote 0.7 - 0.3 = 0.4 here, then 0.3, then 0.4, ...
      expect(quiet.probChanges?.month).toBeCloseTo(0.3, 12)
      expect(db.monthLookupIds()).toEqual([])
    }
    // Day and week are still recomputed from history on every run.
    expect(quiet.probChanges?.day).toBeCloseTo(0, 12)
    expect(quiet.probChanges?.week).toBeCloseTo(0.3, 12)
    expect(db.lookupIdsAt(now - DAY_MS)).toEqual(['quiet'])
    expect(db.lookupIdsAt(now - WEEK_MS)).toEqual(['quiet'])
  })

  it('a frequent run leaves a quiet answer month change alone, run after run', async () => {
    // The prod observation: an answer at 100% whose stored month change of
    // 0.200 read 0.800 after one run and 0.200 after the next.
    const market: FakeMarket = {
      id: 'house',
      lastBetTime: now - 3 * DAY_MS,
      answers: [
        { id: 'az1', prob: 1, probChanges: { day: 0, week: 0.2, month: 0.2 } },
        { id: 'ak', prob: 0, probChanges: { day: 0, week: 0, month: -0.005 } },
      ],
    }
    const db = fakeDb([market], {})

    for (let i = 0; i < 4; i++) {
      await db.run(false)
      expect(market.answers?.[0].probChanges.month).toBeCloseTo(0.2, 12)
      expect(market.answers?.[1].probChanges.month).toBeCloseTo(-0.005, 12)
      expect(db.monthLookupIds()).toEqual([])
    }
  })

  it('a frequent run recomputes the month change of a market that just traded', async () => {
    const quiet = quietBinary()
    // 0.9 stands for a value the old code left behind.
    const active = activeBinary(0.9)
    const db = fakeDb([quiet, active], {
      quiet: quietBinaryBets,
      active: activeBinaryBets,
    })

    await db.run(false)

    expect(db.monthLookupIds()).toEqual(['active'])
    expect(active.probChanges?.month).toBeCloseTo(0.55 - 0.2, 12)
    expect(quiet.probChanges?.month).toBeCloseTo(0.3, 12)
    expect(db.lookupIdsAt(now - DAY_MS)).toEqual(['active', 'quiet'])
  })

  it('a frequent run recomputes every answer of a market where one just resolved', async () => {
    const market: FakeMarket = {
      id: 'races',
      lastBetTime: now - 3 * DAY_MS,
      answers: [
        {
          id: 'won',
          prob: 0.8,
          resolution: 'YES',
          resolutionTime: now - 5 * MINUTE_MS,
          probChanges: { day: 0, week: 0, month: 0.5 },
        },
        {
          id: 'open',
          prob: 0.25,
          probChanges: { day: 0, week: 0, month: 0.1 },
        },
      ],
    }
    const db = fakeDb([market], {
      raceswon: [{ time: now - 40 * DAY_MS, probBefore: 0.5, probAfter: 0.3 }],
      racesopen: [
        { time: now - 40 * DAY_MS, probBefore: 0.5, probAfter: 0.15 },
        { time: now - 3 * DAY_MS, probBefore: 0.15, probAfter: 0.25 },
      ],
    })

    await db.run(false)

    expect(db.monthLookupIds()).toEqual(['races'])
    // Resolved YES: measured from 100%, not from the 80% pool.
    expect(market.answers?.[0].probChanges.month).toBeCloseTo(1 - 0.3, 12)
    expect(market.answers?.[1].probChanges.month).toBeCloseTo(0.25 - 0.15, 12)
  })

  it('a market that traded just outside the refresh window keeps its month change', async () => {
    const stale: FakeMarket = {
      ...activeBinary(0.9),
      lastBetTime: now - 2 * HOUR_MS - MINUTE_MS,
    }
    const db = fakeDb([stale], { active: activeBinaryBets })

    await db.run(false)

    expect(db.monthLookupIds()).toEqual([])
    expect(stale.probChanges?.month).toBe(0.9)
  })

  it('the daily full run recomputes every market, repairing a wrong stored value', async () => {
    const quiet = {
      ...quietBinary(),
      probChanges: { day: 0, week: 0.3, month: 0.4 },
    }
    const active = activeBinary(0.9)
    const market: FakeMarket = {
      id: 'house',
      lastBetTime: now - 3 * DAY_MS,
      answers: [
        { id: 'az1', prob: 1, probChanges: { day: 0, week: 0.2, month: 0.8 } },
      ],
    }
    const db = fakeDb([quiet, active, market], {
      quiet: quietBinaryBets,
      active: activeBinaryBets,
      houseaz1: [
        { time: now - 40 * DAY_MS, probBefore: 0.5, probAfter: 0.8 },
        { time: now - 3 * DAY_MS, probBefore: 0.8, probAfter: 1 },
      ],
    })

    await db.run(true)

    expect(db.monthLookupIds()).toEqual(['active', 'house', 'quiet'])
    expect(quiet.probChanges?.month).toBeCloseTo(0.3, 12)
    expect(active.probChanges?.month).toBeCloseTo(0.35, 12)
    expect(market.answers?.[0].probChanges.month).toBeCloseTo(0.2, 12)

    // And the frequent runs that follow keep those values.
    await db.run(false)
    await db.run(false)
    expect(quiet.probChanges?.month).toBeCloseTo(0.3, 12)
    expect(market.answers?.[0].probChanges.month).toBeCloseTo(0.2, 12)
  })
})
