jest.mock('shared/utils', () => ({
  getUser: jest.fn(),
  isProd: () => false,
  log: Object.assign(jest.fn(), { error: jest.fn() }),
}))
jest.mock('shared/supabase/init', () => ({
  pgp: jest.requireActual('pg-promise')(),
}))
jest.mock('shared/supabase/users', () => ({ broadcastUserUpdates: jest.fn() }))
jest.mock('shared/sports-goal-annotations', () => ({}))
jest.mock('shared/resolve-market-helpers', () => ({}))
jest.mock('shared/tiptap', () => ({}))
jest.mock('shared/supabase/contracts', () => ({
  generateContractEmbeddings: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('shared/txn/run-txn', () => ({
  runTxnOutsideBetQueue: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('shared/supabase/liquidity', () => ({
  insertLiquidity: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('shared/update-group-contracts-internal', () => ({}))
jest.mock('shared/websockets/helpers', () => ({}))
jest.mock('shared/complete-quest-internal', () => ({
  completeMarketCreationQuests: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('shared/notifications/create-new-contract-notif', () => ({}))
jest.mock('shared/notifications/create-new-contract-comment-notif', () => ({}))
jest.mock('shared/helpers/embeddings', () => ({
  upsertGroupEmbedding: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('shared/publish-sports-live-score', () => ({}))

import { upsertGroupEmbedding } from 'shared/helpers/embeddings'
import {
  runSportsMarketPostCreate,
  flushSportsGroupEmbeddings,
} from './sports-markets'
import { createHash } from 'crypto'
import { CPMMMultiContract } from 'common/contract'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import {
  SPORTS_KICKOFF_BUDGET,
  SportsOpeningLine,
} from 'common/sports-kickoff-interface'
import { User } from 'common/user'
import * as random from 'common/util/random'
import { pgp, SupabaseDirectClient, SupabaseTransaction } from './supabase/init'
import { BDL_MIN_CREATION_LEAD_MS } from 'common/bdl/constants'
import { broadcastUserUpdates, UserUpdate } from './supabase/users'
import { insertLiquidity } from './supabase/liquidity'
import * as queries from './supabase/utils'
import { runTxnOutsideBetQueue } from './txn/run-txn'
import { createSportsContract, SportsContractParams } from './sports-markets'
import { resolveSportsGameAnte } from './sports-game-ante'

const creator = {
  id: MANIFOLD_SPORTS_USER_IDS[0],
  username: 'ManifoldSports',
  name: 'Manifold Sports',
  avatarUrl: 'local-icon',
} as User
const kickoff = '2026-09-17T00:00:00Z'
const start = Date.parse(kickoff)
const line: SportsOpeningLine = {
  source: 'books',
  probs: [0.4, 0.6],
  vendors: ['book'],
  bookCount: 1,
  sampledTime: start - 86400000,
}
const legacy: SportsContractParams = {
  question: 'Which side wins?',
  outcomeType: 'MULTIPLE_CHOICE',
  description: { type: 'doc', content: [] },
  closeTime: start + 1_000,
  liquidityTier: 1000,
  answers: ['Home', 'Away'],
  answerProbs: [40, 60],
  sportsMarketType: 'moneyline',
  sportsLeague: 'NBA',
  sportsStartTimestamp: kickoff,
  sportsEventId: 'odds:game',
  sportsHomeTeam: 'Home',
  sportsAwayTeam: 'Away',
  groupIds: [],
}
const bdl: SportsContractParams = {
  ...legacy,
  sportsProvider: 'bdl',
  sportsLeagueKey: 'nba',
  sportsEventId: 'bdl:nba:101',
  sportsCompetitionId: 'nba-regular-2026',
  sportsStartKnown: true,
  sportsHomeTeamId: '10',
  sportsAwayTeamId: '20',
  openingLineSource: line.source,
  openingProbs: line.probs,
  openingBookCount: line.bookCount,
  openingLineVendors: line.vendors,
  openingSampledTime: line.sampledTime,
}
const funded = {
  ante: SPORTS_KICKOFF_BUDGET,
  kickoffBudget: SPORTS_KICKOFF_BUDGET,
  reason: 'test',
}

function database() {
  const tx = {
    one: jest.fn(),
    oneOrNone: jest.fn().mockResolvedValue(null),
    manyOrNone: jest.fn().mockResolvedValue([]),
    multi: jest.fn().mockResolvedValue([[], []]),
    none: jest.fn(),
  }
  const pg = {
    oneOrNone: jest.fn().mockResolvedValue(null),
    tx: async (f: (t: typeof tx) => Promise<unknown>) => f(tx),
  }
  return { tx, pg: pg as unknown as SupabaseDirectClient }
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, 'now').mockReturnValue(start - 86400000)
  let id = 0
  jest.spyOn(random, 'randomString').mockImplementation(() => 'id' + ++id)
})
afterEach(() => jest.restoreAllMocks())

it('preserves the pre-hook contract, answer, debit and LP rows byte for byte', async () => {
  const { pg } = database()
  const format = jest.spyOn(pgp.as, 'format')
  const bulk = jest.spyOn(queries, 'bulkInsertQuery')
  const contract = await createSportsContract(pg, creator, legacy)
  const contractValues = format.mock.calls.find(
    ([q]) => typeof q === 'string' && q.startsWith('insert into contracts')
  )![1]
  const rows = [
    contractValues,
    bulk.mock.calls[0][1],
    jest.mocked(runTxnOutsideBetQueue).mock.calls[0][1],
    jest.mocked(insertLiquidity).mock.calls[0][1],
  ]
  // Golden digest captured from the original createSportsContract with the same clock and IDs.
  expect(createHash('sha256').update(JSON.stringify(rows)).digest('hex')).toBe(
    '08ca2d75a6ca5cc7e6299a62ba74db34f606ac83adb08629605e70fa12512114'
  )
  expect(contract).not.toHaveProperty('sportsSeededStartTimestamp')
  expect(contract).not.toHaveProperty('sportsKickoffBudget')
})

it.each([
  [40, 60],
  [25, 35, 40],
])(
  'seeds a linked game at its chosen ante (%p)',
  async (...probs: number[]) => {
    const { tx, pg } = database()
    const chooseAnte = jest.fn().mockResolvedValue(funded)
    const contract = (await createSportsContract(
      pg,
      creator,
      {
        ...bdl,
        answers: ['Home', 'Away', 'Draw'].slice(0, probs.length),
        answerProbs: probs,
        openingProbs: probs.map((p) => p / 100),
      },
      { chooseAnte }
    )) as CPMMMultiContract
    expect(chooseAnte).toHaveBeenCalledWith(tx)
    expect(chooseAnte).toHaveBeenCalledTimes(1)
    expect(tx.manyOrNone.mock.invocationCallOrder[0]).toBeLessThan(
      chooseAnte.mock.invocationCallOrder[0]
    )
    expect(chooseAnte.mock.invocationCallOrder[0]).toBeLessThan(
      tx.multi.mock.invocationCallOrder[0]
    )
    expect(contract).toMatchObject({
      sportsKickoffBudget: funded.ante,
      sportsSeededStartTimestamp: kickoff,
      sportsStartKnown: true,
      sportsProvider: 'bdl',
      sportsCompetitionId: bdl.sportsCompetitionId,
      sportsLeagueKey: 'nba',
      sportsHomeTeamId: '10',
      sportsAwayTeamId: '20',
      openingLineSource: 'books',
      openingBookCount: 1,
      openingLineVendors: ['book'],
      openingProbs: probs.map((p) => p / 100),
      openingSampledTime: line.sampledTime,
      totalLiquidity: funded.ante,
      subsidyPool: 0,
      shouldAnswersSumToOne: true,
    })
    expect(runTxnOutsideBetQueue).toHaveBeenCalledTimes(1)
    expect(runTxnOutsideBetQueue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        category: 'CREATE_CONTRACT_ANTE',
        amount: funded.ante,
        fromId: creator.id,
        toId: contract.id,
      })
    )
    expect(insertLiquidity).toHaveBeenCalledTimes(1)
    expect(insertLiquidity).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        amount: funded.ante,
        liquidity: funded.ante,
        isAnte: true,
        userId: creator.id,
        contractId: contract.id,
      })
    )
    expect(contract.answers).toHaveLength(probs.length)
    for (const [i, a] of contract.answers.entries()) {
      expect(a.prob).toBeCloseTo(probs[i] / 100, 8)
      const payout = contract.answers.reduce(
        (sum, b, j) => sum + (i === j ? b.poolYes : b.poolNo),
        0
      )
      expect(payout).toBeCloseTo(funded.ante, 8)
    }
  }
)

it('creates a TBD game with its immutable earliest possible start and only the configured base ante', async () => {
  const { pg } = database()
  const chooseAnte = (tx: SupabaseTransaction) =>
    resolveSportsGameAnte(tx, {
      creatorId: creator.id,
      competitionId: 'nba',
      kickoffTime: start,
      startKnown: false,
      baseAnte: 140,
      line,
    })
  const contract = await createSportsContract(
    pg,
    creator,
    { ...bdl, sportsStartKnown: false },
    { chooseAnte }
  )
  expect(contract).toMatchObject({
    sportsSeededStartTimestamp: kickoff,
    sportsStartTimestamp: kickoff,
    sportsStartKnown: false,
    totalLiquidity: 140,
  })
  expect(contract).not.toHaveProperty('sportsKickoffBudget')
  expect(runTxnOutsideBetQueue).toHaveBeenCalledTimes(1)
  expect(insertLiquidity).toHaveBeenCalledTimes(1)
  await expect(
    resolveSportsGameAnte({} as SupabaseTransaction, {
      creatorId: creator.id,
      competitionId: 'nba',
      kickoffTime: start,
      startKnown: true,
      line,
    })
  ).resolves.toMatchObject({ ante: 100 })
})

describe('enabled major funding', () => {
  const env = process.env
  const balance: UserUpdate = {
    id: creator.id,
    balance: 500,
    cash_balance: 0,
    spice_balance: 0,
    total_deposits: 500,
    total_cash_deposits: 0,
  }
  beforeEach(() => {
    process.env = { ...env, NEXT_PUBLIC_SPORTS_BDL_ENABLED: 'true' }
  })
  afterEach(() => {
    process.env = env
    jest.mocked(runTxnOutsideBetQueue).mockReset()
    jest.mocked(insertLiquidity).mockReset()
  })

  it.each(['settings', 'insert', 'debit', 'liquidity', 'commit', 'success'])(
    'retains the five-minute lead and publishes only a committed debit after %s',
    async (stage) => {
      const { tx } = database()
      let committed = false
      const cutoff = start - BDL_MIN_CREATION_LEAD_MS
      let now = cutoff - 1
      const visit = (step: string) => {
        if (step === stage) now = cutoff
      }
      const pg = {
        oneOrNone: tx.oneOrNone,
        tx: async (fn: (value: typeof tx) => Promise<unknown>) => {
          const result = await fn(tx)
          if (stage === 'commit') throw new Error('commit failed')
          committed = true
          return result
        },
      } as unknown as SupabaseDirectClient
      tx.multi.mockImplementationOnce(async () => {
        visit('insert')
        return [[], []]
      })
      jest
        .mocked(runTxnOutsideBetQueue)
        .mockImplementation(async (_db, data, _affectsProfit, onUpdates) => {
          onUpdates!([balance])
          visit('debit')
          return {
            id: 'debit',
            createdTime: now,
            fromId: data.fromId,
            toId: data.toId,
            fromType: 'USER',
            toType: 'CONTRACT',
            category: 'CREATE_CONTRACT_ANTE',
            token: 'M$',
            amount: data.amount,
          }
        })
      jest.mocked(insertLiquidity).mockImplementationOnce(async (_db, lp) => {
        visit('liquidity')
        return {
          liquidity_id: 'lp',
          contract_id: lp.contractId,
          user_id: lp.userId,
          created_time: new Date(now).toISOString(),
          data: {},
        }
      })
      const publishedAfterCommit: boolean[] = []
      jest.mocked(broadcastUserUpdates).mockImplementation(() => {
        publishedAfterCommit.push(committed)
      })
      const create = createSportsContract(pg, creator, bdl, {
        now: () => now,
        chooseAnte: async () => {
          visit('settings')
          return funded
        },
      })
      if (stage === 'success') {
        await expect(create).resolves.toMatchObject({
          totalLiquidity: funded.ante,
        })
        expect(broadcastUserUpdates).toHaveBeenCalledWith([balance])
        expect(publishedAfterCommit).toEqual([true])
      } else {
        await expect(create).rejects.toThrow(
          stage === 'commit' ? 'commit failed' : 'kicked off'
        )
        expect(committed).toBe(false)
        expect(broadcastUserUpdates).not.toHaveBeenCalled()
      }
      expect(tx.multi).toHaveBeenCalledTimes(stage === 'settings' ? 0 : 1)
      expect(runTxnOutsideBetQueue).toHaveBeenCalledTimes(
        ['settings', 'insert'].includes(stage) ? 0 : 1
      )
      expect(insertLiquidity).toHaveBeenCalledTimes(
        ['settings', 'insert', 'debit'].includes(stage) ? 0 : 1
      )
    }
  )

  it.each([
    { sportsStartKnown: false },
    { sportsAwayTeamId: '10' },
    { sportsHomeTeamId: undefined },
    { sportsFixture: true },
  ] as const)('keeps an unverified major unfunded: %p', async (overrides) => {
    const { pg, tx } = database()
    await expect(
      createSportsContract(
        pg,
        creator,
        { ...bdl, ...overrides },
        { chooseAnte: async () => funded }
      )
    ).rejects.toThrow()
    expect(tx.multi).not.toHaveBeenCalled()
    expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
  })
})

it.each(['exact', 'cross-provider', 'lead time', 'missing market type'])(
  'stops before choosing or spending on %s',
  async (kind) => {
    const { tx, pg } = database()
    const chooseAnte = jest.fn().mockResolvedValue(funded)
    if (kind === 'exact') tx.oneOrNone.mockResolvedValue({ id: 'existing' })
    if (kind === 'cross-provider')
      tx.manyOrNone.mockResolvedValue([
        { id: 'existing', home: 'Away', away: 'Home', start: kickoff },
      ])
    const params =
      kind === 'missing market type'
        ? { ...bdl, sportsMarketType: undefined }
        : bdl
    const opts =
      kind === 'missing market type'
        ? {}
        : { chooseAnte, minLeadMs: kind === 'lead time' ? 86400000 : 0 }
    await expect(
      createSportsContract(pg, creator, params, opts)
    ).rejects.toThrow(
      kind === 'missing market type'
        ? 'requires a market type'
        : kind === 'lead time'
        ? 'kicked off'
        : 'already exists'
    )
    expect(chooseAnte).not.toHaveBeenCalled()
    expect(random.randomString).not.toHaveBeenCalled()
    expect(tx.multi).not.toHaveBeenCalled()
    expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
    expect(insertLiquidity).not.toHaveBeenCalled()
  }
)

it.each([
  [
    'field',
    { ...bdl, sportsMarketType: 'winner' },
    { ante: 100, reason: 'test' },
  ],
  ['TBD', { ...bdl, sportsStartKnown: false }, funded],
  ['fixture', { ...bdl, sportsFixture: true }, funded],
  ['wrong marker', bdl, { ...funded, ante: 1999, kickoffBudget: 1999 }],
  ['mismatched ante', bdl, { ...funded, ante: 1999 }],
  ['nonfinite ante', bdl, { ante: NaN, reason: 'test' }],
  ['nonpositive ante', bdl, { ante: 0, reason: 'test' }],
  ['missing decision', bdl, undefined],
] as const)(
  'rejects an unsafe funding decision on %s before insert or debit',
  async (name, params, decision) => {
    const { tx, pg } = database()
    await expect(
      createSportsContract(pg, creator, params, {
        chooseAnte: jest.fn().mockResolvedValue(decision),
      })
    ).rejects.toThrow(
      name === 'field'
        ? 'hooks require a moneyline'
        : ['nonfinite ante', 'nonpositive ante', 'missing decision'].includes(
            name
          )
        ? 'Invalid sports ante decision'
        : 'Ineligible kickoff funding'
    )
    expect(tx.multi).not.toHaveBeenCalled()
    expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
    expect(insertLiquidity).not.toHaveBeenCalled()
  }
)

it('collects each public group once per batch and preserves immediate legacy refreshes', async () => {
  const { pg } = database()
  Object.assign(pg, {
    map: jest.fn().mockResolvedValue(['league', 'all-sports']),
    none: jest.fn(),
  })
  const batch = new Set<string>()
  const first = await createSportsContract(pg, creator, legacy, {
    groupEmbeddingBatch: batch,
  })
  await createSportsContract(
    pg,
    creator,
    { ...legacy, question: 'Another game' },
    { groupEmbeddingBatch: batch }
  )
  expect(upsertGroupEmbedding).not.toHaveBeenCalled()
  expect([...batch]).toEqual(['league', 'all-sports'])
  await flushSportsGroupEmbeddings(pg, batch)
  expect(
    jest.mocked(upsertGroupEmbedding).mock.calls.map(([, id]) => id)
  ).toEqual(['league', 'all-sports'])
  await flushSportsGroupEmbeddings(pg, batch)
  await runSportsMarketPostCreate(
    pg,
    { ...first, visibility: 'unlisted' },
    creator,
    { groupEmbeddingBatch: batch }
  )
  expect(batch.size).toBe(0)
  expect(upsertGroupEmbedding).toHaveBeenCalledTimes(2)
  await createSportsContract(pg, creator, legacy)
  expect(upsertGroupEmbedding).toHaveBeenCalledTimes(4)
})

it('keeps failed group embeddings for retry without repeating successful groups', async () => {
  const { pg } = database()
  const error = new Error('embedding failed')
  jest.mocked(upsertGroupEmbedding).mockRejectedValueOnce(error)
  const batch = new Set(['first', 'second'])
  await expect(flushSportsGroupEmbeddings(pg, batch)).rejects.toBe(error)
  expect([...batch]).toEqual(['first'])
  await flushSportsGroupEmbeddings(pg, batch)
  expect(
    jest.mocked(upsertGroupEmbedding).mock.calls.map(([, id]) => id)
  ).toEqual(['first', 'second', 'first'])
  expect(batch.size).toBe(0)
})
