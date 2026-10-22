import { PGlite } from '@electric-sql/pglite'
import { OracleProviderError } from '../oracle-provider'
import { OraclePoint } from 'common/perps/oracle'
import { MINUTE_MS } from 'common/util/time'
import { insertOraclePrices } from '../oracle'
import { getOracleFeed } from '../oracle-feeds'
import { SupabaseDirectClient } from '../supabase/init'
import { log } from '../utils'
import { applyOraclePointToLivePerps } from './apply-oracle-point'
import { publishPerpQuote } from './publish-perp-quote'
import { FAST_TICK_ORACLE_BOUNDS } from './oracle-tick-bounds'
import {
  publishOracleObservation,
  applyOracleFeedUnavailability,
  reportOracleObservationFailure,
  reportOracleObservationSuccess,
  reportOracleTickFailure,
} from './publish-oracle-observation'

jest.mock('../oracle', () => ({
  ...jest.requireActual('../oracle'),
  insertOraclePrices: jest.fn(),
}))
jest.mock('./apply-oracle-point', () => ({
  applyOraclePointToLivePerps: jest.fn(),
}))
jest.mock('./publish-perp-quote', () => ({ publishPerpQuote: jest.fn() }))
jest.mock('../utils', () => ({
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
}))
const now = 1_800_000_000_000
const feed = getOracleFeed('mnx-anthropic-mark')!
const point = { ts: now, sourceTs: now - 1000, price: 2104 }
const health = {
  checkedAt: now,
  status: 'available' as const,
  expiresAt: now + MINUTE_MS,
}
const database = (previous?: OraclePoint, hasPending = false) => {
  const one = jest.fn(async (_sql: string) => ({}))
  const tx = {
    one,
    none: jest.fn(),
    oneOrNone: jest.fn(async (sql: string) =>
      sql.includes('from perp_orders')
        ? hasPending
          ? { id: 'order' }
          : null
        : previous
        ? {
            ts: new Date(previous.ts).toISOString(),
            price: previous.price,
            source_ts:
              previous.sourceTs && new Date(previous.sourceTs).toISOString(),
          }
        : null
    ),
  }
  const pg = {
    tx: jest.fn(async (_options, run) => run(tx)),
    manyOrNone: jest.fn(async () => []),
  }
  return { pg: pg as unknown as SupabaseDirectClient, tx }
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, 'now').mockReturnValue(now)
})

// The stamp is unchanged in both cases. Only a first copy that arrived stamped
// ahead of its own receipt (ineligible then) can still advance a waiting order.
it.each([
  ['re-persists a mark first received stamped ahead', now - 2000, true],
  ['skips a re-received mark orders already saw', now - 500, false],
])(
  'while a market order is waiting, %s',
  async (_name, previousTs, persisted) => {
    const db = new PGlite()
    try {
      await db.exec(`
      create table contracts(id text, data jsonb);
      create table perp_orders(id text, contract_id text, status text);
      create table oracle_prices(feed_id text, ts timestamptz, price numeric, source_ts timestamptz);
      insert into perp_orders values('order','market','pending');
    `)
      await db.query('insert into contracts values($1,$2)', [
        'market',
        { oracleFeedId: feed.id },
      ])
      await db.query('insert into oracle_prices values($1,$2,$3,$4)', [
        feed.id,
        new Date(previousTs),
        point.price,
        new Date(point.sourceTs),
      ])
      const tx = {
        one: jest.fn(async () => ({})),
        oneOrNone: async (sql: string, values: unknown[]) =>
          (await db.query(sql, values)).rows[0] ?? null,
      }
      const pg = {
        tx: async (
          _options: unknown,
          run: (t: typeof tx) => Promise<unknown>
        ) => run(tx),
      } as unknown as SupabaseDirectClient
      await publishOracleObservation(pg, feed, { point, health })
      if (persisted)
        expect(insertOraclePrices).toHaveBeenCalledWith(tx, feed.id, [point])
      else expect(insertOraclePrices).not.toHaveBeenCalled()
    } finally {
      await db.close()
    }
  }
)
afterEach(() => jest.restoreAllMocks())

it('publishes before applying, and hands health to the same engine transition', async () => {
  const { pg, tx } = database()
  await publishOracleObservation(
    pg,
    feed,
    { point, health },
    FAST_TICK_ORACLE_BOUNDS
  )
  expect(tx.one.mock.calls[0][0]).toContain('oracle-publish:')
  expect(insertOraclePrices).toHaveBeenCalledWith(tx, feed.id, [point])
  expect(applyOraclePointToLivePerps).toHaveBeenCalledWith(
    pg,
    feed.id,
    point,
    FAST_TICK_ORACLE_BOUNDS,
    health
  )
  expect(
    jest.mocked(insertOraclePrices).mock.invocationCallOrder[0]
  ).toBeLessThan(
    jest.mocked(applyOraclePointToLivePerps).mock.invocationCallOrder[0]
  )
  expect(publishPerpQuote).not.toHaveBeenCalled() // engine owns the atomic quote
})

it('refreshes health at a flat price and writes the normal heartbeat when due', async () => {
  const previous = { ...point, ts: now - 2000 }
  const { pg } = database(previous)
  await publishOracleObservation(pg, feed, { point, health })
  expect(insertOraclePrices).not.toHaveBeenCalled()
  expect(applyOraclePointToLivePerps).toHaveBeenCalledWith(
    pg,
    feed.id,
    previous,
    undefined,
    health
  )
  const older = database({ ...point, ts: now - 3 * MINUTE_MS })
  await publishOracleObservation(older.pg, feed, { point, health })
  expect(insertOraclePrices).toHaveBeenCalledTimes(1)
})

it.each([
  ['same-source conflict', { ...point, price: 2105 }],
  ['same-observation conflict', { ...point, price: 2105, ts: now + 1 }],
])('never publishes a %s over immutable history', async (_name, previous) => {
  const incoming =
    _name === 'same-observation conflict' ? { ...point, ts: now + 1 } : point
  const { pg } = database({
    ...previous,
    ts: _name === 'same-observation conflict' ? now + 1 : now - 1000,
  })
  await publishOracleObservation(pg, feed, { point: incoming, health })
  expect(insertOraclePrices).not.toHaveBeenCalled()
  expect(applyOraclePointToLivePerps).not.toHaveBeenCalled()
})

// A provider served from load-balanced nodes hands back observations that lag
// each other, so a poll can retrieve a stamp older than one already published.
// That is "nothing new", not an incident: keep the published point, keep the
// feed available, and do not spend the failure budget that pages at five
// minutes. Only an identical stamp carrying a DIFFERENT price is corruption.
it('carries the published point forward when a lagging node serves an older stamp', async () => {
  const published = { ...point, sourceTs: point.sourceTs + 60_000 }
  const { pg } = database({ ...published, ts: now - 1000 })
  await publishOracleObservation(pg, feed, { point, health })
  expect(insertOraclePrices).not.toHaveBeenCalled()
  expect(applyOraclePointToLivePerps).toHaveBeenCalledWith(
    pg,
    feed.id,
    expect.objectContaining({ sourceTs: published.sourceTs }),
    undefined,
    health
  )
  expect(log.error).not.toHaveBeenCalled()
  expect(log.warn).not.toHaveBeenCalled()
})

it('refuses a malformed point through the shared registry bounds', async () => {
  const { pg } = database()
  await publishOracleObservation(pg, feed, {
    point: { ...point, price: 210400 },
    health,
  })
  expect(insertOraclePrices).not.toHaveBeenCalled()
  expect(applyOraclePointToLivePerps).not.toHaveBeenCalled()
})

it('unavailability changes health without inserting or applying a price', async () => {
  const { pg } = database()
  await publishOracleObservation(pg, feed, {
    point,
    health: { checkedAt: now, status: 'unavailable', reason: 'Frozen' },
  })
  expect(insertOraclePrices).not.toHaveBeenCalled()
  expect(applyOraclePointToLivePerps).not.toHaveBeenCalled()
})

it('isolates a contended contract and publishes a frozen flag for the next contract', async () => {
  const tx = {
    none: jest.fn(),
    one: jest.fn(async (sql: string) =>
      sql.startsWith('select data')
        ? {
            data: {
              id: 'b',
              oracleFeedId: feed.id,
              oraclePrice: 2104,
              oraclePriceTime: now - 2000,
              poolLong: 25000,
              poolShort: 25000,
            },
          }
        : {}
    ),
  }
  const pg = {
    manyOrNone: jest.fn(async () => [{ id: 'a' }, { id: 'b' }]),
    tx: jest
      .fn()
      .mockRejectedValueOnce({ code: '55P03' })
      .mockImplementationOnce(async (_options, run) => run(tx)),
  }
  await applyOracleFeedUnavailability(
    pg as unknown as SupabaseDirectClient,
    feed.id,
    { checkedAt: now, status: 'unavailable', reason: 'Frozen' },
    FAST_TICK_ORACLE_BOUNDS
  )
  expect(log.warn).toHaveBeenCalledTimes(1)
  expect(log.error).not.toHaveBeenCalled()
  expect(publishPerpQuote).toHaveBeenCalledTimes(1)
  expect(jest.mocked(publishPerpQuote).mock.calls[0][0]).toMatchObject({
    contractId: 'b',
    oraclePrice: 2104,
    oracleFeedHealth: { status: 'unavailable' },
  })
})

it('pages only at five minutes and preserves the hourly budget', () => {
  const id = 'threshold-test'
  for (let elapsed = 0; elapsed < 5 * MINUTE_MS; elapsed += 2000)
    reportOracleObservationFailure(id, `error ${elapsed}`, now + elapsed)
  expect(log.error).not.toHaveBeenCalled()
  expect(log.warn).toHaveBeenCalledTimes(5)
  reportOracleObservationFailure(id, 'error', now + 5 * MINUTE_MS)
  expect(log.error).toHaveBeenCalledTimes(1)
  for (
    let elapsed = 5 * MINUTE_MS + 2000;
    elapsed < 65 * MINUTE_MS;
    elapsed += 2000
  )
    reportOracleObservationFailure(id, 'error', now + elapsed)
  expect(log.error).toHaveBeenCalledTimes(1)
  reportOracleObservationFailure(id, 'error', now + 65 * MINUTE_MS)
  expect(log.error).toHaveBeenCalledTimes(2)
})
it('does not reset warning or paging budgets on flapping successes', () => {
  for (let elapsed = 0; elapsed <= 10 * MINUTE_MS; elapsed += 4000) {
    reportOracleObservationFailure('flapping-test', 'Frozen', now + elapsed)
    reportOracleObservationSuccess('flapping-test', now + elapsed + 2000)
  }
  expect(log.error).toHaveBeenCalledTimes(1)
  expect(log.warn).toHaveBeenCalledTimes(10)
  reportOracleObservationSuccess('flapping-test', now + 16 * MINUTE_MS)
  reportOracleObservationFailure(
    'flapping-test',
    'New outage',
    now + 16 * MINUTE_MS
  )
  expect(log.error).toHaveBeenCalledTimes(1)
})
it.each(['55P03', '57014', '40001'])(
  'classifies bounded %s without seeding a provider incident',
  (code) => {
    const id = `timeout-${code}`
    for (let elapsed = 0; elapsed < 6 * MINUTE_MS; elapsed += MINUTE_MS) {
      jest.spyOn(Date, 'now').mockReturnValue(now + elapsed)
      reportOracleTickFailure(id, { code }, FAST_TICK_ORACLE_BOUNDS)
    }
    expect(log.error).not.toHaveBeenCalled()
    reportOracleObservationFailure(
      id,
      'first provider failure',
      now + 6 * MINUTE_MS
    )
    expect(log.error).not.toHaveBeenCalled()
    reportOracleTickFailure(id, { code })
    expect(log.error).toHaveBeenCalledTimes(1)
  }
)
it('reports database/code faults immediately and throttles only provider errors', () => {
  reportOracleTickFailure(
    'faults-test',
    new Error('database disconnected'),
    FAST_TICK_ORACLE_BOUNDS
  )
  expect(log.error).toHaveBeenCalledTimes(1)
  reportOracleTickFailure(
    'faults-test',
    new OracleProviderError('HTTP 503'),
    FAST_TICK_ORACLE_BOUNDS
  )
  expect(log.error).toHaveBeenCalledTimes(1)
  expect(log.warn).toHaveBeenCalledTimes(1)
})
it('accepts exact duplicate delivery and preserves the immutable row', async () => {
  const { pg } = database(point)
  await publishOracleObservation(pg, feed, { point, health })
  expect(insertOraclePrices).not.toHaveBeenCalled()
  expect(applyOraclePointToLivePerps).toHaveBeenCalledWith(
    pg,
    feed.id,
    point,
    undefined,
    health
  )
})
it('rejects a same-observation source timestamp conflict independently', async () => {
  const { pg } = database({ ...point, sourceTs: point.sourceTs - 1 })
  expect(await publishOracleObservation(pg, feed, { point, health })).toBe(
    false
  )
  expect(insertOraclePrices).not.toHaveBeenCalled()
  expect(applyOraclePointToLivePerps).not.toHaveBeenCalled()
})
it('does not lock, rewrite or push a repeated unavailable check within the heartbeat', async () => {
  const frozen = {
    checkedAt: now - 2000,
    status: 'unavailable' as const,
    reason: 'Frozen',
  }
  const pg = {
    manyOrNone: jest.fn(async () => [{ id: 'frozen', health: frozen }]),
    tx: jest.fn(),
  }
  await applyOracleFeedUnavailability(
    pg as unknown as SupabaseDirectClient,
    feed.id,
    { ...frozen, checkedAt: now },
    FAST_TICK_ORACLE_BOUNDS
  )
  expect(pg.tx).not.toHaveBeenCalled()
  expect(publishPerpQuote).not.toHaveBeenCalled()
})
