// What unresolving one answer of an independent multiple choice market puts
// back into the market's pending subsidy pool.
//
// A fully resolved market's pool was taken, all of it, by the last answer to
// resolve. Unresolving used to restore that pool whichever answer was being
// unresolved: resolve A, add a subsidy, resolve B (which pays the subsidy
// out), unresolve A, and the subsidy was back in the pool for A to pay out
// again.
//
// The real resolveMarketHelper and the real unresolve handler run here, one
// after the other on the same market. The answers, the payout transactions and
// the contract edits each resolution records are rows in an in-memory
// PostgreSQL, read and written by the handlers' own SQL. The contract row,
// balances and positions are in-memory stand-ins. No live database or network
// is used.
import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'
import { sumBy } from 'lodash'

jest.mock('api/helpers/endpoint', () => ({
  APIError: jest.requireActual('common/api/utils').APIError,
}))
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, handler: unknown) => handler,
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  SERIAL_MODE: {},
}))
jest.mock('shared/utils', () => ({
  getContractAndMetricsAndLiquidities: jest.fn(),
  getContract: jest.fn(),
  getUser: jest.fn(),
  isProd: () => true,
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
  revalidateStaticProps: jest.fn(),
}))
jest.mock('shared/helpers/user-contract-loans', () => ({
  getLoanTrackingForContract: jest.fn().mockResolvedValue([]),
}))
jest.mock('shared/analytics', () => ({ trackPublicEvent: jest.fn() }))
jest.mock('shared/create-notification', () => ({
  createContractResolvedNotifications: jest.fn(),
}))
jest.mock('shared/helpers/fn-queue', () => ({ betsQueue: {} }))
jest.mock('shared/helpers/user-contract-metrics', () => ({
  bulkUpdateContractMetricsQuery: () => 'select 1',
  getContractMetricsForContract: jest.fn(async () => []),
  bulkUpdateContractMetrics: jest.fn(),
}))
jest.mock('shared/supabase/answers', () => ({
  updateAnswer: jest.fn(),
  updateAnswers: jest.fn(),
}))
jest.mock('shared/supabase/contracts', () => ({ updateContract: jest.fn() }))
jest.mock('shared/supabase/users', () => ({
  bulkIncrementBalancesQuery: jest.fn(),
}))
jest.mock('shared/supabase/utils', () => ({
  bulkInsertQuery: jest.fn(),
  updateDataQuery: jest.fn(),
  FieldVal: { delete: () => () => 'delete' },
}))
jest.mock('shared/txn/run-txn', () => ({
  txnToRow: (txn: unknown) => txn,
  insertTxns: jest.fn(),
}))
jest.mock('shared/websockets/helpers', () => ({
  broadcastUpdatedAnswers: jest.fn(),
  broadcastUpdatedContract: jest.fn(),
  broadcastUpdatedMetrics: jest.fn(),
}))

import { unresolveMain } from 'api/unresolve'
import { Answer } from 'common/answer'
import { CPMMMultiContract, MarketContract } from 'common/contract'
import { LiquidityProvision } from 'common/liquidity-provision'
import { convertAnswer } from 'common/supabase/contracts'
import { User } from 'common/user'
import { resolveMarketHelper } from './resolve-market-helpers'
import { updateAnswer } from './supabase/answers'
import { updateContract } from './supabase/contracts'
import { createSupabaseDirectClient } from './supabase/init'
import { bulkIncrementBalancesQuery } from './supabase/users'
import { bulkInsertQuery, updateDataQuery } from './supabase/utils'
import { insertTxns, TxnData } from './txn/run-txn'
import {
  getContract,
  getContractAndMetricsAndLiquidities,
  getUser,
} from './utils'

jest.setTimeout(60_000)

const CREATOR = 'creator'
const creator = { id: CREATOR } as User
const ANTE = 100

const pgp = pgPromise()
let db: PGlite
// Rows as the API's database client returns them (shared/supabase/init).
const parsers = {
  20: (value: string) => parseInt(value, 10),
  1700: parseFloat,
  1114: (value: string) => value,
  1184: (value: string) => value,
}

let contract: CPMMMultiContract
let liquidities: LiquidityProvision[]
// Net mana paid to users by resolutions, less what unresolves took back.
let paid: number
let txnsToInsert: TxnData[]
let txnId: number

const rows = async (sql: string, params?: unknown) =>
  (await db.query(pgp.as.format(sql, params))).rows as any[]

const insertTxnRows = async (txns: TxnData[]) => {
  for (const txn of txns)
    await rows(
      `insert into txns
        (id, amount, category, data, from_id, from_type, to_id, to_type, token)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        `txn-${txnId++}`,
        txn.amount,
        txn.category,
        { data: txn.data, description: txn.description },
        txn.fromId,
        txn.fromType,
        txn.toId,
        txn.toType,
        txn.token,
      ]
    )
}

// The parts of pg-promise the two handlers use. pg-promise formats the
// placeholders as it does in production; PGlite executes the result.
const client = {
  oneOrNone: async (sql: string, params?: unknown, map?: (r: any) => any) => {
    const row = (await rows(sql, params))[0] ?? null
    return map ? map(row) : row
  },
  one: async (sql: string, params?: unknown, map?: (r: any) => any) => {
    const result = await rows(sql, params)
    if (result.length !== 1) throw new Error('No data returned from the query.')
    return map ? map(result[0]) : result[0]
  },
  map: async (sql: string, params: unknown, map: (r: any) => any) =>
    (await rows(sql, params)).map(map),
  many: async (sql: string, params?: unknown) => rows(sql, params),
  none: async (sql: string, params?: unknown) => {
    await rows(sql, params)
  },
  // resolveMarketHelper's one write: balances, payout txns, the contract and
  // metrics. The payout txns are the part unresolve reads back.
  multi: async () => {
    await insertTxnRows(txnsToInsert)
    txnsToInsert = []
    return [[], [], [], []]
  },
  tx: async (...args: unknown[]) =>
    (args[args.length - 1] as (tx: unknown) => Promise<unknown>)(client),
}

const answers = async () =>
  (await rows(`select * from answers order by index`)).map(convertAnswer)

const marketNow = async () =>
  ({ ...contract, answers: await answers() } as CPMMMultiContract)

const addAnswer = async (id: string, index: number) => {
  await rows(
    `insert into answers
      (id, contract_id, index, text, user_id, pool_yes, pool_no, p, prob,
       total_liquidity, subsidy_pool)
    values ($1, 'market', $2, $1, $3, $4, $4, 0.5, 0.5, $4, 0)`,
    [id, index, CREATOR, ANTE]
  )
  liquidities.push({
    id: `ante-${id}`,
    userId: CREATOR,
    contractId: 'market',
    createdTime: 0,
    isAnte: true,
    answerId: id,
    amount: ANTE,
  })
}

// As addContractLiquidity does for the whole market: into the market's pending
// subsidy pool, with a provision that names no answer.
const addSubsidy = (amount: number) => {
  contract.subsidyPool += amount
  liquidities.push({
    id: `subsidy-${liquidities.length}`,
    userId: CREATOR,
    contractId: 'market',
    createdTime: Date.now(),
    amount,
  })
}

// Resolutions and unresolves a millisecond apart would share a payout time.
const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

const resolve = async (answerId: string, outcome: 'YES' | 'NO' | 'CANCEL') => {
  await tick()
  const before = paid
  await resolveMarketHelper(
    (await marketNow()) as MarketContract,
    creator,
    creator,
    { outcome, answerId }
  )
  return paid - before
}

const unresolve = async (answerId: string) => {
  await tick()
  const before = paid
  await unresolveMain(
    { contractId: 'market', answerId },
    { uid: CREATOR } as any,
    {} as any
  )
  return paid - before
}

const pendingOf = async (answerId: string) =>
  (await answers()).find((a) => a.id === answerId)!.subsidyPool

beforeAll(async () => {
  db = new PGlite({ parsers })
  await db.exec(`
    create table answers (
      id text primary key, contract_id text, index integer, text text,
      user_id text, created_time timestamptz default now(), color text,
      is_other boolean default false not null,
      pool_yes numeric, pool_no numeric, p numeric default 0.5 not null,
      prob numeric, total_liquidity numeric default 0,
      subsidy_pool numeric default 0,
      resolution text, resolution_time timestamptz,
      resolution_probability numeric, resolver_id text,
      prob_change_day numeric default 0, prob_change_week numeric default 0,
      prob_change_month numeric default 0,
      image_url text, short_text text, midpoint numeric,
      volume numeric default 0
    );
    create table contract_edits (
      id serial, contract_id text not null,
      created_time timestamptz default now() not null,
      data jsonb not null, editor_id text not null, idempotency_key text,
      updated_keys text[]
    );
    create table txns (
      id text primary key, amount numeric not null, category text not null,
      created_time timestamptz default now() not null, data jsonb not null,
      from_id text not null, from_type text not null, to_id text not null,
      to_type text not null, token text default 'M$' not null
    );
    create table audit_events (
      id serial, contract_id text, name text, user_id text,
      created_time timestamptz default now()
    );
    create table contract_bets (
      contract_id text, answer_id text, prob_after numeric,
      created_time timestamptz
    );
    create function ts_to_millis (ts timestamptz) returns bigint
      language sql immutable as
      $$ select (extract(epoch from ts) * 1000)::bigint $$;
  `)
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  jest.clearAllMocks()
  await db.exec(`
    truncate answers; truncate contract_edits; truncate txns;
    truncate audit_events; truncate contract_bets;
  `)
  contract = {
    id: 'market',
    slug: 'market',
    creatorId: CREATOR,
    creatorUsername: 'creator',
    visibility: 'public',
    mechanism: 'cpmm-multi-2',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: false,
    token: 'MANA',
    subsidyPool: 0,
    uniqueBettorCount: 0,
    isResolved: false,
    answers: [],
  } as unknown as CPMMMultiContract
  liquidities = []
  paid = 0
  txnsToInsert = []
  txnId = 0

  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      client as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
  jest.mocked(getUser).mockResolvedValue(creator)
  jest.mocked(getContract).mockImplementation(async () => marketNow())
  jest
    .mocked(getContractAndMetricsAndLiquidities)
    .mockImplementation(async () => ({
      contract: (await marketNow()) as MarketContract,
      liquidities,
      contractMetrics: [],
    }))

  // resolveMarketHelper's writes.
  jest.mocked(updateAnswer).mockImplementation((async (
    _pg: unknown,
    answerId: string,
    update: Partial<Answer>
  ) => {
    await rows(
      `update answers set
        resolution = $2,
        resolution_time = to_timestamp($3::numeric / 1000),
        resolution_probability = $4,
        prob = $5,
        resolver_id = $6,
        subsidy_pool = $7
      where id = $1`,
      [
        answerId,
        update.resolution,
        update.resolutionTime,
        update.resolutionProbability,
        update.prob,
        update.resolverId,
        update.subsidyPool,
      ]
    )
  }) as unknown as typeof updateAnswer)
  jest.mocked(updateDataQuery).mockImplementation(((
    _table: string,
    _idField: string,
    update: Partial<CPMMMultiContract>
  ) => {
    const { answers: _answers, ...rest } = update
    contract = { ...contract, ...rest } as CPMMMultiContract
    return 'update contracts'
  }) as unknown as typeof updateDataQuery)
  jest.mocked(bulkInsertQuery).mockImplementation(((
    _table: string,
    values: TxnData[]
  ) => {
    txnsToInsert = values
    return 'insert into txns'
  }) as unknown as typeof bulkInsertQuery)

  // Both handlers'.
  jest.mocked(bulkIncrementBalancesQuery).mockImplementation(((
    updates: { id: string; balance?: number }[]
  ) => {
    paid += sumBy(updates, (u) => u.balance ?? 0)
    return `select 'creator' as id, 0 as balance`
  }) as unknown as typeof bulkIncrementBalancesQuery)

  // unresolve's.
  jest.mocked(updateContract).mockImplementation((async (
    _pg: unknown,
    _contractId: string,
    update: Record<string, unknown>
  ) => {
    const next = { ...contract } as Record<string, unknown>
    for (const [key, value] of Object.entries(update)) {
      // FieldVal.delete()
      if (typeof value === 'function') delete next[key]
      else next[key] = value
    }
    contract = next as unknown as CPMMMultiContract
  }) as unknown as typeof updateContract)
  jest.mocked(insertTxns).mockImplementation((async (
    _pg: unknown,
    txns: TxnData[]
  ) => {
    await insertTxnRows(txns)
  }) as unknown as typeof insertTxns)

  await addAnswer('A', 0)
  await addAnswer('B', 1)
})

describe('unresolving an answer that was not the last to resolve', () => {
  // Resolve A, add a subsidy, resolve B, unresolve A: B's resolution paid the
  // subsidy out, and its payout stands.
  const untilAIsReopened = async () => {
    expect(await resolve('A', 'YES')).toBe(ANTE)
    addSubsidy(1000)
    expect(await resolve('B', 'YES')).toBe(ANTE + 1000)
    expect(contract.isResolved).toBe(true)
    expect(contract.subsidyPool).toBe(0)

    expect(await unresolve('A')).toBe(-ANTE)
    expect(contract.isResolved).toBe(false)
  }

  it('leaves the subsidy the last answer paid out, out of the pool', async () => {
    await untilAIsReopened()
    // Was 1,000: the pool as B's resolution found it.
    expect(contract.subsidyPool).toBe(0)
    expect(await pendingOf('A')).toBe(0)
  })

  it.each(['YES', 'NO', 'CANCEL'] as const)(
    'then pays the market out for what was put into it, resolving it %s',
    async (outcome) => {
      await untilAIsReopened()
      // Was 1,100 for YES or NO and 600 for CANCEL, on top of B's 1,100: 2,200
      // or 1,700 paid out of the 1,200 put in.
      expect(await resolve('A', outcome)).toBe(ANTE)
      expect(paid).toBe(2 * ANTE + 1000)
      expect(contract.isResolved).toBe(true)
    }
  )

  it('does not restore it for any of several earlier answers', async () => {
    await addAnswer('C', 2)
    await resolve('A', 'NO')
    await resolve('C', 'NO')
    addSubsidy(1000)
    await resolve('B', 'YES')

    await unresolve('A')
    expect(contract.subsidyPool).toBe(0)
    expect(await resolve('A', 'YES')).toBe(ANTE)
    // The market is resolved again, by A, which took an empty pool.
    await unresolve('C')
    expect(contract.subsidyPool).toBe(0)
    expect(await resolve('C', 'YES')).toBe(ANTE)
    expect(paid).toBe(3 * ANTE + 1000)
  })
})

describe('unresolving the answer whose resolution resolved the market', () => {
  it('puts back the pool that resolution took, as before', async () => {
    addSubsidy(1000)
    expect(await resolve('A', 'YES')).toBe(ANTE + 500)
    expect(await resolve('B', 'NO')).toBe(ANTE + 500)
    expect(contract.isResolved).toBe(true)

    expect(await unresolve('B')).toBe(-(ANTE + 500))
    expect(contract.isResolved).toBe(false)
    expect(contract.subsidyPool).toBe(500)

    expect(await resolve('B', 'YES')).toBe(ANTE + 500)
    expect(paid).toBe(2 * ANTE + 1000)
  })

  it('puts it back after a cancellation too', async () => {
    addSubsidy(1000)
    await resolve('A', 'YES')
    expect(await resolve('B', 'CANCEL')).toBe(ANTE + 500)
    await unresolve('B')
    expect(contract.subsidyPool).toBe(500)
    expect(await resolve('B', 'NO')).toBe(ANTE + 500)
    expect(paid).toBe(2 * ANTE + 1000)
  })

  // The edit a resolution records is written after it commits, and can be
  // lost. The latest one on file is then from an earlier resolution of the
  // same answer, since undone, whose pool has drizzled into the answers'
  // pools in the meantime: restoring it would count that subsidy twice.
  it('puts nothing back when the only edit on file is from an earlier resolution', async () => {
    addSubsidy(1000)
    await resolve('A', 'YES')
    await resolve('B', 'NO')
    const [{ id }] = await rows(
      `select id from contract_edits order by created_time desc limit 1`
    )
    await rows(
      `update contract_edits
      set created_time = created_time - interval '1 hour' where id = $1`,
      [id]
    )

    await unresolve('B')
    expect(contract.isResolved).toBe(false)
    expect(contract.subsidyPool).toBe(0)
  })
})

describe('unresolving an answer while the market is still open', () => {
  it('leaves the market pool as it is, as before', async () => {
    await addAnswer('C', 2)
    addSubsidy(900)
    expect(await resolve('A', 'YES')).toBe(ANTE + 300)
    expect(contract.subsidyPool).toBe(600)

    expect(await unresolve('A')).toBe(-(ANTE + 300))
    expect(contract.isResolved).toBe(false)
    expect(contract.subsidyPool).toBe(600)
  })
})
