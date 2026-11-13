// Replays, through the real resolveMarketHelper, the resolutions of the dev
// market that showed an independent multiple choice market paying a subsidy
// out twice (QtdQuOdSUd, 2026-11-13): two answers and a Ṁ1,000,000 subsidy,
// eleven answers listed while most of it was still pending, the first two
// resolved NO and the eleven cancelled. The database is an in-memory stand-in
// that applies the helper's writes, so each resolution reads what the last one
// left. No live database or network is used.
jest.mock('./supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  SERIAL_MODE: {},
}))
jest.mock('./utils', () => ({
  getContractAndMetricsAndLiquidities: jest.fn(),
  isProd: () => true,
  log: Object.assign(jest.fn(), { warn: jest.fn() }),
  revalidateStaticProps: jest.fn(),
}))
jest.mock('./helpers/user-contract-loans', () => ({
  getLoanTrackingForContract: jest.fn().mockResolvedValue([]),
}))
jest.mock('./analytics', () => ({ trackPublicEvent: jest.fn() }))
jest.mock('./record-contract-edit', () => ({ recordContractEdit: jest.fn() }))
jest.mock('./create-notification', () => ({
  createContractResolvedNotifications: jest.fn(),
}))
jest.mock('./helpers/user-contract-metrics', () => ({
  bulkUpdateContractMetricsQuery: () => 'select 1',
}))
jest.mock('./supabase/answers', () => ({
  updateAnswer: jest.fn(),
  updateAnswers: jest.fn(),
}))
jest.mock('./supabase/users', () => ({
  bulkIncrementBalancesQuery: jest.fn(() => 'select 1'),
}))
jest.mock('./supabase/utils', () => ({
  bulkInsertQuery: () => 'select 1',
  updateDataQuery: jest.fn(() => 'update contracts'),
}))
jest.mock('./txn/run-txn', () => ({ txnToRow: jest.fn() }))
jest.mock('./websockets/helpers', () => ({
  broadcastUpdatedContract: jest.fn(),
  broadcastUpdatedMetrics: jest.fn(),
}))

import { sumBy } from 'lodash'
import { Answer } from 'common/answer'
import { CPMMMultiContract, MarketContract } from 'common/contract'
import { LiquidityProvision } from 'common/liquidity-provision'
import { User } from 'common/user'
import { updateAnswer } from './supabase/answers'
import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from './supabase/init'
import { bulkIncrementBalancesQuery } from './supabase/users'
import { updateDataQuery } from './supabase/utils'
import { getContractAndMetricsAndLiquidities, log } from './utils'
import { resolveMarketHelper } from './resolve-market-helpers'

const CREATOR = 'creator'
const creator = { id: CREATOR } as User

// As the dev database had them when the first answer was resolved.
const ANTE = 50_000
const SUBSIDY = 1_000_000
const DRIZZLED_POOL = 103_174.8256909306
const PENDING = SUBSIDY - 2 * (DRIZZLED_POOL - ANTE)
const LATE_ANSWERS = 11
const LATE_ANTE = 10_000

const newAnswer = (index: number, pool: number): Answer => ({
  id: `answer-${index}`,
  index,
  contractId: 'market',
  userId: CREATOR,
  text: `${index}`,
  createdTime: index,
  poolYes: pool,
  poolNo: pool,
  p: 0.5,
  prob: 0.5,
  totalLiquidity: pool,
  subsidyPool: 0,
  volume: 0,
  probChanges: { day: 0, week: 0, month: 0 },
})

const provision = (amount: number, answerId?: string) =>
  ({
    id: `lp-${answerId ?? 'market'}`,
    userId: CREATOR,
    contractId: 'market',
    createdTime: 0,
    amount,
    ...(answerId ? { answerId, isAnte: true } : {}),
  } as LiquidityProvision)

let contract: CPMMMultiContract
let liquidities: LiquidityProvision[]
let paid: number[]

beforeEach(() => {
  jest.clearAllMocks()
  const answers = [
    newAnswer(0, DRIZZLED_POOL),
    newAnswer(1, DRIZZLED_POOL),
    ...Array.from({ length: LATE_ANSWERS }, (_, i) =>
      newAnswer(2 + i, LATE_ANTE)
    ),
  ]
  contract = {
    id: 'market',
    slug: 'market',
    creatorId: CREATOR,
    creatorUsername: 'creator',
    visibility: 'unlisted',
    mechanism: 'cpmm-multi-2',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: false,
    token: 'MANA',
    subsidyPool: PENDING,
    totalLiquidity: 2 * ANTE + SUBSIDY + LATE_ANSWERS * LATE_ANTE,
    uniqueBettorCount: 0,
    isResolved: false,
    answers,
  } as unknown as CPMMMultiContract
  liquidities = [
    provision(ANTE, 'answer-0'),
    provision(ANTE, 'answer-1'),
    provision(SUBSIDY),
    ...Array.from({ length: LATE_ANSWERS }, (_, i) =>
      provision(LATE_ANTE, `answer-${2 + i}`)
    ),
  ]
  paid = []

  const multi = jest.fn().mockResolvedValue([[], [], [], []])
  jest.mocked(createSupabaseDirectClient).mockReturnValue({
    tx: async (
      _options: unknown,
      work: (task: SupabaseTransaction) => Promise<unknown>
    ) => work({ multi } as unknown as SupabaseTransaction),
  } as unknown as ReturnType<typeof createSupabaseDirectClient>)
  // Each resolution reads the market as the last one's writes left it.
  jest
    .mocked(getContractAndMetricsAndLiquidities)
    .mockImplementation(async () => ({
      contract: {
        ...contract,
        answers: contract.answers.map((a) => ({ ...a })),
      } as MarketContract,
      liquidities,
      contractMetrics: [],
    }))
  jest.mocked(updateAnswer).mockImplementation((async (
    _tx: unknown,
    answerId: string,
    update: Partial<Answer>
  ) => {
    contract.answers = contract.answers.map((a) =>
      a.id === answerId ? { ...a, ...update } : a
    )
  }) as unknown as typeof updateAnswer)
  jest.mocked(updateDataQuery).mockImplementation(((
    _table: string,
    _idField: string,
    update: Partial<CPMMMultiContract>
  ) => {
    // The answers are written by updateAnswer; the copy on the contract is
    // for the metrics calculation.
    const { answers: _answers, ...rest } = update
    contract = { ...contract, ...rest } as CPMMMultiContract
    return 'update contracts'
  }) as unknown as typeof updateDataQuery)
  jest.mocked(bulkIncrementBalancesQuery).mockImplementation(((
    updates: { id: string; balance?: number }[]
  ) => {
    paid.push(sumBy(updates, (u) => u.balance ?? 0))
    return 'select 1'
  }) as unknown as typeof bulkIncrementBalancesQuery)
})

const resolve = (index: number, outcome: 'YES' | 'NO' | 'CANCEL') =>
  resolveMarketHelper(contract as MarketContract, creator, creator, {
    outcome,
    answerId: `answer-${index}`,
  })

it('pays the market out for what was put into it, where it paid Ṁ89,988 more', async () => {
  const share = PENDING / 13

  await resolve(0, 'NO')
  await resolve(1, 'NO')
  // What dev paid for each: its pool and a thirteenth of the pending subsidy.
  expect(paid[0]).toBeCloseTo(171_917.1602000182, 6)
  expect(paid[1]).toBeCloseTo(171_917.1602000182, 6)
  expect(contract.subsidyPool).toBeCloseTo((PENDING * 11) / 13, 6)

  for (let i = 0; i < LATE_ANSWERS; i++) await resolve(2 + i, 'CANCEL')

  // Dev paid each of these Ṁ86,923.08: its ante and 1/13 of the whole subsidy,
  // most of which the first two answers' pools had already paid out. Each
  // holds its ante and its share of what was still pending.
  for (const refund of paid.slice(2)) {
    expect(refund).toBeCloseTo(LATE_ANTE + share, 6)
    expect(refund).toBeLessThan(86_923)
  }
  // Each of them is logged with what it wasn't refunded: 1/13 of the subsidy
  // less its share of what was pending. Neither NO resolution is.
  const warnings = jest.mocked(log.warn).mock.calls
  expect(warnings).toHaveLength(LATE_ANSWERS)
  expect(warnings[0][1]).toMatchObject({
    contractId: 'market',
    answerId: 'answer-2',
    resolverId: CREATOR,
  })
  expect(warnings[0][1]?.withheldLiquidityRefund).toBeCloseTo(
    SUBSIDY / 13 - share,
    6
  )

  const putIn = 2 * ANTE + SUBSIDY + LATE_ANSWERS * LATE_ANTE
  expect(paid).toHaveLength(13)
  expect(sumBy(paid)).toBeCloseTo(putIn, 6)
  expect(sumBy(paid)).toBeLessThanOrEqual(putIn + 1e-6)

  expect(contract.isResolved).toBe(true)
  expect(contract.subsidyPool).toBe(0)
  expect(contract.answers.map((a) => a.resolution)).toEqual([
    'NO',
    'NO',
    ...Array(LATE_ANSWERS).fill('CANCEL'),
  ])
})

it('refunds the late answers their antes alone once the subsidy has all drizzled', async () => {
  // The same market had its creator waited: the whole subsidy in the first
  // two answers' pools, nothing pending. This paid out Ṁ846,154 too much.
  contract.subsidyPool = 0
  contract.answers = contract.answers.map((a) =>
    a.index < 2
      ? { ...a, poolYes: ANTE + SUBSIDY / 2, poolNo: ANTE + SUBSIDY / 2 }
      : a
  )

  await resolve(0, 'YES')
  await resolve(1, 'NO')
  for (let i = 0; i < LATE_ANSWERS; i++) await resolve(2 + i, 'CANCEL')

  expect(paid.slice(0, 2)).toEqual([ANTE + SUBSIDY / 2, ANTE + SUBSIDY / 2])
  expect(paid.slice(2)).toEqual(Array(LATE_ANSWERS).fill(LATE_ANTE))
  expect(sumBy(paid)).toBe(2 * ANTE + SUBSIDY + LATE_ANSWERS * LATE_ANTE)
})

it('still refunds a full share to answers that were all there for the subsidy', async () => {
  // Three answers from the start, a Ṁ900 subsidy two thirds drizzled, and
  // every answer cancelled: each gets its ante and a third of the subsidy.
  contract.answers = [0, 1, 2].map((i) => newAnswer(i, 100 + 200))
  contract.subsidyPool = 300
  liquidities = [
    provision(100, 'answer-0'),
    provision(100, 'answer-1'),
    provision(100, 'answer-2'),
    provision(900),
  ]

  for (const i of [0, 1, 2]) await resolve(i, 'CANCEL')

  expect(paid).toEqual([400, 400, 400])
  expect(contract.subsidyPool).toBe(0)
  expect(log.warn).not.toHaveBeenCalled()
})
