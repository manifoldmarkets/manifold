jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))

import { orderBy } from 'lodash'
import {
  buildCalibrationPoints,
  CalibrationBet,
  CalibrationMarket,
  getUserCalibration,
  selectCalibrationSample,
} from 'api/get-user-calibration'
import { SEARCH_TOPICS_TO_SUBTOPICS } from 'common/topics'
import { createSupabaseDirectClient } from 'shared/supabase/init'

type Bet = CalibrationBet & { contract_id: string }

// Deterministic pseudo-random numbers, so failures reproduce.
const lcg = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 2 ** 32
  return seed / 2 ** 32
}

function makeMarkets(seed: number, marketCount: number) {
  const rand = lcg(seed)
  const usedTimes = new Set<number>()
  const bets: Bet[] = []
  const markets: CalibrationMarket[] = []
  for (let i = 0; i < marketCount; i++) {
    const contract_id = `m${i}`
    const resolution = rand() < 0.5 ? 'YES' : 'NO'
    const count = Math.floor(rand() * 40)
    const marketBets: Bet[] = []
    for (let j = 0; j < count; j++) {
      let created_us = Math.floor(rand() * 1e9)
      while (usedTimes.has(created_us)) created_us++
      usedTimes.add(created_us)
      marketBets.push({
        contract_id,
        created_us,
        prob_bucket: 0.5,
        outcome: rand() < 0.5 ? 'YES' : 'NO',
        shares: 1 + Math.floor(rand() * 100),
        resolution,
      })
    }
    // A market's latest bet can be a sale or redemption, newer than any buy.
    const lastBuy = Math.max(0, ...marketBets.map((b) => b.created_us))
    const last_us =
      rand() < 0.3 ? lastBuy + 1 + Math.floor(rand() * 1e6) : lastBuy
    if (marketBets.length > 0 || last_us > 0) {
      markets.push({ contract_id, last_us })
    }
    bets.push(...marketBets)
  }
  return { markets, bets }
}

// Same result as the SQL: newest `size` per market, then newest `size` overall.
const fakeFetch = (bets: Bet[], size: number) => {
  const calls: string[][] = []
  const fetchBets = async (markets: CalibrationMarket[]) => {
    calls.push(markets.map((m) => m.contract_id))
    const ids = new Set(markets.map((m) => m.contract_id))
    const perMarket = markets.flatMap((m) =>
      orderBy(
        bets.filter((b) => b.contract_id === m.contract_id),
        (b) => b.created_us,
        'desc'
      ).slice(0, size)
    )
    return orderBy(
      perMarket.filter((b) => ids.has(b.contract_id)),
      (b) => b.created_us,
      'desc'
    ).slice(0, size)
  }
  return { fetchBets, calls }
}

describe('selectCalibrationSample', () => {
  it.each([
    [1, 50, 25, 7],
    [2, 50, 25, 1],
    [3, 200, 100, 13],
    [4, 200, 5000, 50],
    [5, 10, 3, 2],
    [6, 300, 1, 40],
  ])(
    'matches the newest bets across all markets (seed %d, %d markets, size %d, %d per query)',
    async (seed, marketCount, size, perQuery) => {
      const { markets, bets } = makeMarkets(seed, marketCount)
      const { fetchBets } = fakeFetch(bets, size)

      const sample = await selectCalibrationSample(
        markets,
        fetchBets,
        size,
        perQuery
      )

      const expected = orderBy(bets, (b) => b.created_us, 'desc').slice(0, size)
      expect(sample.map((b) => b.created_us)).toEqual(
        expected.map((b) => b.created_us)
      )
    }
  )

  it('stops before markets whose latest bet is older than a full sample', async () => {
    const bet = (contract_id: string, created_us: number): Bet => ({
      contract_id,
      created_us,
      prob_bucket: 0.5,
      outcome: 'YES',
      shares: 1,
      resolution: 'YES',
    })
    const bets = [
      bet('new', 100),
      bet('new', 90),
      bet('new', 80),
      bet('mid', 85),
      bet('old', 50),
      bet('older', 40),
    ]
    const markets: CalibrationMarket[] = [
      { contract_id: 'older', last_us: 40 },
      { contract_id: 'new', last_us: 100 },
      // A sale at 95 is newer than this market's buys.
      { contract_id: 'mid', last_us: 95 },
      { contract_id: 'old', last_us: 50 },
    ]
    const { fetchBets, calls } = fakeFetch(bets, 3)

    const sample = await selectCalibrationSample(markets, fetchBets, 3, 1)

    expect(sample.map((b) => b.created_us)).toEqual([100, 90, 85])
    expect(calls).toEqual([['new'], ['mid']])
  })

  it('takes the whole sample from one market when that market is newest', async () => {
    const bets: Bet[] = Array.from({ length: 10 }, (_, i) => ({
      contract_id: i < 8 ? 'busy' : 'quiet',
      created_us: i < 8 ? 1000 - i : 10 - i,
      prob_bucket: 0.5,
      outcome: 'NO',
      shares: 1,
      resolution: 'NO',
    }))
    const markets: CalibrationMarket[] = [
      { contract_id: 'quiet', last_us: 10 },
      { contract_id: 'busy', last_us: 1000 },
    ]
    const { fetchBets, calls } = fakeFetch(bets, 5)

    const sample = await selectCalibrationSample(markets, fetchBets, 5, 1)

    expect(sample.map((b) => b.created_us)).toEqual([1000, 999, 998, 997, 996])
    expect(calls).toEqual([['busy']])
  })

  it('reads only the still-eligible prefix of a batch, keeping a market tied at the cutoff', async () => {
    const bet = (contract_id: string, created_us: number): Bet => ({
      contract_id,
      created_us,
      prob_bucket: 0.5,
      outcome: 'YES',
      shares: 1,
      resolution: 'YES',
    })
    const bets = [
      bet('a', 100),
      bet('a', 90),
      bet('b', 80),
      // Ties the sample's oldest bet, so it could belong in the sample.
      bet('tie', 80),
      bet('late', 70),
      bet('later', 60),
    ]
    const markets: CalibrationMarket[] = [
      { contract_id: 'a', last_us: 100 },
      { contract_id: 'b', last_us: 80 },
      { contract_id: 'tie', last_us: 80 },
      { contract_id: 'late', last_us: 75 },
      { contract_id: 'later', last_us: 60 },
    ]
    const { fetchBets, calls } = fakeFetch(bets, 3)

    const sample = await selectCalibrationSample(markets, fetchBets, 3, 2)

    expect(sample.map((b) => b.created_us)).toEqual([100, 90, 80])
    // [a, b] fills the sample at 80. In the next batch, tie (80) is still
    // eligible and late (75) is not, so only tie is read, then the loop stops.
    expect(calls).toEqual([['a', 'b'], ['tie']])
  })

  it('returns an empty sample for no markets without querying', async () => {
    const fetchBets = jest.fn()
    await expect(selectCalibrationSample([], fetchBets)).resolves.toEqual([])
    expect(fetchBets).not.toHaveBeenCalled()
  })

  it('returns an empty sample for size 0 without querying', async () => {
    const fetchBets = jest.fn()
    await expect(
      selectCalibrationSample([{ contract_id: 'a', last_us: 1 }], fetchBets, 0)
    ).resolves.toEqual([])
    expect(fetchBets).not.toHaveBeenCalled()
  })
})

describe('buildCalibrationPoints', () => {
  it('weights the YES rate by shares within each bucket and outcome', () => {
    const bet = (
      prob_bucket: number,
      outcome: string,
      shares: number,
      resolution: string
    ): CalibrationBet => ({
      created_us: 0,
      prob_bucket,
      outcome,
      shares,
      resolution,
    })

    const result = buildCalibrationPoints([
      bet(0.7, 'YES', 30, 'YES'),
      bet(0.7, 'YES', 10, 'NO'),
      bet(0.1, 'YES', 5, 'NO'),
      bet(0.3, 'NO', 20, 'YES'),
      bet(0.3, 'NO', 60, 'NO'),
    ])

    expect(result).toEqual({
      yesPoints: [
        { x: 0.1, y: 0 },
        { x: 0.7, y: 0.75 },
      ],
      noPoints: [{ x: 0.3, y: 0.25 }],
      totalBets: 5,
    })
  })
})

describe('getUserCalibration', () => {
  type Handler = (props: {
    userId: string
  }) => Promise<Awaited<ReturnType<typeof getUserCalibration>>>
  const handler = getUserCalibration as unknown as Handler

  it('reads bets one market at a time and takes volume from the market metrics', async () => {
    const [topic, subtopics] = Object.entries(SEARCH_TOPICS_TO_SUBTOPICS)[0]
    const groupId = subtopics[0].groupIds[0]
    const queries: string[] = []
    const route = (query: string, values: unknown[]) => {
      queries.push(query)
      if (query.includes('FROM users')) return { id: 'u' }
      if (query.includes('FROM user_contract_metrics'))
        return [
          { contract_id: 'bin', profit: 50, volume: 300 },
          { contract_id: 'mc', profit: -20, volume: 100 },
          { contract_id: 'cash', profit: 5, volume: 70 },
          { contract_id: 'open', profit: 0, volume: 10 },
        ]
      if (query.includes('FROM user_portfolio_history')) return []
      if (query.includes('FROM contracts'))
        return [
          {
            id: 'bin',
            resolution: 'YES',
            outcome_type: 'BINARY',
            token: 'MANA',
          },
          {
            id: 'mc',
            resolution: 'MKT',
            outcome_type: 'MULTIPLE_CHOICE',
            token: 'MANA',
          },
          {
            id: 'cash',
            resolution: 'NO',
            outcome_type: 'BINARY',
            token: 'CASH',
          },
          {
            id: 'open',
            resolution: null,
            outcome_type: 'BINARY',
            token: 'MANA',
          },
        ]
      if (query.includes('FROM group_contracts'))
        return [
          { contract_id: 'bin', group_id: groupId },
          { contract_id: 'cash', group_id: groupId },
        ]
      if (query.includes('as last_us')) {
        expect(values[1]).toEqual(['bin', 'cash'])
        return [
          { contract_id: 'bin', last_us: 2000 },
          { contract_id: 'cash', last_us: 1000 },
        ]
      }
      if (query.includes('as created_us')) {
        expect(values).toEqual(['u', ['bin', 'cash'], 5000])
        return [
          {
            created_us: 1500,
            prob_bucket: 0.4,
            outcome: 'YES',
            shares: 10,
            resolution: 'YES',
          },
        ]
      }
      throw new Error(`Unexpected query: ${query}`)
    }
    const pg = {
      oneOrNone: jest.fn(async (q: string, v: unknown[]) => route(q, v)),
      manyOrNone: jest.fn(async (q: string, v: unknown[]) => route(q, v)),
    }
    jest
      .mocked(createSupabaseDirectClient)
      .mockReturnValue(
        pg as unknown as ReturnType<typeof createSupabaseDirectClient>
      )

    const response = await handler({ userId: 'u' })
    const result = 'result' in response ? response.result : response

    // A contract_bets read keyed by user alone walks the user's whole history.
    const betReads = queries.filter((q) => q.includes('contract_bets'))
    expect(betReads).toHaveLength(2)
    for (const q of betReads) {
      expect(q).toContain('cb.contract_id = x.contract_id')
    }
    expect(queries.some((q) => q.includes('contract_perp_events'))).toBe(false)
    // The bet read checks the resolution in the same statement.
    expect(betReads[1]).toContain("c.outcome_type = 'BINARY'")
    expect(betReads[1]).toContain("c.resolution in ('YES', 'NO')")

    expect(result.calibration).toEqual({
      yesPoints: [{ x: 0.4, y: 1 }],
      noPoints: [],
      totalBets: 1,
    })
    // Mana markets only: bin + mc + open.
    expect(result.performanceStats.totalVolume).toBe(410)
    expect(result.performanceStats.totalMarkets).toBe(4)
    expect(result.performanceStats.resolvedMarkets).toBe(3)
    expect(result.performanceStats.winRate).toBeCloseTo((2 / 3) * 100)
    // Topic profit counts every market; topic volume counts mana markets only.
    expect(result.profitByTopic).toEqual([
      { topic, profit: 55, volume: 300, marketCount: 2 },
    ])
  })
})
