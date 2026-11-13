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
// that, with no record of its own, is not undone: its payouts would come
// back with nothing to say what to put back for them. The key is one
// edit's alone, so two resolutions of an answer in the same millisecond
// cannot be taken for each other.
//
// Which payouts it takes back was a separate guess as well: the latest batch
// paid, by the time stamped on it. Each payout now carries the resolutionTime
// of the resolution that paid it, no payout is taken back twice, and a
// resolution is not undone while a payout that isn't its own is standing.
//
// Liquidity added to the whole of an independent market now goes to the
// answers open at that moment, as each one's own pending subsidy, and records
// them (addSubsidyToOpenAnswers, which runs here as it is). The market's pool
// only holds what was added before that, by provisions that record no
// answers.
//
// The real resolveMarketHelper and the real unresolve handler run here, one
// after the other on the same market. The answers, the payout transactions and
// the contract edits each resolution records are rows in an in-memory
// PostgreSQL, read and written by the handlers' own SQL. The contract row,
// balances and positions are in-memory stand-ins. A transaction that fails
// is rolled back, the stand-ins with it. No live database or network is used.
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
import { ENV_CONFIG } from 'common/envs/constants'
import { LiquidityProvision } from 'common/liquidity-provision'
import { convertAnswer } from 'common/supabase/contracts'
import { User } from 'common/user'
import { resolveMarketHelper } from './resolve-market-helpers'
import { bulkUpdateContractMetrics } from './helpers/user-contract-metrics'
import { updateAnswer, updateAnswers } from './supabase/answers'
import { updateContract } from './supabase/contracts'
import { createSupabaseDirectClient } from './supabase/init'
import { bulkIncrementBalancesQuery } from './supabase/users'
import { bulkInsertQuery, updateDataQuery } from './supabase/utils'
import { insertTxns, TxnData } from './txn/run-txn'
import { broadcastUpdatedContract } from './websockets/helpers'
import {
  getContract,
  getContractAndMetricsAndLiquidities,
  getUser,
  log,
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
  manyOrNone: async (sql: string, params?: unknown) => rows(sql, params),
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
  // One transaction: what it wrote is undone if it fails, in the database
  // and in the stand-ins.
  tx: async (...args: unknown[]) => {
    const saved = { contract, paid, txnsToInsert, txnId }
    await db.exec('begin')
    try {
      const result = await (
        args[args.length - 1] as (tx: unknown) => Promise<unknown>
      )(client)
      await db.exec('commit')
      return result
    } catch (error) {
      await db.exec('rollback')
      ;({ contract, paid, txnsToInsert, txnId } = saved)
      throw error
    }
  },
}

const answers = async () =>
  (await rows(`select * from answers order by index`)).map(convertAnswer)

const marketNow = async () =>
  ({ ...contract, answers: await answers() } as CPMMMultiContract)

// Resolutions and unresolves a millisecond apart would share a payout time.
const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

// A provision, as the payouts read them
// (getContractAndMetricsAndLiquidities).
const provide = (
  provision: Omit<LiquidityProvision, 'id' | 'userId' | 'contractId'>
) => {
  liquidities.push({
    id: `provision-${liquidities.length}`,
    userId: CREATOR,
    contractId: 'market',
    ...provision,
  })
}

const addAnswer = async (id: string, index: number) => {
  await rows(
    `insert into answers
      (id, contract_id, index, text, user_id, pool_yes, pool_no, p, prob,
       total_liquidity, subsidy_pool)
    values ($1, 'market', $2, $1, $3, $4, $4, 0.5, 0.5, $4, 0)`,
    [id, index, CREATOR, ANTE]
  )
  await provide({ createdTime: 0, isAnte: true, answerId: id, amount: ANTE })
}

// As addContractLiquidity does for the whole of an independent market: to the
// answers open now, in equal shares, as each one's own pending subsidy, with
// a provision that records them. The split is the handler's own.
const addSubsidy = async (amount: number) => {
  await tick()
  const { addSubsidyToOpenAnswers } = jest.requireActual<
    typeof import('./supabase/answers')
  >('shared/supabase/answers')
  const taken = await addSubsidyToOpenAnswers(
    client as unknown as Parameters<typeof addSubsidyToOpenAnswers>[0],
    'market',
    amount
  )
  await provide({
    createdTime: Date.now(),
    amount,
    answerIds: taken.map((a) => a.id),
  })
  return taken.map((a) => a.id)
}

// As it did before provisions recorded their answers, and still does for a
// binary or linked market: into the market's pending subsidy pool, with a
// provision that names no answer. Independent markets hold such provisions
// from before.
const addUnrecordedSubsidy = async (amount: number) => {
  await tick()
  contract.subsidyPool += amount
  await provide({ createdTime: Date.now(), amount })
}

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

const unresolve = async (answerId?: string, uid = CREATOR) => {
  await tick()
  const before = paid
  await unresolveMain(
    { contractId: 'market', answerId },
    { uid } as any,
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
  await provide({ createdTime: Date.now(), answerId, amount })
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

// A resolution at a given millisecond on the resolver's clock.
const resolveAt = async (
  answerId: string,
  outcome: 'YES' | 'NO' | 'CANCEL',
  time: number
) => {
  await tick()
  const now = jest.spyOn(Date, 'now').mockReturnValue(time)
  const before = paid
  try {
    await resolveMarketHelper(
      (await marketNow()) as MarketContract,
      creator,
      creator,
      { outcome, answerId }
    )
  } finally {
    now.mockRestore()
  }
  return paid - before
}

// A resolution as one made before this code left it: an edit with no key, and
// payouts that don't carry their resolution.
const asFromBefore = async () => {
  await forgetEditKeys()
  await rows(`update txns set data = data #- '{data,resolutionTime}'`)
}

const ADMIN = ENV_CONFIG.adminIds[0]

// Refused, with nothing paid or taken back.
const expectRefused = async (unresolving: Promise<unknown>) => {
  const before = paid
  await expect(unresolving).rejects.toMatchObject({ code: 403 })
  expect(paid).toBe(before)
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
    return contract
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
  // subsidy out, and its payout stands. The subsidy went to B, the one answer
  // open when it was added.
  const untilAIsReopened = async () => {
    expect(await resolve('A', 'YES')).toBe(ANTE)
    expect(await addSubsidy(1000)).toEqual(['B'])
    expect(contract.subsidyPool).toBe(0)
    expect(await pendingOf('B')).toBe(1000)
    expect(await resolve('B', 'YES')).toBe(ANTE + 1000)
    expect(contract.isResolved).toBe(true)

    expect(await unresolve('A')).toBe(-ANTE)
    expect(contract.isResolved).toBe(false)
  }

  it('leaves the subsidy the last answer paid out where it went', async () => {
    await untilAIsReopened()
    // Was 1,000 in the market's pool: the pool as B's resolution found it.
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

  // The same with a provision from before they recorded their answers: it is
  // in the market's pool, and B's resolution takes all of it. Afterwards
  // nothing says that A had none of it, but A holds none of it to refund.
  it.each(['YES', 'NO', 'CANCEL'] as const)(
    'pays it out for what was put into it with a provision that records no answers too, resolving it %s',
    async (outcome) => {
      expect(await resolve('A', 'YES')).toBe(ANTE)
      await addUnrecordedSubsidy(1000)
      expect(await resolve('B', 'YES')).toBe(ANTE + 1000)

      expect(await unresolve('A')).toBe(-ANTE)
      expect(contract.subsidyPool).toBe(0)
      expect(await resolve('A', outcome)).toBe(ANTE)
      expect(paid).toBe(2 * ANTE + 1000)
    }
  )

  // Both answers took half of the pool. Unresolving the first used to put
  // back the pool as the second found it, which here happens to be the same
  // amount.
  it('puts back the share its own resolution took', async () => {
    await addUnrecordedSubsidy(1000)
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
    await addUnrecordedSubsidy(1200)
    expect(await resolve('A', 'YES')).toBe(ANTE + 400)
    await drizzleInto('B', 200)
    expect(await resolve('B', 'YES')).toBe(ANTE + 200 + 300)
    expect(await resolve('C', 'YES')).toBe(ANTE + 300)

    // Was 300, the pool as C found it.
    await unresolve('A')
    expect(contract.subsidyPool).toBe(400)
    expect(await resolve('A', 'NO')).toBe(ANTE + 400)
    await unresolve('B')
    expect(contract.subsidyPool).toBe(300)
    expect(await resolve('B', 'NO')).toBe(ANTE + 200 + 300)
    expect(paid).toBe(3 * ANTE + 1200)
  })

  it('does not restore it for any of several earlier answers', async () => {
    await addAnswer('C', 2)
    await resolve('A', 'NO')
    await resolve('C', 'NO')
    expect(await addSubsidy(1000)).toEqual(['B'])
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
    await addUnrecordedSubsidy(1000)
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
    await addUnrecordedSubsidy(1000)
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
  it('does not undo it from the edit of an earlier resolution of that answer', async () => {
    await addUnrecordedSubsidy(1000)
    expect(await resolve('A', 'YES')).toBe(ANTE + 500)
    expect(await resolve('B', 'NO')).toBe(ANTE + 500)
    await unresolve('B')
    expect(contract.subsidyPool).toBe(500)
    await drizzleInto('B', 300)

    expect(await resolve('B', 'NO')).toBe(ANTE + 300 + 200)
    await loseLatestEdit()
    // Was undone with 500 put back, from the first resolution's edit, seconds
    // old: 300 of it is in B's pool.
    await expectRefused(unresolve('B'))
    expect(contract.subsidyPool).toBe(0)
    expect(contract.isResolved).toBe(true)
  })

  // A resolution made before edits were keyed has only an unkeyed edit,
  // which nothing ties to it.
  it('does not undo a resolution from before edits were keyed', async () => {
    await addUnrecordedSubsidy(1000)
    await resolve('A', 'YES')
    await resolve('B', 'NO')
    await forgetEditKeys()

    // Was undone with 500 put back, from the latest edit on file, whichever
    // resolution's it was.
    await expectRefused(unresolve('B'))
    expect(contract.isResolved).toBe(true)
    expect(contract.subsidyPool).toBe(0)
  })

  // A boost of a market whose answers have all resolved is not taken at all
  // now (addHouseSubsidy), where it went into the pool for the next unresolve.
  it('finds no answer to take a subsidy while the market is resolved', async () => {
    await resolve('A', 'YES')
    await resolve('B', 'NO')
    expect(await addSubsidy(70)).toEqual([])
  })
})

describe('unresolving an answer while the market is still open', () => {
  // It used to get none of it back, and the share stayed out of the pool for
  // good.
  it('puts back the share of the pool its resolution took', async () => {
    await addAnswer('C', 2)
    await addUnrecordedSubsidy(900)
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
    await addUnrecordedSubsidy(900)
    await resolve('A', 'YES')
    await drizzleInto('B', 200)
    expect(contract.subsidyPool).toBe(400)

    await unresolve('A')
    expect(contract.subsidyPool).toBe(700)
  })

  it('does not undo a resolution from before edits were keyed', async () => {
    await addAnswer('C', 2)
    await addUnrecordedSubsidy(900)
    await resolve('A', 'YES')
    await forgetEditKeys()

    await expectRefused(unresolve('A'))
    expect(contract.subsidyPool).toBe(600)
    expect((await answers())[0].resolution).toBe('YES')
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
  it("does not undo it from the edit of another answer's resolution", async () => {
    await addAnswerSubsidy('B', 400)
    expect(await resolve('A', 'NO')).toBe(ANTE)
    await drizzleOwn('B')

    expect(await resolve('B', 'YES')).toBe(ANTE + 400)
    await loseLatestEdit()
    // Was undone with 400 put back, though B's pool holds it.
    await expectRefused(unresolve('B'))
    expect(await pendingOf('B')).toBe(0)
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

  it('does not undo a resolution from before edits were keyed', async () => {
    await addAnswerSubsidy('B', 400)
    await resolve('B', 'YES')
    await forgetEditKeys()

    await expectRefused(unresolve('B'))
    expect(await pendingOf('B')).toBe(0)
  })

  // Resolutions from before edits were keyed, moments apart. A's edit shows B
  // with its subsidy still pending and was recorded just before B resolved.
  // B's own is missing. A's edit used to be taken for B's.
  it("nor from another answer's unkeyed edit, recorded moments before", async () => {
    await addAnswerSubsidy('B', 400)
    expect(await resolve('A', 'NO')).toBe(ANTE)
    await drizzleOwn('B')
    expect(await resolve('B', 'YES')).toBe(ANTE + 400)
    await loseLatestEdit()
    await forgetEditKeys()

    // Was undone with 400 put back, though B's pool holds it.
    await expectRefused(unresolve('B'))
    expect(await pendingOf('B')).toBe(0)
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

describe('cancelling every answer', () => {
  // A subsidy from before provisions recorded their answers, drizzled into
  // the two answers there were, and a third listed afterwards.
  it('returns all of an older subsidy, from the answers that hold it', async () => {
    await addUnrecordedSubsidy(1000)
    await drizzleInto('A', 500)
    await drizzleInto('B', 500)
    await addAnswer('C', 2)

    // Were 100 + 1,000 / 3 each under the limit alone: 966.67 of 1,300.
    expect(await resolve('A', 'CANCEL')).toBe(ANTE + 500)
    expect(await resolve('B', 'CANCEL')).toBe(ANTE + 500)
    expect(await resolve('C', 'CANCEL')).toBe(ANTE)
    expect(paid).toBe(3 * ANTE + 1000)
  })

  it('returns what an answer listed later took of one still pending', async () => {
    await addUnrecordedSubsidy(900)
    await addAnswer('C', 2)
    await drizzleInto('C', 300)

    // A and B share what the pool still holds with it; C holds 300.
    expect(await resolve('C', 'CANCEL')).toBe(ANTE + 300 + 200)
    expect(await resolve('A', 'CANCEL')).toBe(ANTE + 200)
    expect(await resolve('B', 'CANCEL')).toBe(ANTE + 200)
    expect(paid).toBe(3 * ANTE + 900)
  })
})

describe('liquidity added to the whole market, with the answers it went to', () => {
  // The report: a subsidy, a wait for some of it to drizzle, more answers
  // listed, the first answers resolved, the later ones cancelled.
  it('is paid out once when answers listed later are cancelled', async () => {
    expect(await addSubsidy(1000)).toEqual(['A', 'B'])
    expect(await pendingOf('A')).toBe(500)
    await drizzleOwn('A')
    await addAnswer('C', 2)
    await addAnswer('D', 3)

    expect(await resolve('A', 'YES')).toBe(ANTE + 500)
    expect(await resolve('B', 'NO')).toBe(ANTE + 500)
    // Were 100 + 1,000 / 4 each.
    expect(await resolve('C', 'CANCEL')).toBe(ANTE)
    expect(await resolve('D', 'CANCEL')).toBe(ANTE)
    expect(paid).toBe(4 * ANTE + 1000)
  })

  it('reaches an answer whose pending subsidy was never set', async () => {
    await rows(
      `update answers set subsidy_pool = null, total_liquidity = null
      where id = 'A'`
    )
    expect(await addSubsidy(1000)).toEqual(['A', 'B'])
    expect(await pendingOf('A')).toBe(500)
    // Was 100: its share of the subsidy lost.
    expect(await resolve('A', 'YES')).toBe(ANTE + 500)
  })

  it('comes back to the answer that took it when its resolution is undone', async () => {
    await addSubsidy(1000)
    expect(await resolve('A', 'YES')).toBe(ANTE + 500)
    expect(await pendingOf('A')).toBe(0)

    expect(await unresolve('A')).toBe(-(ANTE + 500))
    expect(await pendingOf('A')).toBe(500)
    expect(contract.subsidyPool).toBe(0)

    // A cancellation refunds the share it records for this answer.
    expect(await resolve('A', 'CANCEL')).toBe(ANTE + 500)
    expect(await resolve('B', 'CANCEL')).toBe(ANTE + 500)
    expect(paid).toBe(2 * ANTE + 1000)
  })

  it('made while an answer was resolved neither reaches it nor keeps it from reopening', async () => {
    await resolve('A', 'YES')
    expect(await addSubsidy(1000)).toEqual(['B'])

    expect(await unresolve('A')).toBe(-ANTE)
    expect(await pendingOf('A')).toBe(0)
    expect(await resolve('A', 'CANCEL')).toBe(ANTE)
    expect(await resolve('B', 'CANCEL')).toBe(ANTE + 1000)
    expect(paid).toBe(2 * ANTE + 1000)
  })

  it('is shared with what the pool still held from before, each by its own rule', async () => {
    await addUnrecordedSubsidy(600)
    await addSubsidy(1000)
    await addAnswer('C', 2)

    // A: its ante, its 500, and a third of the pool C now shares.
    expect(await resolve('A', 'YES')).toBe(ANTE + 500 + 200)
    // C holds its ante and half of what the pool has left: none of the
    // provision that records A and B.
    expect(await resolve('C', 'CANCEL')).toBe(ANTE + 200)
    expect(await resolve('B', 'CANCEL')).toBe(ANTE + 500 + 200)
    expect(paid).toBe(3 * ANTE + 1600)
  })
})

// The market's creator and moderators are refused (above). An admin can still
// undo one: its payouts come back, and the pending subsidy it paid out is not
// put back, because nothing says how much that was. What the old rule would
// have restored goes to the log.
describe('a resolution with no record of its own, undone by an admin', () => {
  it("takes back an answer's payouts and puts no pending subsidy back", async () => {
    await addUnrecordedSubsidy(1000)
    expect(await resolve('A', 'YES')).toBe(ANTE + 500)
    await asFromBefore()

    await expectRefused(unresolve('A'))
    expect(await unresolve('A', ADMIN)).toBe(-(ANTE + 500))
    expect((await answers())[0].resolution).toBeUndefined()
    // The 500 its resolution took stays out of the pool.
    expect(contract.subsidyPool).toBe(500)
    expect(jest.mocked(log.warn)).toHaveBeenCalledWith(
      expect.stringContaining('no record of its own'),
      expect.objectContaining({
        answerId: 'A',
        latestEditId: expect.any(Number),
        marketSubsidyInLatestEdit: 1000,
      })
    )
    // Undone once: there is nothing standing to take back again.
    expect(await resolve('A', 'NO')).toBe(ANTE + 250)
  })

  it("reports an answer's own pending subsidy that is not put back", async () => {
    await addAnswerSubsidy('B', 400)
    expect(await resolve('B', 'YES')).toBe(ANTE + 400)
    await asFromBefore()

    expect(await unresolve('B', ADMIN)).toBe(-(ANTE + 400))
    expect(await pendingOf('B')).toBe(0)
    expect(jest.mocked(log.warn)).toHaveBeenCalledWith(
      expect.stringContaining('no record of its own'),
      expect.objectContaining({
        answerSubsidyInLatestEdit: [{ answerId: 'B', subsidyPool: 400 }],
      })
    )
  })

  it('is refused while payouts of more than one batch are standing', async () => {
    expect(await resolve('A', 'YES')).toBe(ANTE)
    await asFromBefore()
    // A payout of an earlier resolution that was never taken back.
    await rows(
      `insert into txns
        (id, amount, category, data, from_id, from_type, to_id, to_type, token)
      values ('stray', 5, 'CONTRACT_RESOLUTION_PAYOUT', $1, 'market',
        'CONTRACT', 'creator', 'USER', 'M$')`,
      [{ data: { answerId: 'A', payoutStartTime: 1 } }]
    )

    await expectRefused(unresolve('A', ADMIN))
    expect((await answers())[0].resolution).toBe('YES')
  })

  // An unresolve by the code before this could take the wrong batch back
  // and leave an earlier resolution's payout standing. A later resolution on
  // a clock that read the same millisecond then shares its time with it.
  it('is refused while a payout built at the same time by another resolution is standing', async () => {
    expect(await resolve('A', 'YES')).toBe(ANTE)
    await asFromBefore()
    const batch = (
      await rows(
        `select data->'data'->>'payoutStartTime' as batch from txns
        where category = 'CONTRACT_RESOLUTION_PAYOUT'`
      )
    )[0].batch as string
    await tick()
    await rows(
      `insert into txns
        (id, amount, category, data, from_id, from_type, to_id, to_type, token)
      values ('earlier', 100, 'CONTRACT_RESOLUTION_PAYOUT', $1, 'market',
        'CONTRACT', 'creator', 'USER', 'M$')`,
      [{ data: { answerId: 'A', payoutStartTime: Number(batch) } }]
    )

    // Was let through, taking 200 back for a resolution that paid 100.
    await expectRefused(unresolve('A', ADMIN))
    expect((await answers())[0].resolution).toBe('YES')
  })

  // An earlier resolution's payout left standing, as above, and a current
  // resolution that paid nothing: the one batch standing is not its own.
  it('is refused where the only payout standing is from before the last unresolve', async () => {
    expect(await resolve('A', 'YES')).toBe(ANTE)
    await asFromBefore()
    expect(await unresolve('A', ADMIN)).toBe(-ANTE)
    // As the code before this could leave it: the payout not marked as taken
    // back after all.
    await rows(
      `insert into txns
        (id, amount, category, data, from_id, from_type, to_id, to_type, token, created_time)
      select 'left-standing', amount, category, data, from_id, from_type, to_id,
        to_type, token, created_time - interval '1 second'
      from txns where category = 'CONTRACT_RESOLUTION_PAYOUT' limit 1`
    )
    await resolve('A', 'YES')
    // The current resolution, as one that paid nothing and kept no record.
    await rows(
      `delete from txns where category = 'CONTRACT_RESOLUTION_PAYOUT'
        and id <> 'left-standing'
        and not exists (
          select 1 from txns u
          where u.category = 'CONTRACT_UNDO_RESOLUTION_PAYOUT'
            and u.data->'data'->>'revertsTxnId' = txns.id)`
    )
    await asFromBefore()

    await expectRefused(unresolve('A', ADMIN))
    expect((await answers())[0].resolution).toBe('YES')
  })

  // A row carries the time its transaction began, not the time it acted. An
  // unresolve by the code before this that began before a resolution, and
  // acted after it, took the previous resolution's payout back a second time
  // and left that resolution's standing, with rows dated before the payout it
  // left. A later resolution that paid nothing then has one batch standing,
  // written after every undo on file, and it is not its own. What gives the
  // history away is the payout taken back twice.
  it('is refused where a payout was taken back twice, though the one standing is dated after every undo', async () => {
    const payoutIds = async () =>
      (
        await rows(
          `select id from txns where category = 'CONTRACT_RESOLUTION_PAYOUT'
          order by created_time, id`
        )
      ).map((r) => r.id as string)

    // The first resolution, taken back.
    expect(await resolve('A', 'YES')).toBe(ANTE)
    await asFromBefore()
    expect(await unresolve('A', ADMIN)).toBe(-ANTE)
    const [first] = await payoutIds()
    // The second, and the unresolve that reopened the answer after it.
    expect(await resolve('A', 'YES')).toBe(ANTE)
    await asFromBefore()
    const [, second, ...others] = await payoutIds()
    expect(others).toHaveLength(0)
    expect(await unresolve('A', ADMIN)).toBe(-ANTE)
    // As the code before this did it: the first resolution's payout taken
    // back again, in a transaction that began before the second paid.
    await rows(
      `update txns
      set data = jsonb_set(data, '{data,revertsTxnId}', to_jsonb($1::text)),
        created_time =
          (select created_time from txns where id = $2) - interval '1 millisecond'
      where category = 'CONTRACT_UNDO_RESOLUTION_PAYOUT'
        and data->'data'->>'revertsTxnId' = $2`,
      [first, second]
    )
    // The current resolution, as one that paid nothing and kept no record.
    await resolve('A', 'YES')
    await rows(
      `delete from txns
      where category = 'CONTRACT_RESOLUTION_PAYOUT' and id not in ($1, $2)`,
      [first, second]
    )
    await asFromBefore()
    // One batch standing, the second resolution's, dated after both undos.
    expect(
      await rows(
        `select p.id,
          p.created_time > (
            select max(created_time) from txns
            where category = 'CONTRACT_UNDO_RESOLUTION_PAYOUT'
          ) as after_every_undo
        from txns p
        where p.category = 'CONTRACT_RESOLUTION_PAYOUT'
          and not exists (
            select 1 from txns u
            where u.category = 'CONTRACT_UNDO_RESOLUTION_PAYOUT'
              and u.data->'data'->>'revertsTxnId' = p.id)`
      )
    ).toEqual([{ id: second, after_every_undo: true }])

    // Was let through, taking the second resolution's 100 back from users who
    // had already paid it back as the first's.
    await expectRefused(unresolve('A', ADMIN))
    expect((await answers())[0].resolution).toBe('YES')
  })

  // The same, with nothing standing: no payout to take back, and still a
  // history to sort out by hand.
  it('is refused where a payout was taken back twice and nothing is standing', async () => {
    expect(await resolve('A', 'YES')).toBe(ANTE)
    await asFromBefore()
    expect(await unresolve('A', ADMIN)).toBe(-ANTE)
    await rows(
      `insert into txns
        (id, amount, category, data, from_id, from_type, to_id, to_type, token)
      select 'again', amount, category, data, from_id, from_type, to_id,
        to_type, token
      from txns where category = 'CONTRACT_UNDO_RESOLUTION_PAYOUT' limit 1`
    )
    // The current resolution, as one that paid nothing and kept no record.
    await resolve('A', 'YES')
    await rows(
      `delete from txns where category = 'CONTRACT_RESOLUTION_PAYOUT'
        and not exists (
          select 1 from txns u
          where u.category = 'CONTRACT_UNDO_RESOLUTION_PAYOUT'
            and u.data->'data'->>'revertsTxnId' = txns.id)`
    )
    await asFromBefore()

    await expectRefused(unresolve('A', ADMIN))
    expect((await answers())[0].resolution).toBe('YES')
  })

  // Another answer's payout taken back twice says nothing about this one.
  it("is not refused for a payout of another answer's taken back twice", async () => {
    expect(await resolve('B', 'YES')).toBe(ANTE)
    await asFromBefore()
    expect(await unresolve('B', ADMIN)).toBe(-ANTE)
    await rows(
      `insert into txns
        (id, amount, category, data, from_id, from_type, to_id, to_type, token)
      select 'again', amount, category, data, from_id, from_type, to_id,
        to_type, token
      from txns where category = 'CONTRACT_UNDO_RESOLUTION_PAYOUT' limit 1`
    )
    expect(await resolve('A', 'YES')).toBe(ANTE)
    await asFromBefore()

    expect(await unresolve('A', ADMIN)).toBe(-ANTE)
    // The other answer's history is still one to sort out by hand.
    expect(await resolve('B', 'YES')).toBe(ANTE)
    await asFromBefore()
    await expectRefused(unresolve('B', ADMIN))
  })

  it('is refused where the standing payouts say nothing of when they were built', async () => {
    expect(await resolve('A', 'YES')).toBe(ANTE)
    await asFromBefore()
    await rows(`update txns set data = data #- '{data,payoutStartTime}'`)

    await expectRefused(unresolve('A', ADMIN))
  })

  it('logs what was not put back once, after an attempt that was rolled back', async () => {
    await addUnrecordedSubsidy(1000)
    expect(await resolve('A', 'YES')).toBe(ANTE + 500)
    await asFromBefore()
    jest.mocked(log.warn).mockClear()
    jest.mocked(bulkUpdateContractMetrics).mockImplementationOnce(async () => {
      throw Object.assign(new Error('deadlock detected'), { code: '40P01' })
    })

    expect(await unresolve('A', ADMIN)).toBe(-(ANTE + 500))
    const logged = jest
      .mocked(log.warn)
      .mock.calls.filter(([message]) =>
        String(message).includes('no record of its own')
      )
    expect(logged).toHaveLength(1)
  })

  it('logs nothing when the unresolve does not go through', async () => {
    expect(await resolve('A', 'YES')).toBe(ANTE)
    await asFromBefore()
    jest.mocked(log.warn).mockClear()
    jest.mocked(bulkUpdateContractMetrics).mockImplementation(async () => {
      throw Object.assign(new Error('deadlock detected'), { code: '40P01' })
    })

    const before = paid
    await expect(unresolve('A', ADMIN)).rejects.toMatchObject({
      code: '40P01',
    })
    jest.mocked(bulkUpdateContractMetrics).mockReset()
    expect(paid).toBe(before)
    expect((await answers())[0].resolution).toBe('YES')
    expect(
      jest
        .mocked(log.warn)
        .mock.calls.filter(([message]) =>
          String(message).includes('no record of its own')
        )
    ).toHaveLength(0)
  })

  it('is refused where the payouts carry a resolution and its record is gone', async () => {
    expect(await resolve('A', 'YES')).toBe(ANTE)
    await forgetEditKeys()

    await expectRefused(unresolve('A', ADMIN))
  })

  it('goes by the record where there is one', async () => {
    await addUnrecordedSubsidy(1000)
    expect(await resolve('A', 'YES')).toBe(ANTE + 500)

    expect(await unresolve('A', ADMIN)).toBe(-(ANTE + 500))
    expect(contract.subsidyPool).toBe(1000)
    expect(jest.mocked(log.warn)).not.toHaveBeenCalledWith(
      expect.stringContaining('no record of its own'),
      expect.anything()
    )
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
    await addUnrecordedSubsidy(1000)
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

  // A resolution by code that doesn't stamp its payouts, in the same
  // millisecond as an earlier one whose edit is still on file under the key
  // (undone by code that doesn't give it another): the edit found is the
  // earlier resolution's, and the payouts standing are not.
  it('is refused while a payout that is not its own is standing', async () => {
    expect(await resolve('A', 'YES')).toBe(ANTE)
    await rows(`update txns set data = data #- '{data,resolutionTime}'`)

    await expectRefused(unresolve('A'))
    expect((await answers())[0].resolution).toBe('YES')
  })
})

describe('one edit for one resolution', () => {
  const keys = async () =>
    (
      await rows(
        `select idempotency_key from contract_edits
        where idempotency_key is not null order by id`
      )
    ).map((r) => r.idempotency_key as string)

  it('gives the edit an unresolve used another key', async () => {
    await resolve('A', 'YES')
    expect(await keys()).toEqual([expect.stringMatching(/^resolution:A:\d+$/)])
    await unresolve('A')
    expect(await keys()).toEqual([
      expect.stringMatching(/^undone:\d+:resolution:A:\d+$/),
    ])
  })

  // The second resolution finds less pending subsidy than the first did.
  // Their edits had the same key, and the first was taken for the second's.
  it('undoes a later resolution in the same millisecond from its own edit', async () => {
    const time = Date.now() + 1000
    await addUnrecordedSubsidy(1000)
    expect(await resolveAt('A', 'YES', time)).toBe(ANTE + 500)
    expect(await unresolve('A')).toBe(-(ANTE + 500))
    await drizzleInto('A', 250)
    await drizzleInto('B', 250)
    expect(contract.subsidyPool).toBe(500)

    expect(await resolveAt('A', 'YES', time)).toBe(ANTE + 250 + 250)
    expect(await unresolve('A')).toBe(-(ANTE + 250 + 250))
    // Was 750: 500 from the first resolution's edit.
    expect(contract.subsidyPool).toBe(500)

    expect(await resolve('A', 'NO')).toBe(ANTE + 250 + 250)
    expect(await resolve('B', 'NO')).toBe(ANTE + 250 + 250)
    expect(paid).toBe(2 * ANTE + 1000)
  })

  // The earlier resolution's edit still holds the key: it was undone by code
  // that doesn't give it another.
  it('refuses a resolution whose key another edit holds, before paying anything', async () => {
    const time = Date.now() + 1000
    await resolveAt('A', 'YES', time)
    await unresolve('A')
    await rows(
      `update contract_edits set idempotency_key = $1
      where idempotency_key like 'undone:%'`,
      [`resolution:A:${time}`]
    )

    const before = paid
    await expect(resolveAt('A', 'YES', time)).rejects.toMatchObject({
      code: 409,
    })
    expect(paid).toBe(before)
    expect((await answers())[0].resolution).toBeUndefined()
    // A moment later it goes through.
    expect(await resolve('A', 'YES')).toBe(ANTE)
  })
})

describe('unresolving while another process is at the same market', () => {
  it("writes the market's row even with nothing to put back", async () => {
    await resolve('A', 'YES')
    jest.mocked(updateContract).mockClear()
    await unresolve('A')
    expect(jest.mocked(updateContract).mock.calls).toEqual([
      [
        expect.anything(),
        'market',
        { lastUpdatedTime: expect.any(Number) },
        { broadcast: false },
      ],
    ])
  })

  // Stopped after it has taken the payouts back, reopened the market and
  // recorded that: all of it is undone, done once more, and told to open
  // pages once.
  it('leaves nothing of an attempt that is stopped part of the way through', async () => {
    await resolve('A', 'YES')
    await resolve('B', 'NO')
    expect(contract.isResolved).toBe(true)
    jest.mocked(updateContract).mockClear()
    jest.mocked(broadcastUpdatedContract).mockClear()
    jest.mocked(bulkUpdateContractMetrics).mockImplementationOnce(async () => {
      throw Object.assign(new Error('deadlock detected'), { code: '40P01' })
    })

    expect(await unresolve('B')).toBe(-ANTE)
    expect(contract.isResolved).toBe(false)
    expect(
      await rows(
        `select id from txns where category = 'CONTRACT_UNDO_RESOLUTION_PAYOUT'`
      )
    ).toHaveLength(1)
    // The edit unresolving records of the market it reopened.
    expect(
      await rows(`select id from contract_edits where idempotency_key is null`)
    ).toHaveLength(1)
    const updates = jest.mocked(updateContract).mock.calls
    expect(updates).toHaveLength(2)
    for (const update of updates)
      expect(update[3]).toEqual({ broadcast: false })
    expect(jest.mocked(broadcastUpdatedContract)).toHaveBeenCalledTimes(1)
  })

  it('tries again when it is the one stopped to break a deadlock', async () => {
    await resolve('A', 'YES')
    const tx = jest.spyOn(client, 'tx')
    tx.mockImplementationOnce(async () => {
      throw Object.assign(new Error('deadlock detected'), { code: '40P01' })
    })
    expect(await unresolve('A')).toBe(-ANTE)
    expect(tx).toHaveBeenCalledTimes(2)
    tx.mockRestore()
  })

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

  it('does not undo it from the edit of an earlier resolution', async () => {
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
    // Was undone with 300 put back, from the first resolution's edit, though
    // the pool holds it.
    await expectRefused(unresolve())
    expect(contract.isResolved).toBe(true)
    expect(contract.subsidyPool).toBe(0)
  })

  it('does not undo a resolution from before edits were keyed', async () => {
    await resolveMarket('YES')
    await forgetEditKeys()

    // Was undone with 300 put back, from the latest edit on file.
    await expectRefused(unresolve())
    expect(contract.isResolved).toBe(true)
    expect(contract.subsidyPool).toBe(0)
  })

  // The message is what a page gets: it merges it into the market it holds,
  // so a field the message leaves out stays as it was, "Resolved YES" and all.
  it('tells open pages that the resolution is gone, once it has committed', async () => {
    await resolveMarket('YES')
    jest.mocked(broadcastUpdatedContract).mockClear()
    await unresolve()

    const messages = jest.mocked(broadcastUpdatedContract).mock.calls
    expect(messages).toHaveLength(1)
    expect(JSON.parse(JSON.stringify(messages[0][1]))).toMatchObject({
      id: 'market',
      isResolved: false,
      resolution: null,
      resolutionTime: null,
      subsidyPool: 300,
    })
  })

  it('is undone by an admin with no record of the resolution, without its pending subsidy', async () => {
    expect(await resolveMarket('YES')).toBe(400)
    await asFromBefore()

    await expectRefused(unresolve())
    expect(await unresolve(undefined, ADMIN)).toBe(-400)
    expect(contract.isResolved).toBe(false)
    // Was put back as 300, from the latest edit on file.
    expect(contract.subsidyPool).toBe(0)
    expect(jest.mocked(log.warn)).toHaveBeenCalledWith(
      expect.stringContaining('no record of its own'),
      expect.objectContaining({ marketSubsidyInLatestEdit: 300 })
    )
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

  it('does not undo it from the edit of an earlier resolution', async () => {
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
    // Was undone with 100 and 50 each put back, from the first resolution's
    // edit, though the pools hold them.
    await expectRefused(unresolve())
    expect(contract.isResolved).toBe(true)
    expect(contract.subsidyPool).toBe(0)
    expect(await pendingOf('A')).toBe(0)
    expect(await pendingOf('B')).toBe(0)
  })

  it('does not undo a resolution from before edits were keyed', async () => {
    await resolveMarket('A')
    await forgetEditKeys()

    await expectRefused(unresolve())
    expect(contract.isResolved).toBe(true)
    expect(contract.subsidyPool).toBe(0)
    expect(await pendingOf('A')).toBe(0)
    expect(await pendingOf('B')).toBe(0)
  })
})
