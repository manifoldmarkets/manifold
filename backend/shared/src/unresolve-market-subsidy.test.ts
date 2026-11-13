// What unresolving puts back of the pending subsidy a resolution took: an
// independent market's pool, an answer's own, a binary or linked market's.
//
// A fully resolved independent market's pool was taken, all of it, by the last
// answer to resolve. Unresolving used to restore that pool whichever answer
// was being unresolved: resolve A, add a subsidy, resolve B (which pays the
// subsidy out), unresolve A, and the subsidy was back in the pool for A to pay
// out again. And an answer unresolved while the market was still open got
// none of its share back.
//
// Whatever it restored, it read from the latest edit on file, taking that to
// be the resolution's own. Resolutions recorded their edit after committing,
// so it could be missing or late, and the latest one another resolution's,
// holding subsidy that had since moved into the pools.
//
// Now each resolution records the market as it found it in its own
// transaction, under a key that names it, and unresolving puts back what that
// record says it took, added to what the pools hold. A resolution from before
// that, with no record of its own, has nothing put back.
//
// Which payouts it takes back was a separate guess as well: the latest batch
// paid, by the time stamped on it. Each payout now carries the resolutionTime
// of the resolution that paid it, and no payout is taken back twice.
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
  FieldVal: {
    delete: () => () => 'delete',
    increment: (by: number) => Object.assign(() => 'increment', { by }),
  },
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
import { updateAnswer, updateAnswers } from './supabase/answers'
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

const unresolve = async (answerId?: string) => {
  await tick()
  const before = paid
  await unresolveMain(
    { contractId: 'market', answerId },
    { uid: CREATOR } as any,
    {} as any
  )
  return paid - before
}

// A binary market resolved YES or NO, or a linked one resolved to an answer.
const resolveMarket = async (outcome: string) => {
  await tick()
  const before = paid
  await resolveMarketHelper(
    (await marketNow()) as MarketContract,
    creator,
    creator,
    (contract.mechanism as string) === 'cpmm-1'
      ? { outcome }
      : { outcome, resolutions: { [outcome]: 100 } }
  )
  return paid - before
}

// The drizzle, as far as these cases need it: mana out of the market's
// pending pool into an answer's pool,
const drizzleInto = async (answerId: string, amount: number) => {
  contract.subsidyPool -= amount
  await rows(
    `update answers
    set pool_yes = pool_yes + $2, pool_no = pool_no + $2 where id = $1`,
    [answerId, amount]
  )
}

// and an answer's own pending subsidy into its pool.
const drizzleOwn = (answerId: string) =>
  rows(
    `update answers
    set pool_yes = pool_yes + subsidy_pool, pool_no = pool_no + subsidy_pool,
      subsidy_pool = 0
    where id = $1`,
    [answerId]
  )

// As addContractLiquidity does for one answer: its pending subsidy, with a
// provision of its own.
const addAnswerSubsidy = async (answerId: string, amount: number) => {
  await rows(
    `update answers set subsidy_pool = subsidy_pool + $2 where id = $1`,
    [answerId, amount]
  )
  liquidities.push({
    id: `subsidy-${liquidities.length}`,
    userId: CREATOR,
    contractId: 'market',
    createdTime: Date.now(),
    answerId,
    amount,
  })
}

// As if the last resolution's edit had not been recorded. A resolution records
// it in its own transaction now; before, after committing, where it could be
// lost.
const loseLatestEdit = () =>
  rows(
    `delete from contract_edits where id = (
      select id from contract_edits
      where coalesce((data->>'isResolved')::boolean, false) = false
      order by created_time desc, id desc limit 1
    )`
  )

// The edits of resolutions made before they were keyed: recorded after the
// resolution committed, with nothing on them to say which resolution's.
const forgetEditKeys = () =>
  rows(`update contract_edits set idempotency_key = null`)

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
    -- Only for the row lock unresolve takes: the contract itself is the
    -- in-memory stand-in.
    create table contracts (id text primary key);
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
    truncate audit_events; truncate contract_bets; truncate contracts;
    insert into contracts (id) values ('market');
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
  jest.mocked(updateAnswers).mockImplementation((async (
    _pg: unknown,
    _contractId: string,
    updates: (Partial<Answer> & { id: string })[]
  ) => {
    for (const update of updates)
      await rows(
        `update answers set
          resolution_time = to_timestamp($2::numeric / 1000),
          resolution_probability = $3,
          prob = $4,
          resolver_id = $5,
          subsidy_pool = $6
        where id = $1`,
        [
          update.id,
          update.resolutionTime,
          update.resolutionProbability,
          update.prob,
          update.resolverId,
          update.subsidyPool,
        ]
      )
  }) as unknown as typeof updateAnswers)
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
      if (typeof value !== 'function') next[key] = value
      // FieldVal.increment(by)
      else if ('by' in value)
        next[key] = ((next[key] as number) ?? 0) + (value.by as number)
      // FieldVal.delete()
      else delete next[key]
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

  // Both answers took half of the pool. Unresolving the first used to put
  // back the pool as the second found it, which here happens to be the same
  // amount.
  it('puts back the share its own resolution took', async () => {
    addSubsidy(1000)
    expect(await resolve('A', 'YES')).toBe(ANTE + 500)
    expect(await resolve('B', 'NO')).toBe(ANTE + 500)

    expect(await unresolve('A')).toBe(-(ANTE + 500))
    expect(contract.isResolved).toBe(false)
    expect(contract.subsidyPool).toBe(500)

    expect(await resolve('A', 'NO')).toBe(ANTE + 500)
    expect(paid).toBe(2 * ANTE + 1000)
  })

  it('puts back unequal shares, each its own', async () => {
    await addAnswer('C', 2)
    addSubsidy(300)
    expect(await resolve('A', 'YES')).toBe(ANTE + 100)
    addSubsidy(1000)
    expect(await resolve('B', 'YES')).toBe(ANTE + 600)
    expect(await resolve('C', 'YES')).toBe(ANTE + 600)

    // Was 600, the pool as C found it.
    await unresolve('A')
    expect(contract.subsidyPool).toBe(100)
    expect(await resolve('A', 'NO')).toBe(ANTE + 100)
    await unresolve('B')
    expect(contract.subsidyPool).toBe(600)
    expect(await resolve('B', 'NO')).toBe(ANTE + 600)
    expect(paid).toBe(3 * ANTE + 1300)
  })

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

  // With that resolution's edit missing, the latest on file is from an
  // earlier resolution of the same answer, since undone, and part of the pool
  // it holds has drizzled into the answer's pool, which pays it out.
  it('puts nothing back from the edit of an earlier resolution of that answer', async () => {
    addSubsidy(1000)
    expect(await resolve('A', 'YES')).toBe(ANTE + 500)
    expect(await resolve('B', 'NO')).toBe(ANTE + 500)
    await unresolve('B')
    expect(contract.subsidyPool).toBe(500)
    await drizzleInto('B', 300)

    expect(await resolve('B', 'NO')).toBe(ANTE + 300 + 200)
    await loseLatestEdit()
    await unresolve('B')
    // Was 500, from the first resolution's edit, seconds old: 300 of it is in
    // B's pool.
    expect(contract.subsidyPool).toBe(0)
    expect(contract.isResolved).toBe(false)

    expect(await resolve('B', 'NO')).toBe(ANTE + 300)
    expect(paid).toBeLessThanOrEqual(2 * ANTE + 1000)
  })

  // A resolution made before edits were keyed has only an unkeyed edit,
  // which nothing ties to it.
  it('takes back the payouts and puts nothing back for a resolution from before edits were keyed', async () => {
    addSubsidy(1000)
    await resolve('A', 'YES')
    await resolve('B', 'NO')
    await forgetEditKeys()

    expect(await unresolve('B')).toBe(-(ANTE + 500))
    expect(contract.isResolved).toBe(false)
    // Was 500, from the latest edit on file, whichever resolution's it was.
    expect(contract.subsidyPool).toBe(0)
  })

  it('keeps a subsidy that came in while the market was resolved', async () => {
    addSubsidy(1000)
    await resolve('A', 'YES')
    await resolve('B', 'NO')
    // addHouseSubsidy does not check that the market is open.
    addSubsidy(70)

    await unresolve('B')
    expect(contract.subsidyPool).toBe(570)
  })
})

describe('unresolving an answer while the market is still open', () => {
  // It used to get none of it back, and the share stayed out of the pool for
  // good.
  it('puts back the share of the pool its resolution took', async () => {
    await addAnswer('C', 2)
    addSubsidy(900)
    expect(await resolve('A', 'YES')).toBe(ANTE + 300)
    expect(contract.subsidyPool).toBe(600)

    expect(await unresolve('A')).toBe(-(ANTE + 300))
    expect(contract.isResolved).toBe(false)
    expect(contract.subsidyPool).toBe(900)

    expect(await resolve('A', 'NO')).toBe(ANTE + 300)
    expect(await resolve('B', 'NO')).toBe(ANTE + 300)
    expect(await resolve('C', 'NO')).toBe(ANTE + 300)
    expect(paid).toBe(3 * ANTE + 900)
  })

  it('adds it to what the pool holds by then', async () => {
    await addAnswer('C', 2)
    addSubsidy(900)
    await resolve('A', 'YES')
    addSubsidy(100)
    await drizzleInto('B', 200)
    expect(contract.subsidyPool).toBe(500)

    await unresolve('A')
    expect(contract.subsidyPool).toBe(800)
  })

  it('puts nothing back for a resolution from before edits were keyed', async () => {
    await addAnswer('C', 2)
    addSubsidy(900)
    await resolve('A', 'YES')
    await forgetEditKeys()

    expect(await unresolve('A')).toBe(-(ANTE + 300))
    expect(contract.subsidyPool).toBe(600)
  })
})

describe('unresolving an answer that had pending subsidy of its own', () => {
  it('puts back what its resolution took, as before', async () => {
    await addAnswerSubsidy('B', 400)
    expect(await resolve('B', 'YES')).toBe(ANTE + 400)
    expect(await pendingOf('B')).toBe(0)

    await unresolve('B')
    expect(await pendingOf('B')).toBe(400)
    expect(await resolve('B', 'NO')).toBe(ANTE + 400)
    expect(paid).toBe(ANTE + 400)
  })

  // A's resolution recorded B with its subsidy still pending. It has drizzled
  // into B's pool by the time B resolves, and B's own edit is lost.
  it("puts nothing back from the edit of another answer's resolution", async () => {
    await addAnswerSubsidy('B', 400)
    expect(await resolve('A', 'NO')).toBe(ANTE)
    await drizzleOwn('B')

    expect(await resolve('B', 'YES')).toBe(ANTE + 400)
    await loseLatestEdit()
    await unresolve('B')
    // Was 400, though B's pool holds it.
    expect(await pendingOf('B')).toBe(0)

    expect(await resolve('B', 'YES')).toBe(ANTE + 400)
    expect(paid).toBe(2 * ANTE + 400)
  })

  // Another answer's edit, recorded later, also shows B unresolved, with more
  // pending than B's resolution found.
  it("puts back what its own resolution's edit holds, whatever was recorded since", async () => {
    await addAnswerSubsidy('B', 400)
    expect(await resolve('A', 'NO')).toBe(ANTE)
    await rows(
      `update answers
      set pool_yes = pool_yes + 150, pool_no = pool_no + 150,
        subsidy_pool = subsidy_pool - 150
      where id = 'B'`
    )
    expect(await resolve('B', 'YES')).toBe(ANTE + 150 + 250)
    // A's edit arrives after B's.
    await rows(
      `update contract_edits
      set created_time = now() + interval '1 minute'
      where idempotency_key like 'resolution:A:%'`
    )

    await unresolve('B')
    // Was 400, from A's edit.
    expect(await pendingOf('B')).toBe(250)
    expect(await resolve('B', 'YES')).toBe(ANTE + 150 + 250)
    expect(paid).toBe(2 * ANTE + 400)
  })

  it('puts nothing back for a resolution from before edits were keyed', async () => {
    await addAnswerSubsidy('B', 400)
    await resolve('B', 'YES')
    await forgetEditKeys()

    expect(await unresolve('B')).toBe(-(ANTE + 400))
    expect(await pendingOf('B')).toBe(0)
  })

  // Resolutions from before edits were keyed, moments apart. A's edit shows B
  // with its subsidy still pending and was recorded just before B resolved.
  // B's own is missing. A's edit used to be taken for B's.
  it("puts nothing back from another answer's unkeyed edit, recorded moments before", async () => {
    await addAnswerSubsidy('B', 400)
    expect(await resolve('A', 'NO')).toBe(ANTE)
    await drizzleOwn('B')
    expect(await resolve('B', 'YES')).toBe(ANTE + 400)
    await loseLatestEdit()
    await forgetEditKeys()

    await unresolve('B')
    // Was 400, though B's pool holds it.
    expect(await pendingOf('B')).toBe(0)
    expect(await resolve('B', 'YES')).toBe(ANTE + 400)
    expect(paid).toBe(2 * ANTE + 400)
  })

  it('keeps a subsidy that came in for it while it was resolved', async () => {
    await addAnswerSubsidy('B', 400)
    expect(await resolve('B', 'YES')).toBe(ANTE + 400)
    // addHouseSubsidyToAnswer does not check that the answer is open.
    await addAnswerSubsidy('B', 30)

    await unresolve('B')
    // Was 400: the 30 written over.
    expect(await pendingOf('B')).toBe(430)
  })
})

describe('taking back the payouts of the resolution being undone', () => {
  const payoutsOf = (amount: number) =>
    `category = 'CONTRACT_RESOLUTION_PAYOUT' and amount = ${amount}`

  // The resolver of an earlier resolution, since undone, had its clock ahead
  // of this one's.
  it('takes back its payouts, not an earlier resolution stamped later', async () => {
    expect(await resolve('A', 'YES')).toBe(ANTE)
    expect(await unresolve('A')).toBe(-ANTE)
    addSubsidy(1000)
    expect(await resolve('A', 'YES')).toBe(ANTE + 500)
    await rows(
      `update txns
      set data = jsonb_set(
        data,
        '{data,payoutStartTime}',
        to_jsonb((data->'data'->>'payoutStartTime')::numeric + 600000)
      )
      where ${payoutsOf(ANTE)}`
    )

    // Was -100: the first resolution's payout a second time, while this
    // one's 600 stood and its share of the pool was put back to pay out again.
    expect(await unresolve('A')).toBe(-(ANTE + 500))
    expect(contract.subsidyPool).toBe(1000)

    expect(await resolve('A', 'NO')).toBe(ANTE + 500)
    expect(await resolve('B', 'NO')).toBe(ANTE + 500)
    expect(paid).toBe(2 * ANTE + 1000)
  })

  it('takes back nothing when it paid nothing out', async () => {
    expect(await resolve('A', 'YES')).toBe(ANTE)
    expect(await unresolve('A')).toBe(-ANTE)
    await resolve('A', 'YES')
    // As if this resolution had written no payouts.
    await rows(
      `delete from txns where id = (
        select id from txns where ${payoutsOf(ANTE)}
        order by created_time desc, id desc limit 1
      )`
    )

    // Was -100: the first resolution's payout, taken back before.
    expect(await unresolve('A')).toBe(0)
  })

  it('takes no payout back twice for a resolution from before payouts were stamped either', async () => {
    const unstamp = () =>
      rows(`update txns set data = data #- '{data,resolutionTime}'`)

    expect(await resolve('A', 'YES')).toBe(ANTE)
    await unstamp()
    await forgetEditKeys()
    expect(await unresolve('A')).toBe(-ANTE)

    await resolve('A', 'YES')
    await rows(
      `delete from txns where id = (
        select id from txns where ${payoutsOf(ANTE)}
        order by created_time desc, id desc limit 1
      )`
    )
    await unstamp()
    await forgetEditKeys()
    expect(await unresolve('A')).toBe(0)
  })
})

describe('unresolving while another process is at the same market', () => {
  // The lock itself needs two connections to show. This is that it is asked
  // for, on the market's row, before the market is read.
  it.each([
    ['one answer of an independent market', 'B'],
    ['a whole market', undefined],
  ])('locks the market before reading it, for %s', async (_, answerId) => {
    if (answerId) await resolve(answerId, 'YES')
    else {
      contract = {
        ...contract,
        shouldAnswersSumToOne: true,
      } as CPMMMultiContract
      await resolveMarket('A')
    }
    const order: string[] = []
    const oneOrNone = jest.spyOn(client, 'oneOrNone')
    oneOrNone.mockImplementation(async (sql, params, map) => {
      if (/from contracts where id = \$1 for update/.test(sql))
        order.push('lock')
      const row = (await rows(sql, params))[0] ?? null
      return map ? map(row) : row
    })
    jest.mocked(getContract).mockImplementation(async () => {
      order.push('read')
      return marketNow()
    })

    await unresolve(answerId)
    oneOrNone.mockRestore()
    expect(order).toEqual(['lock', 'read'])
  })
})

describe('unresolving a binary market', () => {
  beforeEach(async () => {
    await db.exec(`truncate answers`)
    contract = {
      id: 'market',
      slug: 'market',
      creatorId: CREATOR,
      creatorUsername: 'creator',
      visibility: 'public',
      mechanism: 'cpmm-1',
      outcomeType: 'BINARY',
      token: 'MANA',
      pool: { YES: 100, NO: 100 },
      p: 0.5,
      prob: 0.5,
      subsidyPool: 300,
      uniqueBettorCount: 0,
      isResolved: false,
    } as unknown as CPMMMultiContract
    liquidities = [
      {
        id: 'ante',
        userId: CREATOR,
        contractId: 'market',
        createdTime: 0,
        amount: 400,
      },
    ]
  })

  it('puts back the pending subsidy its resolution took, as before', async () => {
    expect(await resolveMarket('YES')).toBe(400)
    expect(contract.subsidyPool).toBe(0)

    expect(await unresolve()).toBe(-400)
    expect(contract.isResolved).toBe(false)
    expect(contract.subsidyPool).toBe(300)

    expect(await resolveMarket('NO')).toBe(400)
    expect(paid).toBe(400)
  })

  it('puts nothing back from the edit of an earlier resolution', async () => {
    await resolveMarket('YES')
    await unresolve()
    // The drizzle moves the pending subsidy into the pool.
    const binary = contract as unknown as {
      pool: { YES: number; NO: number }
    }
    binary.pool = { YES: 400, NO: 400 }
    contract.subsidyPool = 0

    expect(await resolveMarket('YES')).toBe(400)
    await loseLatestEdit()
    await unresolve()
    // Was 300, from the first resolution's edit, though the pool holds it.
    expect(contract.subsidyPool).toBe(0)

    expect(await resolveMarket('YES')).toBe(400)
    expect(paid).toBe(400)
  })

  it('takes back the payouts and puts nothing back for a resolution from before edits were keyed', async () => {
    await resolveMarket('YES')
    await forgetEditKeys()

    expect(await unresolve()).toBe(-400)
    expect(contract.isResolved).toBe(false)
    // Was 300, from the latest edit on file.
    expect(contract.subsidyPool).toBe(0)
  })

  it('keeps a subsidy that came in while the market was resolved', async () => {
    await resolveMarket('YES')
    // addHouseSubsidy does not check that the market is open.
    contract.subsidyPool += 50

    await unresolve()
    // Was 300: the 50 written over.
    expect(contract.subsidyPool).toBe(350)
  })
})

describe('unresolving a linked multiple choice market', () => {
  beforeEach(async () => {
    contract = {
      ...contract,
      shouldAnswersSumToOne: true,
      subsidyPool: 100,
    } as CPMMMultiContract
    await rows(`update answers set subsidy_pool = 50`)
  })

  it("puts back the market's and the answers' pending subsidy, as before", async () => {
    // A's YES side, B's NO side, and all the pending subsidy.
    expect(await resolveMarket('A')).toBe(2 * ANTE + 100 + 2 * 50)
    expect(contract.subsidyPool).toBe(0)
    expect(await pendingOf('A')).toBe(0)

    await unresolve()
    expect(contract.isResolved).toBe(false)
    expect(contract.subsidyPool).toBe(100)
    expect(await pendingOf('A')).toBe(50)
    expect(await pendingOf('B')).toBe(50)

    expect(await resolveMarket('B')).toBe(400)
    expect(paid).toBe(400)
  })

  it('puts nothing back from the edit of an earlier resolution', async () => {
    await resolveMarket('A')
    await unresolve()
    // The drizzle moves the pending subsidy into the pools.
    await drizzleInto('A', 50)
    await drizzleInto('B', 50)
    await drizzleOwn('A')
    await drizzleOwn('B')
    expect(contract.subsidyPool).toBe(0)

    expect(await resolveMarket('A')).toBe(400)
    await loseLatestEdit()
    await unresolve()
    // Were 100 and 50 each, from the first resolution's edit, though the
    // pools hold them.
    expect(contract.subsidyPool).toBe(0)
    expect(await pendingOf('A')).toBe(0)
    expect(await pendingOf('B')).toBe(0)

    expect(await resolveMarket('A')).toBe(400)
    expect(paid).toBe(400)
  })

  it('takes back the payouts and puts nothing back for a resolution from before edits were keyed', async () => {
    await resolveMarket('A')
    await forgetEditKeys()

    expect(await unresolve()).toBe(-400)
    expect(contract.isResolved).toBe(false)
    expect(contract.subsidyPool).toBe(0)
    expect(await pendingOf('A')).toBe(0)
    expect(await pendingOf('B')).toBe(0)
  })
})
