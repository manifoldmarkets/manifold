import * as crypto from 'crypto'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { runInNewContext } from 'vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import {
  calcPerpTakerFee,
  getPerpEffectiveTakerFeeBps,
} from 'common/perps/fees'
import { isEligiblePerpTick, PerpOrderResult } from 'common/perps/orders'

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
type OrderModule = {
  enqueuePerpOrder: (
    contract: string,
    user: string,
    request: object,
    key: string,
    api: boolean
  ) => Promise<{ id: string; createdTime: number; reservedMana: number }>
  settlePendingPerpOrders: (
    tx: unknown,
    contract: object,
    point: object | null,
    execute: Executor
  ) => Promise<void>
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
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create table users(id text primary key,balance double precision not null,data jsonb);
    create table contracts(id text primary key,data jsonb,token text);
    create table contract_perp_positions(contract_id text,user_id text,direction text,size numeric,opened_time timestamptz);
    create table user_bans(user_id text,ended_at timestamptz,end_time timestamptz);
    create table system_trading_status(token text,status boolean);
    create table oracle_prices(feed_id text,ts timestamptz,price numeric,source_ts timestamptz);
    create table contract_perp_events(id text,contract_id text,user_id text,data jsonb);
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
  const query = async (sql: string, values?: unknown[]): Promise<Query> => {
    if (sql.includes('advisory')) return { rows: [{ lock: null }] }
    return db.query(sql, values)
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
    'common/perps/orders': { isEligiblePerpTick },
    'common/perps/fees': { calcPerpTakerFee, getPerpEffectiveTakerFeeBps },
    'common/ban-utils': { isUserBanned: () => false },
    'shared/supabase/init': { createSupabaseDirectClient: () => adapter },
    'shared/transact-with-retries': {
      runTransactionWithRetries: (fn: (tx: object) => Promise<unknown>) =>
        transaction(() => fn(adapter)),
    },
    'shared/txn/run-txn': {
      runTxnOutsideBetQueue: async (_tx: unknown, t: CashTransfer) => {
        if (t.fromType === 'USER')
          await db.query('update users set balance=balance-$2 where id=$1', [
            t.fromId,
            t.amount,
          ])
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

const submit = (key = 'abcdefghij') =>
  orders.enqueuePerpOrder(
    'market',
    'alice',
    { kind: 'trade', direction: 'long', mana: 100, leverage: 3, maxFee: 1 },
    key,
    false
  )
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
it('retries database faults without committing a refund or rejection', async () => {
  const o = await submit()
  await expect(
    settle({ ts: o.createdTime + 10, price: 101 }, async () => {
      throw new Error('Database disconnected')
    })
  ).rejects.toThrow('Database disconnected')
  expect(await balance()).toBe(899)
  expect(
    (await db.query<{ status: string }>('select status from perp_orders'))
      .rows[0].status
  ).toBe('pending')
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

it('rejects a flip after liquidation without opening its replacement', async () => {
  const opened = Date.now() - 10000
  await db.query('insert into contract_perp_positions values($1,$2,$3,$4,$5)', [
    'market',
    'alice',
    'long',
    100,
    new Date(opened),
  ])
  const o = await orders.enqueuePerpOrder(
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
  const o = await orders.enqueuePerpOrder(
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
  const o = await orders.enqueuePerpOrder(
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

it('runs real engine opens, adds, flips and closes only at the next price', async () => {
  // Reuse the production query builders, settlement math and escrow assertions.
  // Only external transaction/broadcast infrastructure is replaced by PGlite.
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
      add column event_type text,
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
  const engine = exports as unknown as {
    openOrAddPosition: (
      contractId: string,
      userId: string,
      direction: string,
      mana: number,
      leverage: number,
      key: string,
      isApi: boolean,
      maxFee: number
    ) => Promise<{ createdTime: number; id: string }>
    closePosition: (
      contractId: string,
      userId: string,
      direction: string,
      key: string,
      openedTime: number,
      isApi: boolean,
      fraction: number,
      size: number
    ) => Promise<{ createdTime: number; id: string }>
    runOracleUpdate: (
      contractId: string,
      price: number,
      ts: number
    ) => Promise<unknown>
  }
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
  const open = await engine.openOrAddPosition(
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
  const add = await engine.openOrAddPosition(
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
  const flip = await engine.openOrAddPosition(
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
  const partial = await engine.closePosition(
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
  const close = await engine.closePosition(
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
