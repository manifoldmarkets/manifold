import * as crypto from 'crypto'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { runInNewContext } from 'vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { getPerpBackingPool } from 'common/perps/amm'
import {
  calcPerpTakerFee,
  getPerpEffectiveTakerFeeBps,
  formatPerpFeeCents,
  perpMaxFeeFor,
  perpOpenFeeQuote,
} from 'common/perps/fees'
import {
  isEligiblePerpTick,
  MNX_SOURCE_CLOCK_ALLOWANCE_MS,
  perpEligibilityCutoff,
  PerpOrderResult,
} from 'common/perps/orders'

class TestAPIError extends Error {
  constructor(public code: number, message: string) {
    super(message)
  }
}
type Query = { rows: Record<string, unknown>[] }
type CashTransfer = {
  fromType: string
  toType: string
  fromId: string
  toId: string
  amount: number
  category: string
}
type Executor = (tx: unknown, order: { id: string }) => Promise<PerpOrderResult>
type QueuedOrder = {
  id: string
  createdTime: number
  reservedMana: number
  status: string
  request: object
}
type OrderModule = {
  enqueuePerpOrder: (
    contract: string,
    user: string,
    request: object,
    key: string,
    api: boolean,
    expectedOpenedTime?: number,
    expectedSize?: number
  ) => Promise<{ order: QueuedOrder; created: boolean }>
  settlePendingPerpOrders: (
    tx: unknown,
    contract: object,
    point: object | null,
    execute: Executor,
    options?: { limit?: number; skip?: ReadonlySet<string> }
  ) => Promise<{ deferred: string[]; remaining: number }>
  readPerpOrder: (
    contract: string,
    user: string,
    id?: string
  ) => Promise<unknown>
}

const filled = (): PerpOrderResult => ({
  kind: 'close',
  payout: 100,
  pnl: 0,
  fraction: 1,
  remainingSize: 0,
})
let db: PGlite
let orders: OrderModule
let adapter: object
let modules: Record<string, unknown>
// Every statement the code under test sends, and one-shot hooks around them
// that stand in for another connection committing at that moment.
let sqlLog: string[]
let beforeQuery: ((sql: string) => Promise<void>) | undefined
let afterQuery: ((sql: string) => Promise<void>) | undefined
const contract = {
  id: 'market',
  mechanism: 'perp',
  token: 'MANA',
  oracleFeedId: 'btc-usd',
  oraclePrice: 100,
  poolLong: 5000,
  poolShort: 5000,
  maxLeverage: 10,
  maxOraclePriceAgeMs: 300_000,
}

const transaction = async <T>(fn: () => Promise<T>): Promise<T> => {
  await db.exec('begin')
  try {
    const value = await fn()
    await db.exec('commit')
    return value
  } catch (error) {
    await db.exec('rollback')
    throw error
  }
}
const balance = async () =>
  Number(
    (
      await db.query<{ balance: number }>(
        "select balance from users where id='alice'"
      )
    ).rows[0].balance
  )

beforeEach(async () => {
  // Production parses numeric (OID 1700) with parseFloat (supabase/init.ts).
  db = new PGlite({ parsers: { 1700: (value: string) => parseFloat(value) } })
  await db.exec(`
    create role anon; create role authenticated;
    create table users(id text primary key,balance numeric not null,data jsonb);
    create table contracts(id text primary key,data jsonb,token text);
    create table contract_perp_positions(contract_id text,user_id text,direction text,size numeric,opened_time timestamptz);
    create table user_bans(user_id text,ended_at timestamptz,end_time timestamptz);
    create table system_trading_status(token text,status boolean);
    create table oracle_prices(feed_id text,ts timestamptz,price numeric,source_ts timestamptz);
    create table contract_perp_events(id text,contract_id text,user_id text,event_type text,data jsonb);
    create table cash_transfers(category text,amount numeric);
    create table txns(category text,amount numeric,from_type text,from_id text,to_type text,to_id text,token text);
    insert into txns values('CREATE_CONTRACT_ANTE',10000,'BANK','BANK','CONTRACT','market','M$');
    insert into users values('alice',1000,null),('bob',1000,null);
    insert into system_trading_status values('MANA',true);
  `)
  await db.query('insert into contracts values($1,$2,$3)', [
    'market',
    contract,
    'MANA',
  ])
  await db.exec(
    readFileSync(
      resolve(
        __dirname,
        '../../../supabase/migrations/2026102001_perp_pending_orders.sql'
      ),
      'utf8'
    )
  )
  sqlLog = []
  beforeQuery = undefined
  afterQuery = undefined
  const query = async (sql: string, values?: unknown[]): Promise<Query> => {
    sqlLog.push(sql)
    if (sql.includes('advisory')) return { rows: [{ lock: null }] }
    await beforeQuery?.(sql)
    const result = await db.query<Record<string, unknown>>(sql, values)
    await afterQuery?.(sql)
    return result
  }
  adapter = {
    one: async (sql: string, values?: unknown[]) => {
      const r = await query(sql, values)
      if (r.rows.length !== 1) throw new Error('Expected one row: ' + sql)
      return r.rows[0]
    },
    oneOrNone: async (sql: string, values?: unknown[]) => {
      const r = await query(sql, values)
      return r.rows[0] ?? null
    },
    any: async (sql: string, values?: unknown[]) =>
      (await query(sql, values)).rows,
    manyOrNone: async (sql: string, values?: unknown[]) =>
      (await query(sql, values)).rows,
    none: async (sql: string, values?: unknown[]) => {
      await query(sql, values)
    },
    multi: async (sql: string) => db.exec(sql),
  }
  modules = {
    crypto,
    'common/api/utils': { APIError: TestAPIError },
    'common/envs/constants': {
      BANNED_TRADING_USER_IDS: [],
      PERPS_SKIP_ORACLE_FRESHNESS: true,
    },
    'common/perps/oracle': {},
    'common/perps/orders': {
      isEligiblePerpTick,
      MNX_SOURCE_CLOCK_ALLOWANCE_MS,
      perpEligibilityCutoff,
    },
    'common/perps/fees':
      jest.requireActual<Record<string, unknown>>('common/perps/fees'),
    'common/perps/amm':
      jest.requireActual<Record<string, unknown>>('common/perps/amm'),
    lodash: jest.requireActual('lodash'),
    'shared/utils': {
      log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
    },
    'common/ban-utils': { isUserBanned: () => false },
    'shared/supabase/init': { createSupabaseDirectClient: () => adapter },
    'shared/transact-with-retries': {
      runTransactionWithRetries: (fn: (tx: object) => Promise<unknown>) =>
        transaction(() => fn(adapter)),
    },
    'shared/txn/run-txn': {
      runTxnOutsideBetQueue: async (_tx: unknown, t: CashTransfer) => {
        if (t.fromType === 'USER') {
          // Exact numeric debit with run-txn's balance check.
          const { rows } = await db.query<{ balance: string }>(
            'update users set balance=balance-$2 where id=$1 returning balance::text',
            [t.fromId, t.amount]
          )
          if (rows[0].balance.startsWith('-'))
            throw new TestAPIError(403, 'Insufficient balance')
        }
        if (t.toType === 'USER')
          await db.query('update users set balance=balance+$2 where id=$1', [
            t.toId,
            t.amount,
          ])
        await db.query('insert into cash_transfers values($1,$2)', [
          t.category,
          t.amount,
        ])
        await db.query('insert into txns values($1,$2,$3,$4,$5,$6,$7)', [
          t.category,
          t.amount,
          t.fromType,
          t.fromId,
          t.toType,
          t.toId,
          'M$',
        ])
      },
    },
    './queries': {
      advisoryLockQuery: () => 'select advisory',
      rowToPosition: (r: Record<string, unknown>) => ({
        direction: r.direction,
        size: Number(r.size),
        openedTime:
          r.opened_time instanceof Date
            ? r.opened_time.getTime()
            : new Date(String(r.opened_time)).getTime(),
      }),
    },
    './user-contract-metrics': {
      buildPerpUserContractMetricsQuery: async () => 'select 1',
    },
  }
  const compiled = transpileModule(
    readFileSync(resolve(__dirname, 'orders.ts'), 'utf8'),
    {
      compilerOptions: {
        module: ModuleKind.CommonJS,
        target: ScriptTarget.ES2017,
      },
    }
  ).outputText
  const exports: Record<string, unknown> = {}
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (!(name in modules)) throw new Error('Unexpected import ' + name)
      return modules[name]
    },
    Date,
    Map,
    Number,
    JSON,
    Error,
  })
  orders = exports as unknown as OrderModule
})
afterEach(async () => {
  await db.close()
})

const submit = async (key = 'abcdefghij', maxFee = 1) =>
  (
    await orders.enqueuePerpOrder(
      'market',
      'alice',
      { kind: 'trade', direction: 'long', mana: 100, leverage: 3, maxFee },
      key,
      false
    )
  ).order
const holdLong = async (size = 100) => {
  const opened = Date.now() - 10000
  await db.query('insert into contract_perp_positions values($1,$2,$3,$4,$5)', [
    'market',
    'alice',
    'long',
    size,
    new Date(opened),
  ])
  return opened
}
const status = async () =>
  (await db.query<{ status: string }>('select status from perp_orders')).rows[0]
    .status
const settle = (
  point: object | null,
  execute: Executor = async () => filled()
) =>
  transaction(() =>
    orders.settlePendingPerpOrders(adapter, contract, point, execute)
  )

it('reserves money outside backing and deduplicates request retries', async () => {
  const first = await submit()
  expect(await balance()).toBe(899)
  expect((await submit()).id).toBe(first.id)
  expect(await balance()).toBe(899)
  expect(
    (await db.query('select * from contract_perp_positions')).rows
  ).toHaveLength(0)
  expect(
    (await db.query<{ data: typeof contract }>('select data from contracts'))
      .rows[0].data.poolLong
  ).toBe(5000)
  await expect(submit('klmnopqrst')).rejects.toThrow(/already have an order/)
})
it('waits for the next observation and executes only once', async () => {
  const o = await submit()
  const execute = jest.fn(async () => filled())
  await settle({ ts: o.createdTime, price: 100 }, execute)
  expect(execute).not.toHaveBeenCalled()
  await settle({ ts: o.createdTime + 10, price: 101 }, execute)
  await settle({ ts: o.createdTime + 20, price: 102 }, execute)
  expect(execute).toHaveBeenCalledTimes(1)
  expect(await balance()).toBe(1000)
  expect(
    (await db.query<{ status: string }>('select status from perp_orders'))
      .rows[0].status
  ).toBe('filled')
})
it('rolls back a failed voluntary transition before refunding exactly once', async () => {
  const o = await submit()
  await settle({ ts: o.createdTime + 10, price: 101 }, async () => {
    await db.query("update users set balance=balance-10 where id='alice'")
    throw new TestAPIError(400, 'Fee changed')
  })
  expect(await balance()).toBe(1000)
  expect(
    (await db.query<{ status: string }>('select status from perp_orders'))
      .rows[0].status
  ).toBe('rejected')
  await settle({ ts: o.createdTime + 20, price: 102 })
  expect(await balance()).toBe(1000)
})
it('rejects and refunds an order whose execution faults, without failing the tick', async () => {
  const o = await submit()
  await expect(
    settle({ ts: o.createdTime + 10, price: 101 }, async () => {
      throw new Error('long solvency factor must be finite or +Infinity')
    })
  ).resolves.toEqual({ deferred: [], remaining: 0 })
  expect(await balance()).toBe(1000)
  expect(await status()).toBe('rejected')
})
it('keeps a contended order pending to fill at the same price', async () => {
  const o = await submit()
  const point = { ts: o.createdTime + 10, price: 101 }
  await expect(
    settle(point, async () => {
      throw Object.assign(new Error('could not serialize access'), {
        code: '40001',
      })
    })
  ).resolves.toEqual({ deferred: [o.id], remaining: 0 })
  expect(await balance()).toBe(899)
  expect(await status()).toBe('pending')
  const execute = jest.fn(async () => filled())
  await settle(point, execute)
  expect(execute).toHaveBeenCalledTimes(1)
  expect(await status()).toBe('filled')
})
it('skips an exhausted contended order so the orders behind it settle', async () => {
  const o = await submit()
  const { order: bob } = await orders.enqueuePerpOrder(
    'market',
    'bob',
    { kind: 'trade', direction: 'long', mana: 100, leverage: 3, maxFee: 1 },
    'bobsorder1',
    false
  )
  const execute = jest.fn(async () => filled())
  await expect(
    transaction(() =>
      orders.settlePendingPerpOrders(
        adapter,
        contract,
        { ts: Date.now() + 10, price: 101 },
        execute,
        { limit: 1, skip: new Set([o.id]) }
      )
    )
  ).resolves.toEqual({ deferred: [], remaining: 0 })
  expect(execute).toHaveBeenCalledTimes(1)
  const rows = (
    await db.query<{ id: string; status: string }>(
      'select id,status from perp_orders order by id'
    )
  ).rows
  expect(rows.find((r) => r.id === bob.id)?.status).toBe('filled')
  expect(rows.find((r) => r.id === o.id)?.status).toBe('pending')
})
it('settles at most the limit per transaction and reports the rest', async () => {
  const o = await submit()
  await orders.enqueuePerpOrder(
    'market',
    'bob',
    { kind: 'trade', direction: 'long', mana: 100, leverage: 3, maxFee: 1 },
    'bobsorder1',
    false
  )
  const point = { ts: Date.now() + 10, price: 101 }
  const execute = jest.fn(async () => filled())
  await expect(
    transaction(() =>
      orders.settlePendingPerpOrders(adapter, contract, point, execute, {
        limit: 1,
      })
    )
  ).resolves.toEqual({ deferred: [], remaining: 1 })
  expect(execute).toHaveBeenCalledTimes(1)
  await settle(point, execute)
  expect(execute).toHaveBeenCalledTimes(2)
  expect(o.createdTime).toBeLessThan(point.ts)
})
it('expires and refunds without any oracle observation', async () => {
  await submit()
  await db.query(
    "update perp_orders set expires_time=now()-interval '1 minute'"
  )
  await settle(null)
  expect(await balance()).toBe(1000)
  expect(
    (await db.query<{ status: string }>('select status from perp_orders'))
      .rows[0].status
  ).toBe('expired')
})
it('rejects a missed first update instead of repricing the order later', async () => {
  const o = await submit()
  const execute = jest.fn(async () => filled())
  await db.query('insert into oracle_prices values($1,$2,$3,null)', [
    'btc-usd',
    new Date(o.createdTime + 5),
    100,
  ])
  await settle({ ts: o.createdTime + 10, price: 101 }, execute)
  expect(execute).not.toHaveBeenCalled()
  expect(await balance()).toBe(1000)
  expect(
    (await db.query<{ error: string }>('select error from perp_orders')).rows[0]
      .error
  ).toMatch(/window was missed/)
})
it("never exposes another account's order", async () => {
  const o = await submit()
  expect(await orders.readPerpOrder('market', 'bob', o.id)).toBeNull()
})
const mnxMarket = { ...contract, oracleFeedId: 'mnx-h100-mark' }
const insertMnxRow = (ts: number, sourceTs: number) =>
  db.query('insert into oracle_prices values($1,$2,$3,$4)', [
    'mnx-h100-mark',
    new Date(ts),
    100,
    new Date(sourceTs),
  ])
const settleMnx = (point: object, execute: Executor) =>
  transaction(() =>
    orders.settlePendingPerpOrders(adapter, mnxMarket, point, execute)
  )
const A = MNX_SOURCE_CLOCK_ALLOWANCE_MS

it('does not count a future-stamped MNX row it skipped as a missed window', async () => {
  const o = await submit()
  const c = o.createdTime
  await insertMnxRow(c + 5, c + A + 8)
  const execute = jest.fn(async () => filled())
  // First received stamped ahead of its own receipt: not eligible yet.
  await settleMnx({ ts: c + 5, sourceTs: c + A + 8, price: 100 }, execute)
  expect(execute).not.toHaveBeenCalled()
  // The re-received copy is eligible and fills; the skipped row is not missed.
  await settleMnx({ ts: c + A + 10, sourceTs: c + A + 8, price: 100 }, execute)
  expect(execute).toHaveBeenCalledTimes(1)
  expect(await status()).toBe('filled')
})
it("waits for an MNX mark stamped past MNX's clock lead, and does not count one inside it as missed", async () => {
  const o = await submit()
  const c = o.createdTime
  // Stamped after the order by MNX's clock, but within the allowed lead.
  await insertMnxRow(c + 100, c + 50)
  const execute = jest.fn(async () => filled())
  await settleMnx({ ts: c + 100, sourceTs: c + 50, price: 100 }, execute)
  expect(execute).not.toHaveBeenCalled()
  await settleMnx({ ts: c + A + 500, sourceTs: c + A + 1, price: 100 }, execute)
  expect(execute).toHaveBeenCalledTimes(1)
  expect(await status()).toBe('filled')
})
it('rejects an MNX order whose first mark past the allowance was missed', async () => {
  const o = await submit()
  const c = o.createdTime
  await insertMnxRow(c + A + 2, c + A + 1)
  const execute = jest.fn(async () => filled())
  await settleMnx({ ts: c + A + 10, sourceTs: c + A + 5, price: 100 }, execute)
  expect(execute).not.toHaveBeenCalled()
  expect(await status()).toBe('rejected')
})
const queueFor = async (user: string) => {
  await db.query(
    'insert into users values($1,1000,null) on conflict do nothing',
    [user]
  )
  return (
    await orders.enqueuePerpOrder(
      'market',
      user,
      { kind: 'trade', direction: 'long', mana: 100, leverage: 3, maxFee: 1 },
      `${user}order01`,
      false
    )
  ).order
}
it('locks only the orders one settlement pass acts on', async () => {
  for (const user of ['alice', 'bob', 'carol', 'dave']) await queueFor(user)
  const execute = jest.fn(async () => filled())
  const locked = await transaction(async () => {
    await orders.settlePendingPerpOrders(
      adapter,
      contract,
      { ts: Date.now() + 10, price: 101 },
      execute,
      { limit: 1 }
    )
    // A row this transaction locked carries its xid in xmax.
    return (
      await db.query<{ locked: boolean }>(
        "select xmax <> '0'::xid as locked from perp_orders where status='pending'"
      )
    ).rows.map((r) => r.locked)
  })
  expect(execute).toHaveBeenCalledTimes(1)
  // Three wait; only the one read to learn that more remain is locked.
  expect(locked.sort()).toEqual([false, false, true])
})
it('does not let orders waiting for a later price take the batch', async () => {
  const opened = await holdLong()
  const { order: close } = await orders.enqueuePerpOrder(
    'market',
    'alice',
    { kind: 'close', direction: 'long', fraction: 1 },
    'closekey01',
    false,
    opened
  )
  const bob = await queueFor('bob')
  const point = { ts: bob.createdTime + 10, price: 101 }
  // Closes settle first, but this one arrived after the point.
  await db.query('update perp_orders set created_time=$2 where id=$1', [
    close.id,
    new Date(point.ts + 1_000),
  ])
  const execute = jest.fn(async () => filled())
  await transaction(() =>
    orders.settlePendingPerpOrders(adapter, contract, point, execute, {
      limit: 1,
    })
  )
  expect(execute).toHaveBeenCalledTimes(1)
  const rows = (
    await db.query<{ id: string; status: string }>(
      'select id,status from perp_orders'
    )
  ).rows
  expect(rows.find((r) => r.id === bob.id)?.status).toBe('filled')
  expect(rows.find((r) => r.id === close.id)?.status).toBe('pending')
})
it('treats a retry with a recomputed maxFee as the same order', async () => {
  const first = await submit('abcdefghij', 1)
  await expect(
    orders.enqueuePerpOrder(
      'market',
      'alice',
      { kind: 'trade', direction: 'long', mana: 100, leverage: 3, maxFee: 2 },
      'abcdefghij',
      false
    )
  ).resolves.toEqual({
    order: expect.objectContaining({ id: first.id }),
    created: false,
  })
  expect(await balance()).toBe(899)
})
it('gives a defaulted fee allowance the slippage room the web client sends', async () => {
  const { order } = await orders.enqueuePerpOrder(
    'market',
    'alice',
    { kind: 'trade', direction: 'long', mana: 100, leverage: 3 },
    'abcdefghij',
    false
  )
  const flat = calcPerpTakerFee(300, getPerpEffectiveTakerFeeBps({}, false))
  const maxFee = (order.request as { maxFee: number }).maxFee
  expect(maxFee).toBe(perpMaxFeeFor(flat, 300))
  expect(maxFee).toBeGreaterThan(flat)
})
it('lets holders close after the close time and while self-blocked', async () => {
  const opened = await holdLong()
  await db.query('update contracts set data = data || $1::jsonb', [
    {
      closeTime: Date.now() - 1000,
      creatorBannedFromBetting: true,
      creatorId: 'alice',
    },
  ])
  await expect(submit()).rejects.toThrow(/unavailable/)
  // A full close ignores a stale expectedSize, as the immediate engine did.
  const { order } = await orders.enqueuePerpOrder(
    'market',
    'alice',
    { kind: 'close', direction: 'long', fraction: 1 },
    'closekey01',
    false,
    opened,
    123
  )
  expect(order.status).toBe('pending')
})
it('queues a close alongside a waiting add, but only one close', async () => {
  const opened = await holdLong()
  await submit()
  const close = (key: string) =>
    orders.enqueuePerpOrder(
      'market',
      'alice',
      { kind: 'close', direction: 'long', fraction: 1 },
      key,
      false,
      opened
    )
  await expect(close('closekey01')).resolves.toMatchObject({ created: true })
  await expect(close('closekey02')).rejects.toThrow(/close waiting/)
})
it('reserves a payout-funded flip without overdrawing an exact balance', async () => {
  await holdLong()
  await db.query(
    "update users set balance='856.84285714285713996' where id='alice'"
  )
  const { order } = await orders.enqueuePerpOrder(
    'market',
    'alice',
    { kind: 'trade', direction: 'short', mana: 1000, leverage: 1, maxFee: 1 },
    'abcdefghij',
    false
  )
  expect(order.reservedMana).toBeGreaterThan(856.8428571428)
  const left = (
    await db.query<{ b: string }>(
      "select balance::text as b from users where id='alice'"
    )
  ).rows[0].b
  expect(left.startsWith('-')).toBe(false)
})
it('accepts a payout-funded flip from zero cash but not from a negative balance', async () => {
  await holdLong()
  const flip = (key: string) =>
    orders.enqueuePerpOrder(
      'market',
      'alice',
      { kind: 'trade', direction: 'short', mana: 100, leverage: 2, maxFee: 1 },
      key,
      false
    )
  await db.query("update users set balance=0 where id='alice'")
  await expect(flip('abcdefghij')).resolves.toMatchObject({
    order: { reservedMana: 0 },
  })
  await db.query("delete from perp_orders where user_id='alice'")
  // Below zero the fill would turn on deposits made after the price is public.
  await db.query("update users set balance=-20 where id='alice'")
  await expect(flip('klmnopqrst')).rejects.toThrow(/Insufficient balance/)
})
it('refuses a fee allowance below the configured fee, which could never fill', async () => {
  await expect(submit('abcdefghij', 0)).rejects.toThrow(/maxFee must cover/)
})
it('submits without the market lock or a contract row lock', async () => {
  sqlLog.length = 0
  await submit()
  // Submissions to one market run side by side and never queue the tick.
  expect(sqlLog.some((sql) => sql.includes('advisory'))).toBe(false)
  expect(sqlLog.some((sql) => /from contracts[^;]*for update/.test(sql))).toBe(
    false
  )
  expect(sqlLog).toContain(
    'select balance,data from users where id=$1 for update'
  )
})
it('answers an order that committed while the submission waited for the user row', async () => {
  beforeQuery = async (sql) => {
    if (!sql.includes('from users where id=$1 for update')) return
    beforeQuery = undefined
    await db.query(
      `insert into perp_orders(id,contract_id,user_id,idempotency_key,fingerprint,request,is_api,reserved_mana,expires_time)
      values('raced','market','alice','racedkey01','{}','{"kind":"trade"}',false,0,now()+interval '10 minutes')`
    )
  }
  await expect(submit()).rejects.toThrow(/already have an order waiting/)
  expect(await balance()).toBe(1000)
})
it('refuses at submission an allowance below the size fee at the current pools', async () => {
  await db.query('update contracts set data = data || $1::jsonb', [
    { takerFeeBps: 10, takerFeeImpact: 10 },
  ])
  const flat = calcPerpTakerFee(300, 10)
  const quote = perpOpenFeeQuote({
    grossPoolDepth: getPerpBackingPool(5000, 5000),
    existingSize: 0,
    existingCostBasis: 0,
    existingPositionValue: 0,
    existingTakerFeeCostBasis: 0,
    addedNotional: 300,
    baseBps: 10,
    impact: 10,
  }).fee
  expect(quote).toBeGreaterThan(flat)
  // It used to be accepted, earn the submission's rewards, and then be
  // refused at execution.
  await expect(submit('abcdefghij', flat)).rejects.toThrow(
    `maxFee must be at least M$${formatPerpFeeCents(quote, 'up')}`
  )
  expect(await balance()).toBe(1000)
  await expect(submit('klmnopqrst', quote)).resolves.toMatchObject({
    status: 'pending',
  })
})
it('records the price that rejected an order', async () => {
  const o = await submit()
  const point = { ts: o.createdTime + 10, price: 101 }
  await settle(point, async () => {
    throw new TestAPIError(400, 'Fee changed')
  })
  expect(
    (
      await db.query<{ status: string; execution_point: unknown }>(
        'select status,execution_point from perp_orders'
      )
    ).rows[0]
  ).toEqual({ status: 'rejected', execution_point: point })
})
it('recovers a waiting trade after a newer close completes first', async () => {
  const opened = await holdLong()
  const trade = await submit()
  const { order: close } = await orders.enqueuePerpOrder(
    'market',
    'alice',
    { kind: 'close', direction: 'long', fraction: 1 },
    'closekey01',
    false,
    opened
  )
  // Closes settle first: this pass completes the close and leaves the add.
  await transaction(() =>
    orders.settlePendingPerpOrders(
      adapter,
      contract,
      { ts: Date.now() + 10, price: 101 },
      async () => filled(),
      { limit: 1 }
    )
  )
  expect(await orders.readPerpOrder('market', 'alice')).toMatchObject({
    id: trade.id,
    status: 'pending',
  })
  expect(await orders.readPerpOrder('market', 'alice', close.id)).toMatchObject(
    { status: 'filled' }
  )
})

it('rejects a flip after liquidation without opening its replacement', async () => {
  const opened = Date.now() - 10000
  await db.query('insert into contract_perp_positions values($1,$2,$3,$4,$5)', [
    'market',
    'alice',
    'long',
    100,
    new Date(opened),
  ])
  const { order: o } = await orders.enqueuePerpOrder(
    'market',
    'alice',
    { kind: 'trade', direction: 'short', mana: 100, leverage: 2, maxFee: 1 },
    'abcdefghij',
    false
  )
  await db.query('delete from contract_perp_positions where user_id=$1', [
    'alice',
  ])
  const execute = jest.fn(async () => filled())
  await settle({ ts: o.createdTime + 10, price: 101 }, execute)
  expect(execute).not.toHaveBeenCalled()
  expect(await balance()).toBe(1000)
  expect(
    (await db.query<{ error: string }>('select error from perp_orders')).rows[0]
      .error
  ).toMatch(/liquidated/)
})
it('rolls back BOTH voluntary legs when a flip cannot fund the replacement', async () => {
  const opened = Date.now() - 10000
  await db.query('insert into contract_perp_positions values($1,$2,$3,$4,$5)', [
    'market',
    'alice',
    'long',
    100,
    new Date(opened),
  ])
  await db.query("update users set balance=0 where id='alice'")
  const { order: o } = await orders.enqueuePerpOrder(
    'market',
    'alice',
    { kind: 'trade', direction: 'short', mana: 100, leverage: 2, maxFee: 1 },
    'abcdefghij',
    false
  )
  expect(o.reservedMana).toBe(0)
  await settle({ ts: o.createdTime + 10, price: 101 }, async () => {
    await db.query("delete from contract_perp_positions where user_id='alice'")
    await db.query("update users set balance=50 where id='alice'")
    throw new TestAPIError(403, 'Insufficient closing payout')
  })
  expect(await balance()).toBe(0)
  expect(
    (
      await db.query(
        "select * from contract_perp_positions where user_id='alice'"
      )
    ).rows
  ).toHaveLength(1)
})
it('keeps a fractional close bound through automatic size changes', async () => {
  const opened = Date.now() - 10000
  await db.query('insert into contract_perp_positions values($1,$2,$3,$4,$5)', [
    'market',
    'alice',
    'long',
    100,
    new Date(opened),
  ])
  const { order: o } = await orders.enqueuePerpOrder(
    'market',
    'alice',
    { kind: 'close', direction: 'long', fraction: 0.5 },
    'abcdefghij',
    false
  )
  await db.query(
    "update contract_perp_positions set size=50 where user_id='alice'"
  )
  const execute = jest.fn(async () => ({
    kind: 'close' as const,
    payout: 25,
    pnl: 0,
    fraction: 0.5,
    remainingSize: 25,
  }))
  await settle({ ts: o.createdTime + 10, price: 101 }, execute)
  expect(execute).toHaveBeenCalledTimes(1)
  expect(
    (await db.query<{ status: string }>('select status from perp_orders'))
      .rows[0].status
  ).toBe('filled')
})
it('expires orders atomically when the market resolves', async () => {
  await submit()
  await transaction(() =>
    orders.settlePendingPerpOrders(
      adapter,
      { ...contract, isResolved: true },
      null,
      async () => {
        throw new Error('Resolution cannot open a position')
      }
    )
  )
  expect(await balance()).toBe(1000)
  expect(
    (await db.query<{ status: string }>('select status from perp_orders'))
      .rows[0].status
  ).toBe('expired')
})

type Engine = {
  openOrAddPosition: (
    contractId: string,
    userId: string,
    direction: string,
    mana: number,
    leverage: number,
    key: string,
    isApi: boolean,
    maxFee: number
  ) => Promise<{ order: { createdTime: number; id: string } }>
  closePosition: (
    contractId: string,
    userId: string,
    direction: string,
    key: string,
    openedTime: number,
    isApi: boolean,
    fraction: number,
    size: number
  ) => Promise<{ order: { createdTime: number; id: string } }>
  runOracleUpdate: (
    contractId: string,
    price: number,
    ts: number
  ) => Promise<unknown>
}
// The real engine on the test database. Reuse the production query builders,
// settlement math and escrow assertions; only external transaction/broadcast
// infrastructure is replaced by PGlite.
const loadEngine = async (): Promise<Engine> => {
  await db.exec(`
    update contracts set data=data || '{"takerFeeBps":0,"takerFeeImpact":0}'::jsonb;
    alter table contract_perp_positions add primary key(contract_id,user_id,direction);
    alter table contract_perp_positions
      add column cost_basis numeric,
      add column original_cost_basis numeric,
      add column taker_fee_cost_basis numeric,
      add column entry_price numeric,
      add column leverage numeric,
      add column liquidation_price numeric,
      add column updated_time timestamptz;
    alter table contract_perp_events drop column id;
    alter table contract_perp_events
      add column id bigint generated always as identity primary key,
      add column ts timestamptz,
      add column applied_ts timestamptz default clock_timestamp(),
      add column oracle_price numeric,
      add column size_delta numeric,
      add column cost_basis_delta numeric,
      add column original_cost_basis_delta numeric,
      add column direction text,
      add column leverage numeric;
  `)
  const exports: Record<string, unknown> = {}
  const engineModules: Record<string, unknown> = {
    ...modules,
    'common/perps/oracle': jest.requireActual<Record<string, unknown>>(
      'common/perps/oracle'
    ),
    'common/perps/fees':
      jest.requireActual<Record<string, unknown>>('common/perps/fees'),
    './queries': jest.requireActual<Record<string, unknown>>('./queries'),
    './orders': orders,
    'shared/utils': {
      log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
    },
  }
  runInNewContext(
    transpileModule(readFileSync(resolve(__dirname, 'engine.ts'), 'utf8'), {
      compilerOptions: {
        module: ModuleKind.CommonJS,
        target: ScriptTarget.ES2017,
      },
    }).outputText,
    {
      exports,
      require: (name: string) =>
        name in engineModules
          ? engineModules[name]
          : jest.requireActual<Record<string, unknown>>(name),
      Date,
      Map,
      Set,
      Number,
      JSON,
      Error,
    }
  )
  return exports as unknown as Engine
}

it('runs real engine opens, adds, flips and closes only at the next price', async () => {
  const engine = await loadEngine()
  const position = async () =>
    (
      await db.query<{
        size: number | string
        entry_price: number | string
        opened_time: Date
        direction: string
      }>('select * from contract_perp_positions')
    ).rows[0]
  const fillOrder = async (
    order: { id: string; createdTime: number },
    price: number
  ) => {
    await engine.runOracleUpdate('market', price, order.createdTime + 10)
    const row = (
      await db.query<{ status: string; error: string | null }>(
        'select status,error from perp_orders where id=$1',
        [order.id]
      )
    ).rows[0]
    expect(row).toEqual({ status: 'filled', error: null })
  }
  const { order: open } = await engine.openOrAddPosition(
    'market',
    'alice',
    'long',
    100,
    2,
    'engineopen',
    false,
    0
  )
  expect(await position()).toBeUndefined()
  await fillOrder(open, 110)
  expect(Number((await position()).entry_price)).toBe(110)
  expect(await balance()).toBe(900)
  const { order: add } = await engine.openOrAddPosition(
    'market',
    'alice',
    'long',
    50,
    2,
    'engineadds',
    false,
    0
  )
  await fillOrder(add, 120)
  expect(Number((await position()).size)).toBe(300)
  const { order: flip } = await engine.openOrAddPosition(
    'market',
    'alice',
    'short',
    150,
    2,
    'engineflip',
    false,
    0
  )
  expect((await position()).direction).toBe('long')
  await fillOrder(flip, 115)
  expect((await position()).direction).toBe('short')
  const longProfit = 115 * (200 / 110 + 100 / 120) - 300
  expect(await balance()).toBeCloseTo(850 + longProfit, 8)
  let p = await position()
  const { order: partial } = await engine.closePosition(
    'market',
    'alice',
    'short',
    'enginepart',
    p.opened_time.getTime(),
    false,
    0.5,
    Number(p.size)
  )
  await fillOrder(partial, 105)
  expect(Number((await position()).size)).toBe(150)
  p = await position()
  const { order: close } = await engine.closePosition(
    'market',
    'alice',
    'short',
    'engineexit',
    p.opened_time.getTime(),
    false,
    1,
    Number(p.size)
  )
  await fillOrder(close, 110)
  expect(await position()).toBeUndefined()
  const shortProfit = (150 * (115 - 105)) / 115 + (150 * (115 - 110)) / 115
  expect(await balance()).toBeCloseTo(1000 + longProfit + shortProfit, 8)
  expect(
    (
      await db.query<{ oracle_price: number | string }>(
        'select oracle_price from contract_perp_events order by id'
      )
    ).rows.map((r) => Number(r.oracle_price))
  ).toEqual([110, 120, 115, 115, 105, 110])
})

const statuses = async () =>
  Object.fromEntries(
    (
      await db.query<{ status: string; n: number }>(
        'select status,count(*)::int as n from perp_orders group by status'
      )
    ).rows.map((r) => [r.status, r.n])
  )
const executionPoints = async () =>
  (
    await db.query<{ execution_point: { ts: number; price: number } }>(
      'select execution_point from perp_orders'
    )
  ).rows.map((r) => r.execution_point)

it('fills a backlog left at the mark before a newer point moves it (N3)', async () => {
  const engine = await loadEngine()
  const placed: { createdTime: number }[] = []
  for (let i = 0; i < 11; i++) {
    await db.query('insert into users values($1,1000,null)', [`trader${i}`])
    placed.push(
      (
        await engine.openOrAddPosition(
          'market',
          `trader${i}`,
          'long',
          10,
          2,
          `n3order${String(i).padStart(3, '0')}`,
          false,
          0
        )
      ).order
    )
  }
  const t1 = Math.max(...placed.map((o) => o.createdTime)) + 10
  // P1's own transaction settled the first ten; before its follow-up ran, a
  // newer point arrived (a second scheduler, a failed or abandoned pass).
  await db.query('update contracts set data = data || $1::jsonb', [
    { oraclePrice: 100, oraclePriceTime: t1 },
  ])
  await db.query('insert into oracle_prices values($1,$2,$3,null)', [
    'btc-usd',
    new Date(t1),
    100,
  ])
  await transaction(() =>
    orders.settlePendingPerpOrders(
      adapter,
      { ...contract, oraclePriceTime: t1 },
      { ts: t1, price: 100 },
      async () => filled(),
      { limit: 10 }
    )
  )
  expect(await statuses()).toEqual({ filled: 10, pending: 1 })
  await engine.runOracleUpdate('market', 105, t1 + 2000)
  // The eleventh fills at P1 instead of being rejected as having missed it.
  expect(await statuses()).toEqual({ filled: 11 })
  expect((await executionPoints()).every((p) => p.ts === t1)).toBe(true)
})
it('applies a persisted point the mark skipped before a newer one (N3)', async () => {
  const engine = await loadEngine()
  await db.query('update contracts set data = data || $1::jsonb', [
    { oraclePrice: 100, oraclePriceTime: Date.now() - 1000 },
  ])
  const { order } = await engine.openOrAddPosition(
    'market',
    'alice',
    'long',
    100,
    2,
    'skipopen01',
    false,
    0
  )
  const t1 = order.createdTime + 10
  // Persisted by one scheduler and never applied: another scheduler applied a
  // newer point first.
  await db.query('insert into oracle_prices values($1,$2,$3,null)', [
    'btc-usd',
    new Date(t1),
    104,
  ])
  await engine.runOracleUpdate('market', 108, t1 + 500)
  expect(await statuses()).toEqual({ filled: 1 })
  expect(await executionPoints()).toEqual([{ ts: t1, price: 104 }])
  expect(
    Number(
      (
        await db.query<{ entry_price: number }>(
          'select entry_price from contract_perp_positions'
        )
      ).rows[0].entry_price
    )
  ).toBe(104)
  expect(
    (
      await db.query<{ data: { oraclePriceTime: number } }>(
        'select data from contracts'
      )
    ).rows[0].data.oraclePriceTime
  ).toBe(t1 + 500)
})
it('fills at a tick an order that committed after that tick read the queue', async () => {
  const engine = await loadEngine()
  const { order: first } = await engine.openOrAddPosition(
    'market',
    'alice',
    'long',
    100,
    2,
    'lateopen01',
    false,
    0
  )
  const t1 = first.createdTime + 10
  // bob's order was stamped before the point, but its transaction commits
  // only after the tick's settlement has read the queue.
  afterQuery = async (sql) => {
    if (!sql.includes('limit $5::bigint for update')) return
    afterQuery = undefined
    await db.query("update users set balance=balance-100 where id='bob'")
    await db.query(
      `insert into perp_orders(id,contract_id,user_id,idempotency_key,fingerprint,request,is_api,reserved_mana,created_time,expires_time)
      values('lateorder','market','bob','latekey001','{}',$1,false,100,$2,now()+interval '10 minutes')`,
      [
        { kind: 'trade', direction: 'long', mana: 100, leverage: 2, maxFee: 0 },
        new Date(t1 - 5),
      ]
    )
  }
  await engine.runOracleUpdate('market', 103, t1)
  expect(await statuses()).toEqual({ filled: 2 })
  expect((await executionPoints()).every((p) => p.ts === t1)).toBe(true)
})
