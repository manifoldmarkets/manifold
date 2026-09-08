import { MNX_INSTRUMENTS } from 'common/perps/mnx'
import { MINUTE_MS } from 'common/util/time'
import { MnxSnapshot, parseMnxSnapshot } from '../mnx'
import { SupabaseDirectClient } from '../supabase/init'
import { collectMnxSnapshot, requireMnxReady } from './publish-mnx'

// Isolate logging/engine transport: these tests exercise collection and durable
// publication, never open sockets or use credentials.
jest.mock('../utils', () => ({ log: { error: jest.fn() } }))
jest.mock('./apply-oracle-point', () => ({
  applyOraclePointToLivePerps: jest.fn(),
}))
jest.mock('./publish-perp-quote', () => ({ publishPerpQuote: jest.fn() }))

const now = 1_800_000_000_000
const payload = () =>
  MNX_INSTRUMENTS.map((i, index) => ({
    market_id: index + 1,
    symbol: i.symbol,
    slug: i.slug,
    type: i.type,
    price_display: i.priceDisplay,
    mark_price: 100,
    mark_price_e18_raw: '100000000000000000000',
    oracle_price: 99,
    oracle_price_e18_raw: '99000000000000000000',
    mark_price_timestamp: new Date(now).toISOString(),
    oracle_frozen: false,
    trading_enabled: true,
    initial_margin_ratio_e18_raw: '333333333333333333',
  }))

const database = (
  options: {
    locked?: boolean
    due?: boolean
    snapshot?: MnxSnapshot
    conflicting?: boolean
  } = {}
) => {
  const one = jest.fn(async (sql: string) => {
    if (sql.includes('pg_try_advisory'))
      return { locked: options.locked ?? true }
    return {
      due: options.due ?? true,
      failures: 0,
      snapshot: options.snapshot ?? null,
    }
  })
  const oneOrNone = jest.fn(async () =>
    options.conflicting
      ? {
          ts: new Date(now).toISOString(),
          price: 101,
          source_data: { kind: 'live' },
        }
      : null
  )
  const none = jest.fn(async (_sql: string, _args?: unknown[]) => {})
  const tx = { one, oneOrNone, none }
  const pg = {
    tx: (run: (context: typeof tx) => Promise<unknown>) => run(tx),
  } as unknown as SupabaseDirectClient
  return { pg, none }
}

afterEach(() => jest.restoreAllMocks())

it('fetches once for 16 instruments and publishes the snapshot in the same transaction', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(now + 10_000)
  const db = database()
  const fetcher = jest.fn(async () => payload())
  const snapshot = await collectMnxSnapshot(db.pg, fetcher)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(
    Object.values(snapshot!.feeds).filter(
      (f) => f.health.status === 'available'
    )
  ).toHaveLength(16)
  expect(
    db.none.mock.calls.filter(([sql]) => sql.includes('insert into'))
  ).toHaveLength(16)
  const commit = db.none.mock.calls.find(([sql]) =>
    sql.includes('set snapshot')
  )
  expect(commit?.[1]?.[0]).toEqual(snapshot)
  expect(commit?.[1]?.[1]).toBe(new Date(now + MINUTE_MS).toISOString())
})

it.each([{ locked: false }, { due: false }])(
  'skips competing workers and persisted retry windows: %j',
  async (options) => {
    const db = database(options)
    const fetcher = jest.fn(async () => payload())
    expect(await collectMnxSnapshot(db.pg, fetcher)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
    expect(db.none).not.toHaveBeenCalled()
  }
)

it('retains last successful snapshot and records backoff on HTTP/parse failure', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(now)
  const previous = parseMnxSnapshot(payload(), now)
  const db = database({ snapshot: previous })
  expect(await collectMnxSnapshot(db.pg, async () => ({ data: [] }))).toBeNull()
  expect(db.none).toHaveBeenCalledTimes(1)
  expect(db.none.mock.calls[0][0]).toContain('set failures')
  expect(previous.fetchedAt).toBe(now)
})

it('does not apply or silently replace a conflicting immutable observation', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(now)
  const db = database({ conflicting: true })
  const snapshot = await collectMnxSnapshot(db.pg, async () => payload())
  expect(
    Object.values(snapshot!.feeds).every(
      (f) => f.health.status === 'unavailable'
    )
  ).toBe(true)
  expect(db.none.mock.calls.some(([sql]) => sql.includes('insert into'))).toBe(
    false
  )
})

it('requires live provenance, fresh checks and available data for creation', () => {
  const snapshot = parseMnxSnapshot(payload(), now)
  const id = MNX_INSTRUMENTS[0].feedId
  expect(requireMnxReady(snapshot, id, now).maxLeverage).toBe(10)
  expect(() => requireMnxReady(snapshot, id, now + 6 * MINUTE_MS)).toThrow(
    /checks/
  )
  snapshot.feeds[id].point!.sourceData!.kind = 'candle'
  expect(() => requireMnxReady(snapshot, id, now)).toThrow(/live/)
})
