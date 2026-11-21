import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'
import { SupabaseDirectClient } from './supabase/init'
import { updateAchTrades } from '../../scheduler/src/jobs/update-ach-trades'

// The job's real SQL runs against an in-memory PostgreSQL holding the real
// contract_bets table and trigger, the real ach_trades table and the
// job_watermarks migration.
jest.mock('./supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(() => {
    throw new Error('This test must not create a network database client')
  }),
}))
jest.mock('./utils', () => ({
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
}))

jest.setTimeout(60_000)

const UNLIMITED = { maxWindows: 10_000, budgetMs: 600_000 }
const pgp = pgPromise()
let db: PGlite
// When set, the Nth window's insert into ach_trades throws, after the window
// has been read and locked: a crash in the middle of a window.
let failApplyOnCall: number | undefined
let applyCalls = 0

const format = (sql: string, params?: unknown) => pgp.as.format(sql, params)
const client = {
  one: async (sql: string, params?: unknown[]) => {
    if (sql.includes('insert into ach_trades')) {
      applyCalls++
      if (applyCalls === failApplyOnCall) throw new Error('connection lost')
    }
    const { rows } = await db.query(format(sql, params))
    if (rows.length !== 1)
      throw new Error(`Expected one row, got ${rows.length}`)
    return rows[0]
  },
  oneOrNone: async (sql: string, params?: unknown[]) => {
    const { rows } = await db.query(format(sql, params))
    if (rows.length > 1)
      throw new Error(`Expected at most one row, got ${rows.length}`)
    return rows[0] ?? null
  },
  none: async (sql: string, params?: unknown[]) => {
    const { rows } = await db.query(format(sql, params))
    if (rows.length) throw new Error(`Expected no rows, got ${rows.length}`)
  },
  tx: async <T>(fn: (tx: unknown) => Promise<T>) => {
    await db.exec('begin')
    try {
      const result = await fn(client)
      await db.exec('commit')
      return result
    } catch (e) {
      await db.exec('rollback')
      throw e
    }
  },
}
const pg = client as unknown as SupabaseDirectClient

type SeedBet = {
  id: string
  userId: string
  // How long before now() the bet was placed, as a Postgres interval.
  ago: string
  contractId?: string
  isRedemption?: boolean
  isFilled?: boolean
  isCancelled?: boolean
  isApi?: boolean
}

const addBets = async (bets: SeedBet[]) => {
  for (const { id, userId, ago, contractId = 'mana', ...flags } of bets)
    await db.query(
      `insert into contract_bets (bet_id, contract_id, created_time, data)
       values ($1, $2, now() - $3::interval, $4::jsonb)`,
      [id, contractId, ago, JSON.stringify({ userId, contractId, ...flags })]
    )
}

// A row as the last full pass left it: its newest counted trade is `betId`.
const addRow = async (userId: string, count: number, betId: string) =>
  db.query(
    `insert into ach_trades (user_id, total_trades_count, last_updated)
     select $1, $2, created_time from contract_bets where bet_id = $3`,
    [userId, count, betId]
  )

const rows = async () =>
  Object.fromEntries(
    (
      await db.query<{ user_id: string; n: number; rank: number | null }>(
        `select user_id, total_trades_count as n, trades_rank as rank from ach_trades`
      )
    ).rows.map((r) => [r.user_id, { n: r.n, rank: r.rank }])
  )

const counts = async () =>
  Object.fromEntries(
    Object.entries(await rows()).map(([user, { n }]) => [user, n])
  )

const watermark = async () =>
  (
    await db.query<{ w: string }>(
      `select watermark::text as w from job_watermarks where job_name = 'update-ach-trades'`
    )
  ).rows[0]?.w

// The counting rules applied directly to every bet after `after`: what the
// incremental windows must add up to.
const directCounts = async (after: string) =>
  Object.fromEntries(
    (
      await db.query<{ user_id: string; n: number }>(
        `select b.user_id, count(*)::int as n
         from contract_bets b join contracts c on c.id = b.contract_id
         where b.created_time > $1::timestamptz
           and b.created_time <= now() - interval '10 minutes'
           and coalesce(b.is_redemption, false) = false
           and coalesce(b.is_filled, true) = true
           and coalesce(b.is_cancelled, false) = false
           and (b.is_api is null or b.is_api = false)
           and c.token = 'MANA'
         group by b.user_id`,
        [after]
      )
    ).rows.map((r) => [r.user_id, r.n])
  )

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create function random_alphanumeric(n integer) returns text
      language sql as $$ select repeat('x', n) $$;
    create table contracts (id text primary key, token text not null);
    insert into contracts (id, token) values ('mana', 'MANA'), ('cash', 'CASH');
  `)
  const bets = readFileSync(
    resolve(__dirname, '../../supabase/contract_bets.sql'),
    'utf8'
  )
  const table = bets.split('-- Triggers')[0]
  const triggers = bets.split('-- Triggers')[1].split('-- Functions')[0]
  const functions = bets
    .split('-- Functions')[1]
    .split('-- Row Level Security')[0]
  await db.exec(table + functions + triggers)
  await db.exec(
    'create index contract_bets_created_time_only on contract_bets (created_time desc)'
  )
  const achievements = readFileSync(
    resolve(__dirname, '../../supabase/achievement_materialized_views.sql'),
    'utf8'
  )
  await db.exec(
    achievements.split('-- Trades')[1].split('-- Comments (liked-only)')[0]
  )
  await db.exec(
    readFileSync(
      resolve(
        __dirname,
        '../../supabase/migrations/2026112201_job_watermarks.sql'
      ),
      'utf8'
    )
  )
})

beforeEach(async () => {
  await db.exec('truncate contract_bets, ach_trades, job_watermarks')
  failApplyOnCall = undefined
  applyCalls = 0
})

afterAll(async () => {
  await db?.close()
  pgp.end()
})

describe('updateAchTrades', () => {
  it('starts after the newest counted trade and applies the counting rules', async () => {
    await addBets([
      // Already in ach_trades from the last full pass.
      { id: 'a-old', userId: 'alice', ago: '4 days' },
      { id: 'a-last', userId: 'alice', ago: '3 days' },
      { id: 'b-last', userId: 'bob', ago: '10 days' },
      // Before the watermark but never counted (a limit order that filled
      // after the last pass): bets before the watermark are not revisited.
      { id: 'b-late-fill', userId: 'bob', ago: '5 days' },
      // Counted: isFilled and isApi absent count as filled and not API.
      { id: 'a1', userId: 'alice', ago: '2 days' },
      { id: 'a2', userId: 'alice', ago: '1 day', isFilled: true },
      { id: 'a3', userId: 'alice', ago: '30 minutes', isApi: false },
      { id: 'b1', userId: 'bob', ago: '2 days' },
      { id: 'c1', userId: 'carol', ago: '1 day' },
      { id: 'c2', userId: 'carol', ago: '2 hours' },
      { id: 'd1', userId: 'dave', ago: '1 day' },
      { id: 'd2', userId: 'dave', ago: '20 hours' },
      // Not trades.
      { id: 'x1', userId: 'alice', ago: '1 day', isRedemption: true },
      { id: 'x2', userId: 'alice', ago: '1 day', isFilled: false },
      { id: 'x3', userId: 'alice', ago: '1 day', isCancelled: true },
      { id: 'x4', userId: 'alice', ago: '1 day', isApi: true },
      { id: 'x5', userId: 'alice', ago: '1 day', contractId: 'cash' },
      { id: 'x6', userId: 'erin', ago: '1 day', isApi: true },
      // Inside the 10-minute lag: left for the next run.
      { id: 'a-recent', userId: 'alice', ago: '5 minutes' },
    ])
    await addRow('alice', 5, 'a-last')
    await addRow('bob', 2, 'b-last')

    await updateAchTrades(pg, UNLIMITED)

    expect(await rows()).toEqual({
      alice: { n: 8, rank: 1 },
      bob: { n: 3, rank: 2 },
      carol: { n: 2, rank: 3 },
      dave: { n: 2, rank: 3 },
    })
    const { rows: carol } = await db.query<{ last: string; c2: string }>(
      `select last_updated::text as last,
         (select created_time::text from contract_bets where bet_id = 'c2') as c2
       from ach_trades where user_id = 'carol'`
    )
    expect(carol[0].last).toEqual(carol[0].c2)

    // Nothing new: a second run changes nothing.
    await updateAchTrades(pg, UNLIMITED)
    expect(await counts()).toEqual({ alice: 8, bob: 3, carol: 2, dave: 2 })

    // Once the lag has passed (simulated with a shorter lag), the next run
    // picks up exactly the bet the first run left behind.
    await updateAchTrades(pg, { ...UNLIMITED, lag: '1 minute' })
    expect(await counts()).toEqual({ alice: 9, bob: 3, carol: 2, dave: 2 })
  })

  it('spreads a backlog over capped runs and adds up to a direct count', async () => {
    // Deterministic pseudo-random bets over the past four days.
    let seed = 42
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const users = ['u1', 'u2', 'u3', 'u4', 'u5']
    const bets: SeedBet[] = [{ id: 'base', userId: 'u1', ago: '4 days' }]
    for (let i = 0; i < 300; i++)
      bets.push({
        id: `bet-${i}`,
        userId: users[Math.floor(next() * users.length)],
        // At least 30 minutes old, so no bet sits near the moving cutoff.
        ago: `${30 + Math.floor(next() * (4 * 24 * 60 - 60))} minutes`,
        contractId: next() < 0.1 ? 'cash' : 'mana',
        isRedemption: next() < 0.1,
        isFilled: next() < 0.1 ? false : undefined,
        isCancelled: next() < 0.05,
        isApi: next() < 0.1 ? true : undefined,
      })
    await addBets(bets)
    await addRow('u1', 1, 'base')
    const start = (
      await db.query<{ t: string }>(
        `select created_time::text as t from contract_bets where bet_id = 'base'`
      )
    ).rows[0].t
    const expected = await directCounts(start)
    expected.u1 = (expected.u1 ?? 0) + 1

    // Two 6-hour windows per run: four days of bets need at least eight runs.
    const pastNewestBet = async () =>
      (
        await db.query<{ done: boolean }>(
          `select $1::timestamptz > (select max(created_time) from contract_bets) as done`,
          [await watermark()]
        )
      ).rows[0].done
    let runs = 0
    while (runs < 50) {
      await updateAchTrades(pg, { maxWindows: 2, budgetMs: 600_000 })
      runs++
      if (await pastNewestBet()) break
      // Partway through, every count is at most its final value.
      for (const [user, n] of Object.entries(await counts()))
        expect(n).toBeLessThanOrEqual(expected[user])
    }
    expect(runs).toBeGreaterThanOrEqual(8)
    expect(runs).toBeLessThan(50)
    expect(await counts()).toEqual(expected)

    // Ranks follow the counts, ties sharing a rank.
    const ranked = await rows()
    for (const { n, rank } of Object.values(ranked))
      expect(rank).toEqual(
        1 + Object.values(ranked).filter((other) => other.n > n).length
      )
  })

  it('commits a window and its watermark together, so a crash neither skips nor double counts', async () => {
    await addBets([
      { id: 'base', userId: 'alice', ago: '3 days' },
      { id: 'w1', userId: 'alice', ago: '2 days 23 hours' },
      { id: 'w2', userId: 'alice', ago: '2 days' },
      { id: 'w3', userId: 'bob', ago: '1 day' },
    ])
    await addRow('alice', 1, 'base')

    failApplyOnCall = 2
    await expect(updateAchTrades(pg, UNLIMITED)).rejects.toThrow(
      'connection lost'
    )
    // The first window (w1) committed with its watermark; the second rolled
    // back whole.
    expect(await counts()).toEqual({ alice: 2 })
    const afterCrash = await watermark()
    expect(afterCrash).toBeDefined()
    expect(
      (
        await db.query<{ ok: boolean }>(
          `select $1::timestamptz >= (select created_time from contract_bets where bet_id = 'w1')
             and $1::timestamptz < (select created_time from contract_bets where bet_id = 'w2') as ok`,
          [afterCrash]
        )
      ).rows[0].ok
    ).toBe(true)

    failApplyOnCall = undefined
    await updateAchTrades(pg, UNLIMITED)
    expect(await counts()).toEqual({ alice: 3, bob: 1 })
  })

  it('does not recount when the watermark is moved back', async () => {
    await addBets([
      { id: 'base', userId: 'alice', ago: '3 days' },
      { id: 'a1', userId: 'alice', ago: '2 days' },
      { id: 'a2', userId: 'alice', ago: '1 day' },
      { id: 'b1', userId: 'bob', ago: '12 hours' },
    ])
    await addRow('alice', 1, 'base')
    await updateAchTrades(pg, UNLIMITED)
    expect(await counts()).toEqual({ alice: 3, bob: 1 })

    await db.exec(
      `update job_watermarks set watermark = watermark - interval '5 days'`
    )
    await updateAchTrades(pg, UNLIMITED)
    expect(await counts()).toEqual({ alice: 3, bob: 1 })
  })

  it('on an empty ach_trades starts before the first bet and skips stretches with no bets', async () => {
    await addBets([
      { id: 'old', userId: 'alice', ago: '400 days' },
      { id: 'mid', userId: 'bob', ago: '200 days' },
      { id: 'new', userId: 'alice', ago: '1 day' },
    ])

    // 400 days is 1,600 six-hour windows; starting each window at the next
    // bet needs three plus the empty tail to the cutoff.
    await updateAchTrades(pg, { maxWindows: 4, budgetMs: 600_000 })
    expect(await counts()).toEqual({ alice: 2, bob: 1 })
    expect(await rows()).toEqual({
      alice: { n: 2, rank: 1 },
      bob: { n: 1, rank: 2 },
    })
  })
})
