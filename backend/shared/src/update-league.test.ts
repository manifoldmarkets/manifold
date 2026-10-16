import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'
import { groupBy, keyBy } from 'lodash'
import { Answer } from 'common/answer'
import { Bet, LimitBet } from 'common/bet'
import { getProfitMetrics } from 'common/calculate'
import { Contract, CPMMMultiContract } from 'common/contract'
import { noFees } from 'common/fees'
import { excludeSelfTrades, filterBetsForLeagueScoring } from 'common/leagues'
import { getBetDownToOneMultiBetInfo } from 'common/new-bet'
import { getAnswerCostFromLiquidity } from 'common/tier'
import { SupabaseDirectClient } from './supabase/init'
import { getSeasonStartAndEnd } from './supabase/leagues'
import { bulkUpdate } from './supabase/utils'
import { updateLeague } from '../../scheduler/src/jobs/update-league'

// Only service boundaries are replaced. The scheduler emits its real SQL and
// uses the real scorer; all reads execute against an in-memory PostgreSQL.
jest.mock('./supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(() => {
    throw new Error('This test must not create a network database client')
  }),
}))
jest.mock('./supabase/leagues', () => ({
  getEffectiveCurrentSeason: jest.fn(),
  getSeasonStartAndEnd: jest.fn(),
}))
jest.mock('./supabase/utils', () => ({ bulkUpdate: jest.fn() }))
jest.mock('./utils', () => ({
  contractColumnsToSelectWithPrefix: (prefix: string) =>
    jest
      .requireActual<typeof import('common/contract')>('common/contract')
      .nativeContractColumnsArray.map((column) => `${prefix}.${column}`)
      .join(','),
  log: Object.assign(jest.fn(), { error: jest.fn() }),
}))

jest.setTimeout(30_000)

const SEASON = 42
const START = Date.parse('2026-10-01T00:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const END = START + 30 * DAY
const NOW = START + 3 * DAY
const pgp = pgPromise()
let db: PGlite
let chunkRequests: string[][]
let returnedBetIds: string[][]
let candidateIds: string[]
let bonusQueries: number
let failOnChunk: number | undefined

// pg-promise formats the production placeholders, including $2:list and arrays.
// PGlite executes the resulting SQL rather than imitating its predicates in JS.
const client = {
  multi: async (sql: string, params: unknown[]) => {
    const results = await db.exec(pgp.as.format(sql, params))
    candidateIds = (results[1].rows as { data: Contract }[]).map(
      (row) => row.data.id
    )
    return results.map((result) => result.rows)
  },
  map: async (
    sql: string,
    params: unknown[],
    mapper: (row: { data: Bet }) => Bet
  ) => {
    chunkRequests.push([...(params[1] as string[])])
    if (chunkRequests.length === failOnChunk) {
      throw new Error('Later chunk unavailable')
    }
    const result = await db.query<{ data: Bet }>(pgp.as.format(sql, params))
    returnedBetIds.push(result.rows.map((row) => row.data.id))
    return result.rows.map(mapper)
  },
  manyOrNone: async (sql: string, params: unknown[]) => {
    bonusQueries++
    return (await db.query(pgp.as.format(sql, params))).rows
  },
} as unknown as SupabaseDirectClient

const binary = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    slug: id,
    token: 'MANA',
    visibility: 'public',
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    creatorId: 'creator',
    createdTime: START - DAY,
    lastBetTime: START + 1000,
    pool: { YES: 100, NO: 100 },
    p: 0.5,
    ...extra,
  } as unknown as Contract)

const bet = (
  id: string,
  contractId: string,
  extra: Partial<Bet> = {}
): Bet => ({
  id,
  contractId,
  userId: 'member',
  createdTime: START + 1000,
  outcome: 'YES',
  amount: 10,
  shares: 24,
  probBefore: 0.5,
  probAfter: 0.5,
  fees: noFees,
  isRedemption: false,
  ...extra,
})

const seedMembers = async (ids: string[], season = SEASON) => {
  if (!ids.length) return
  await db.query(
    `insert into users select unnest($1::text[]) on conflict do nothing`,
    [ids]
  )
  await db.query(
    `insert into leagues (user_id, season) select unnest($1::text[]), $2`,
    [ids, season]
  )
}

const seedContracts = async (contracts: Contract[]) => {
  await db.query(
    `insert into contracts
       (id, data, token, visibility, mechanism, created_time, last_bet_time)
     select value->>'id', value, value->>'token', value->>'visibility',
       value->>'mechanism', millis_to_ts((value->>'createdTime')::bigint),
       millis_to_ts((value->>'lastBetTime')::bigint)
     from jsonb_array_elements($1::jsonb)`,
    [JSON.stringify(contracts)]
  )
}

const seedBets = async (bets: Bet[]) => {
  // amount, shares and user_id are populated by the repository's real trigger.
  await db.query(
    `insert into contract_bets (bet_id, contract_id, created_time, data)
     select value->>'id', value->>'contractId',
       millis_to_ts((value->>'createdTime')::bigint), value
     from jsonb_array_elements($1::jsonb)`,
    [JSON.stringify(bets)]
  )
}

type LeagueUpdate = { user_id: string; mana_earned: number }
const writtenProfits = () => {
  const calls = jest.mocked(bulkUpdate).mock.calls
  expect(calls).toHaveLength(1)
  expect(calls[0].slice(1, 3)).toEqual(['leagues', ['user_id', 'season']])
  return Object.fromEntries(
    (calls[0][3] as LeagueUpdate[]).map((row) => [row.user_id, row.mana_earned])
  )
}

// The old whole-season selection and user-first scoring loop are an independent
// oracle. In particular, this does not use the optimized row predicate or the
// new per-contract accumulator.
const legacyProfit = async (userIds: string[]) => {
  const contracts = await db.query<{ data: Contract }>(
    `select distinct c.data from contracts c
     join contract_bets cb on c.id = cb.contract_id
     where cb.created_time > millis_to_ts($1)
       and cb.created_time < millis_to_ts($2)
       and c.token = 'MANA' and c.visibility = 'public'
       and c.mechanism is distinct from 'perp'
       and coalesce((c.data->'isRanked')::boolean, true) = true`,
    [START, END]
  )
  const bets = await db.query<{ data: Bet }>(
    `select data from contract_bets
     where created_time > millis_to_ts($1) and created_time < millis_to_ts($2)`,
    [START, END]
  )
  const contractsById = keyBy(
    contracts.rows.map((row) => row.data),
    'id'
  )
  const betsByUser = groupBy(
    bets.rows.map((row) => row.data),
    'userId'
  )
  const excludedSlugs = new Set([
    'will-there-be-another-wellrecognize-393de260ec26',
    'will-there-be-another-wellrecognize-511a499bd82e',
    'will-there-be-another-wellrecognize',
  ])
  return Object.fromEntries(
    userIds.map((userId) => {
      let total = 0
      for (const [contractId, contractBets] of Object.entries(
        groupBy(betsByUser[userId] ?? [], 'contractId')
      )) {
        const contract = contractsById[contractId]
        if (!contract || excludedSlugs.has(contract.slug)) continue
        const relevant = filterBetsForLeagueScoring(
          excludeSelfTrades(contractBets, userId),
          contract,
          userId
        )
        if (!relevant.length) continue
        const { profit } = getProfitMetrics(contract, relevant)
        if (!isNaN(profit)) total += profit
      }
      return [userId, total]
    })
  )
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create function random_alphanumeric(n integer) returns text
      language sql as $$ select repeat('x', n) $$;
    create function millis_to_ts(n bigint) returns timestamptz
      language sql as $$ select to_timestamp(n / 1000.0) $$;
    create table users (id text primary key);
    create table leagues (user_id text, season integer, unique(user_id, season));
    create table contracts (
      id text primary key, data jsonb not null, token text, visibility text,
      mechanism text, created_time timestamptz, last_bet_time timestamptz,
      importance_score numeric default 0, home_page_score_adjustment numeric,
      home_page_score_adjustment_expires_at timestamptz,
      freshness_score numeric default 0, conversion_score numeric default 0,
      view_count bigint default 0, boosted boolean default false,
      daily_score numeric default 0
    );
    create table txns (
      to_id text, amount numeric, category text, token text,
      created_time timestamptz, data jsonb
    );
  `)
  const schema = readFileSync(
    resolve(__dirname, '../../supabase/contract_bets.sql'),
    'utf8'
  )
  const table = schema.split('-- Triggers')[0]
  const triggers = schema.split('-- Triggers')[1].split('-- Functions')[0]
  const functions = schema
    .split('-- Functions')[1]
    .split('-- Row Level Security')[0]
  await db.exec(table + functions + triggers)
  await db.exec(
    'create index on contract_bets (contract_id, created_time desc)'
  )
})

beforeEach(async () => {
  await db.exec('truncate users, leagues, contracts, contract_bets, txns')
  jest.clearAllMocks()
  jest.spyOn(Date, 'now').mockReturnValue(NOW)
  jest.mocked(getSeasonStartAndEnd).mockResolvedValue({
    seasonStart: START,
    seasonEnd: END,
    status: 'active',
  })
  chunkRequests = []
  returnedBetIds = []
  candidateIds = []
  bonusQueries = 0
  failOnChunk = undefined
})

afterEach(() => jest.restoreAllMocks())
afterAll(async () => {
  await db?.close()
  pgp.end()
})

describe('updateLeague with real PostgreSQL queries', () => {
  it.each([undefined, START - DAY])(
    'includes synthetic season shares with lastBetTime %s',
    async (lastBetTime) => {
      await seedMembers(['member', 'idle'])
      const contract = binary('old-market', {
        mechanism: 'cpmm-multi-2',
        outcomeType: 'MULTIPLE_CHOICE',
        lastBetTime,
        answers: [
          { id: 'other', prob: 0 },
          { id: 'new', prob: 1, resolution: 'YES' },
        ],
      })
      await seedContracts([contract])
      await seedBets([
        bet('free-shares', contract.id, {
          answerId: 'new',
          amount: 0,
          shares: 20,
          isRedemption: true,
        }),
      ])
      const expected = await legacyProfit(['member', 'idle'])
      expect(expected).toEqual({ member: 20, idle: 0 })
      await updateLeague(SEASON, client)
      expect(writtenProfits()).toEqual(expected)
      expect(candidateIds).toEqual(['old-market'])
    }
  )

  it('preserves a zero-value arbitrage marker matched to a creator first-hour order', async () => {
    await seedMembers(['creator', 'idle'])
    const contract = binary('creator-market', {
      creatorId: 'creator',
      createdTime: NOW - 2 * HOUR,
      lastBetTime: NOW,
      mechanism: 'cpmm-multi-1',
      outcomeType: 'MULTIPLE_CHOICE',
      shouldAnswersSumToOne: true,
      totalLiquidity: 100,
      collectedFees: noFees,
    }) as CPMMMultiContract
    const answer = (id: string, index: number, liquidity: number): Answer => ({
      id,
      contractId: contract.id,
      userId: 'creator',
      text: id,
      index,
      createdTime: contract.createdTime,
      prob: 0.5,
      p: 0.5,
      poolYes: liquidity,
      poolNo: liquidity,
      totalLiquidity: liquidity,
      subsidyPool: 0,
      probChanges: { day: 0, week: 0, month: 0 },
      volume: 0,
      isOther: id === 'other',
    })
    const existing = answer('existing', 0, 25)
    const other = answer('other', 1, 25)
    const answerCost = getAnswerCostFromLiquidity(contract.totalLiquidity, 2)
    expect(answerCost).toBe(25)
    // Same balanced-Other split as createAnswerAndSumAnswersToOne.
    const mana = answerCost + Math.min(other.poolYes, other.poolNo)
    const newLiquidity = Math.min(answerCost, mana / 2)
    const answers = [
      existing,
      answer('new', 1, newLiquidity),
      answer('other', 2, mana - newLiquidity),
    ]
    const order: LimitBet = {
      ...bet('maker', contract.id, {
        userId: 'creator',
        answerId: existing.id,
        createdTime: contract.createdTime + 1000,
        amount: 0,
        shares: 0,
      }),
      orderAmount: 100,
      limitProb: 0.4,
      isFilled: false,
      isCancelled: false,
      fills: [],
    }
    const { betResults } = getBetDownToOneMultiBetInfo(
      contract,
      answers,
      [order],
      { creator: 1000 }
    )
    const bets: Bet[] = []
    for (const [index, result] of betResults.entries()) {
      const taker: Bet = {
        ...result.bet,
        id: `taker-${index}`,
        userId: 'creator',
      }
      bets.push(taker)
      for (const maker of result.makers) {
        // Same filled-order fields persisted by updateMakers.
        bets.push({
          ...maker.bet,
          amount: maker.amount,
          shares: maker.shares,
          fills: [
            {
              amount: maker.amount,
              shares: maker.shares,
              matchedBetId: taker.id,
              timestamp: maker.timestamp,
            },
          ],
        })
      }
    }
    expect(bets.filter((b) => b.id === 'maker')).toHaveLength(1)
    const marker = bets.find((b) => b.id === 'taker-0')!
    expect([marker.amount, marker.shares]).toEqual([0, 0])
    expect(marker.fills!.some((fill) => fill.matchedBetId === 'maker')).toBe(
      true
    )
    expect(marker.createdTime).toBeGreaterThanOrEqual(
      contract.createdTime + HOUR
    )
    // The existing answer later wins, without changing these bet rows.
    contract.answers = answers
    contract.resolution = 'MKT'
    contract.resolutions = { existing: 100 }
    await seedContracts([contract])
    await seedBets(bets)
    const expected = await legacyProfit(['creator', 'idle'])
    expect(expected.creator).toBeCloseTo(6.969349057201551, 8)
    await updateLeague(SEASON, client)
    expect(writtenProfits().creator).toBeCloseTo(expected.creator, 8)
    expect(writtenProfits().idle).toBe(0)
    expect(returnedBetIds.flat()).toContain('taker-0')
  })

  it('keeps strict season boundaries and current league membership in the SQL', async () => {
    await seedMembers(['member', 'idle'])
    await seedMembers(['previous-member'], SEASON - 1)
    const contracts = [binary('ordinary'), binary('boundary-only')]
    await seedContracts(contracts)
    await seedBets([
      bet('ordinary', 'ordinary'),
      bet('at-start', 'ordinary', { createdTime: START, shares: 1000 }),
      bet('at-end', 'ordinary', { createdTime: END, shares: 1000 }),
      bet('before', 'ordinary', { createdTime: START - 1, shares: 1000 }),
      bet('after', 'ordinary', { createdTime: END + 1, shares: 1000 }),
      bet('outsider', 'ordinary', { userId: 'outsider', shares: 1000 }),
      bet('previous', 'ordinary', { userId: 'previous-member', shares: 1000 }),
      bet('boundary-only', 'boundary-only', {
        createdTime: START,
        shares: 1000,
      }),
    ])
    const expected = await legacyProfit(['member', 'idle'])
    expect(expected).toEqual({ member: 2, idle: 0 })
    await updateLeague(SEASON, client)
    expect(writtenProfits()).toEqual(expected)
    expect(candidateIds).toEqual(['ordinary'])
    expect(returnedBetIds.flat()).toEqual(['ordinary'])
  })

  it('drops empty zero-value orders while retaining fills and nullable values', async () => {
    await seedMembers(['member'])
    await seedContracts([binary('ordinary')])
    await seedBets([
      bet('ordinary', 'ordinary'),
      bet('missing-fills', 'ordinary', { amount: 0, shares: 0 }),
      bet('empty-fills', 'ordinary', { amount: 0, shares: 0, fills: [] }),
      bet('cancelled-empty', 'ordinary', {
        amount: 0,
        shares: 0,
        fills: [],
        isCancelled: true,
      }),
      bet('marker', 'ordinary', {
        amount: 0,
        shares: 0,
        isRedemption: true,
        fills: [
          { matchedBetId: null, amount: 1, shares: 2, timestamp: START + 1000 },
        ],
      }),
      bet('nullable', 'ordinary', {
        amount: null as unknown as number,
        shares: 0,
      }),
      bet('null-fills', 'ordinary', {
        amount: 0,
        shares: 0,
        fills: null as unknown as Bet['fills'],
      }),
    ])
    const expected = await legacyProfit(['member'])
    await updateLeague(SEASON, client)
    expect(writtenProfits()).toEqual(expected)
    expect(returnedBetIds.flat().sort()).toEqual([
      'marker',
      'null-fills',
      'nullable',
      'ordinary',
    ])
  })

  it('scores 501 contracts in three bounded chunks without duplicate rows', async () => {
    await seedMembers(['member', 'idle'])
    const contracts = Array.from({ length: 501 }, (_, i) =>
      binary(`market-${i}`)
    )
    await seedContracts(contracts)
    await seedBets(contracts.map((contract) => bet(contract.id, contract.id)))
    const expected = await legacyProfit(['member', 'idle'])
    expect(expected).toEqual({ member: 1002, idle: 0 })
    await updateLeague(SEASON, client)
    expect(writtenProfits()).toEqual(expected)
    expect(chunkRequests.map((ids) => ids.length)).toEqual([250, 250, 1])
    expect(new Set(chunkRequests.flat()).size).toBe(501)
    expect(new Set(returnedBetIds.flat()).size).toBe(501)
    expect(returnedBetIds.map((ids) => ids.length)).toEqual([250, 250, 1])
  })

  it.each([{ members: [] }, { members: ['idle'] }])(
    'handles no season bets for $members',
    async ({ members }) => {
      await seedMembers(members)
      await updateLeague(SEASON, client)
      expect(writtenProfits()).toEqual(
        Object.fromEntries(members.map((id) => [id, 0]))
      )
      expect(chunkRequests).toEqual([])
    }
  )

  it('does not write partial standings when a later chunk fails', async () => {
    await seedMembers(['member'])
    const contracts = Array.from({ length: 251 }, (_, i) =>
      binary(`market-${i}`)
    )
    await seedContracts(contracts)
    await seedBets(contracts.map((contract) => bet(contract.id, contract.id)))
    failOnChunk = 2
    await expect(updateLeague(SEASON, client)).rejects.toThrow(
      'Later chunk unavailable'
    )
    expect(chunkRequests.map((ids) => ids.length)).toEqual([250, 1])
    expect(returnedBetIds[0]).toHaveLength(250)
    expect(bonusQueries).toBe(0)
    expect(bulkUpdate).not.toHaveBeenCalled()
  })
})
