import { chunk, groupBy, keyBy } from 'lodash'
import { Bet } from './bet'
import { getProfitMetrics } from './calculate'
import { Contract } from './contract'
import {
  addLeagueProfitForContract,
  excludeSelfTrades,
  filterBetsForLeagueScoring,
  isLeagueScorableContract,
} from './leagues'

// update-league used to score the whole season in one pass: every bet row of
// the season loaded, then per league member, per contract. It now loads bets
// a chunk of contracts at a time (members only, no amount=0/shares=0 rows)
// and calls addLeagueProfitForContract per contract. These tests pin the two
// to the same numbers, and pin the claim that the SQL-side row filter changes
// nothing.

const SEASON_START = Date.parse('2026-10-01T18:35:20.627Z')
const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

const MEMBERS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']
const OUTSIDERS = ['o1', 'o2']

// Deterministic so a failure reproduces.
const makeRng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

const binary = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    slug: id,
    token: 'MANA',
    visibility: 'public',
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    pool: { YES: 120, NO: 80 },
    p: 0.5,
    creatorId: 'm1',
    createdTime: SEASON_START - DAY,
    isRanked: true,
    ...extra,
  } as unknown as Contract)

const CONTRACTS: Contract[] = [
  binary('resolved-yes', { resolution: 'YES', resolutionTime: SEASON_START }),
  binary('resolved-no', { resolution: 'NO', resolutionTime: SEASON_START }),
  binary('open-a'),
  // Created mid-season by m2: m2's bets in the first hour must not count.
  binary('open-b', { creatorId: 'm2', createdTime: SEASON_START + 2 * DAY }),
  binary('open-c', { pool: { YES: 10, NO: 900 }, p: 0.3 }),
  binary('excluded-slug', { slug: 'will-there-be-another-wellrecognize' }),
  binary('cash', { token: 'CASH' }),
  binary('unlisted', { visibility: 'unlisted' }),
  binary('unranked', { isRanked: false }),
  binary('perp', { mechanism: 'perp' }),
]

type Fill = { matchedBetId: string | null; amount: number; shares: number }

const makeBet = (
  id: string,
  userId: string,
  contractId: string,
  amount: number,
  shares: number,
  outcome: 'YES' | 'NO',
  createdTime: number,
  extra: { isRedemption?: boolean; fills?: Fill[]; isApi?: boolean } = {}
) =>
  ({
    id,
    userId,
    contractId,
    amount,
    shares,
    outcome,
    createdTime,
    probBefore: 0.5,
    probAfter: 0.5,
    isRedemption: extra.isRedemption ?? false,
    isApi: extra.isApi ?? false,
    fills: extra.fills,
  } as unknown as Bet)

// A season's worth of bets for every user on every contract: ordinary buys
// and sells, redemptions, limit orders filled against the user's own order,
// and the amount=0/shares=0 rows an unfilled or expired limit order leaves.
const makeSeasonBets = (seed: number) => {
  const rand = makeRng(seed)
  const bets: Bet[] = []
  let n = 0
  const nextId = () => `b${n++}`
  for (const contract of CONTRACTS) {
    for (const userId of [...MEMBERS, ...OUTSIDERS]) {
      const count = 1 + Math.floor(rand() * 5)
      for (let i = 0; i < count; i++) {
        const createdTime =
          contract.createdTime + Math.floor(rand() * 8 * DAY) - HOUR / 2
        const outcome = rand() < 0.5 ? 'YES' : 'NO'
        const kind = rand()
        if (kind < 0.55) {
          // buy
          const amount = 1 + Math.floor(rand() * 100)
          bets.push(
            makeBet(
              nextId(),
              userId,
              contract.id,
              amount,
              amount * (1 + rand()),
              outcome,
              createdTime
            )
          )
        } else if (kind < 0.7) {
          // sell
          const amount = 1 + Math.floor(rand() * 50)
          bets.push(
            makeBet(
              nextId(),
              userId,
              contract.id,
              -amount,
              -amount * (1 + rand()),
              outcome,
              createdTime
            )
          )
        } else if (kind < 0.78) {
          // redemption pair
          const amount = 1 + Math.floor(rand() * 20)
          bets.push(
            makeBet(
              nextId(),
              userId,
              contract.id,
              -amount,
              -amount,
              'YES',
              createdTime,
              { isRedemption: true }
            ),
            makeBet(
              nextId(),
              userId,
              contract.id,
              -amount,
              -amount,
              'NO',
              createdTime,
              { isRedemption: true }
            )
          )
        } else if (kind < 0.9) {
          // a limit order partly filled by the user's own later bet
          const limitId = nextId()
          bets.push(
            makeBet(limitId, userId, contract.id, 50, 60, outcome, createdTime)
          )
          bets.push(
            makeBet(
              nextId(),
              userId,
              contract.id,
              40,
              45,
              outcome === 'YES' ? 'NO' : 'YES',
              createdTime + 1000,
              {
                fills: [
                  { matchedBetId: limitId, amount: 20, shares: 25 },
                  { matchedBetId: null, amount: 20, shares: 20 },
                ],
              }
            )
          )
        } else {
          // unfilled / expired limit order: the row the SQL filter drops
          bets.push(
            makeBet(nextId(), userId, contract.id, 0, 0, outcome, createdTime, {
              isApi: true,
            })
          )
        }
      }
    }
  }
  return bets
}

// The loop update-league ran before it was chunked, kept verbatim as the
// oracle: every bet of the season in one array, then per member.
const EXCLUDED_CONTRACT_SLUGS = new Set([
  'will-there-be-another-wellrecognize-393de260ec26',
  'will-there-be-another-wellrecognize-511a499bd82e',
  'will-there-be-another-wellrecognize',
])
const oldWholeSeasonProfit = (
  contracts: Contract[],
  bets: Bet[],
  userIds: string[]
) => {
  const betsByUserId = groupBy(bets, (b) => b.userId)
  const contractsById = keyBy(contracts, 'id')
  const profitByUserId: Record<string, number> = {}
  for (const userId of userIds) {
    const userBets = betsByUserId[userId] ?? []
    const betsByContract = groupBy(userBets, (b) => b.contractId)
    let totalProfit = 0
    for (const [contractId, contractBets] of Object.entries(betsByContract)) {
      const contract = contractsById[contractId]
      if (
        contract &&
        contract.token === 'MANA' &&
        contract.visibility === 'public' &&
        contract.mechanism !== 'perp' &&
        contract.isRanked !== false &&
        !EXCLUDED_CONTRACT_SLUGS.has(contract.slug)
      ) {
        const nonSelfTradeBets = excludeSelfTrades(contractBets, userId)
        const relevantBets = filterBetsForLeagueScoring(
          nonSelfTradeBets,
          contract,
          userId
        )
        if (relevantBets.length > 0) {
          const { profit } = getProfitMetrics(contract, relevantBets)
          if (isNaN(profit)) continue
          totalProfit += profit
        }
      }
    }
    profitByUserId[userId] = totalProfit
  }
  return profitByUserId
}

// What update-league does now, with the chunk query's row selection
// (this chunk's contracts, league members only, no amount=0/shares=0 rows)
// applied in memory.
const newChunkedProfit = (
  contracts: Contract[],
  bets: Bet[],
  userIds: string[],
  chunkSize: number
) => {
  const profitByUserId: Record<string, number> = Object.fromEntries(
    userIds.map((id) => [id, 0])
  )
  const members = new Set(userIds)
  for (const chunkContracts of chunk(
    contracts.filter(isLeagueScorableContract),
    chunkSize
  )) {
    const ids = new Set(chunkContracts.map((c) => c.id))
    const rows = bets.filter(
      (b) =>
        ids.has(b.contractId) &&
        members.has(b.userId) &&
        (b.amount !== 0 || b.shares !== 0)
    )
    const byContract = groupBy(rows, (b) => b.contractId)
    for (const contract of chunkContracts) {
      addLeagueProfitForContract(
        contract,
        groupBy(byContract[contract.id] ?? [], (b) => b.userId),
        profitByUserId
      )
    }
  }
  return profitByUserId
}

describe('league season profit', () => {
  it.each([1, 2, 3, 100])(
    'chunked scoring matches the whole-season loop (chunk size %i)',
    (chunkSize) => {
      for (const seed of [1, 7, 42, 2026]) {
        const bets = makeSeasonBets(seed)
        const expected = oldWholeSeasonProfit(CONTRACTS, bets, MEMBERS)
        const actual = newChunkedProfit(CONTRACTS, bets, MEMBERS, chunkSize)
        expect(Object.keys(actual).sort()).toEqual([...MEMBERS].sort())
        for (const userId of MEMBERS) {
          expect(actual[userId]).toBeCloseTo(expected[userId], 9)
        }
        // The fixtures are not degenerate: members really do have profit.
        expect(MEMBERS.some((u) => Math.abs(expected[u]) > 1)).toBe(true)
      }
    }
  )

  it('rows with amount 0 and shares 0 never change a profit', () => {
    for (const seed of [3, 11, 99]) {
      const bets = makeSeasonBets(seed)
      const zeroRows = bets.filter((b) => b.amount === 0 && b.shares === 0)
      expect(zeroRows.length).toBeGreaterThan(10)
      const withZeros = oldWholeSeasonProfit(CONTRACTS, bets, MEMBERS)
      const withoutZeros = oldWholeSeasonProfit(
        CONTRACTS,
        bets.filter((b) => b.amount !== 0 || b.shares !== 0),
        MEMBERS
      )
      for (const userId of MEMBERS) {
        expect(withoutZeros[userId]).toBe(withZeros[userId])
      }
    }
  })

  it('scores only league members and gives every member an entry', () => {
    const bets = makeSeasonBets(5)
    const profit = newChunkedProfit(CONTRACTS, bets, ['m1', 'm2', 'idle'], 10)
    expect(Object.keys(profit).sort()).toEqual(['idle', 'm1', 'm2'])
    expect(profit.idle).toBe(0)
    expect('o1' in profit).toBe(false)
  })

  it('reports a NaN profit instead of adding it', () => {
    const broken = binary('broken', { pool: { YES: NaN, NO: NaN }, p: NaN })
    const bets = [makeBet('x', 'm1', 'broken', 10, 20, 'YES', SEASON_START)]
    const profitByUserId = { m1: 0 }
    const nanUsers = addLeagueProfitForContract(
      broken,
      groupBy(bets, (b) => b.userId),
      profitByUserId
    )
    expect(nanUsers).toEqual(['m1'])
    expect(profitByUserId.m1).toBe(0)
  })

  it('is scorable only for ranked public MANA non-perp markets', () => {
    expect(CONTRACTS.filter(isLeagueScorableContract).map((c) => c.id)).toEqual(
      ['resolved-yes', 'resolved-no', 'open-a', 'open-b', 'open-c']
    )
  })
})
