import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'
import { SupabaseDirectClient } from './supabase/init'
import {
  backfillUserStatsWindow,
  getUserTrades,
  isUserStatsTradesReady,
} from './user-stats-backfill'

// The user_stats migration's triggers and the backfill's real SQL, against an
// in-memory PostgreSQL holding the real contract_bets table and its trigger.
// The invariant throughout: once the backfill completes, each user's counter
// equals a direct count of their trades over every bet as it is now.
jest.mock('./supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(() => {
    throw new Error('This test must not create a network database client')
  }),
}))

jest.setTimeout(60_000)

const pgp = pgPromise()
let db: PGlite

const run = async (sql: string, params?: unknown) =>
  (await db.query(pgp.as.format(sql, params))).rows
const client = {
  one: async (sql: string, params?: unknown[]) => {
    const rows = await run(sql, params)
    if (rows.length !== 1)
      throw new Error(`Expected one row, got ${rows.length}`)
    return rows[0]
  },
  oneOrNone: async (sql: string, params?: unknown[]) => {
    const rows = await run(sql, params)
    if (rows.length > 1)
      throw new Error(`Expected at most one row, got ${rows.length}`)
    return rows[0] ?? null
  },
  none: async (sql: string, params?: unknown[]) => {
    const rows = await run(sql, params)
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

const tradeRows = async (sql: string) =>
  (await run(sql)) as { user_id: string; trades: number }[]

const migration = (name: string) =>
  readFileSync(resolve(__dirname, '../../supabase/migrations', name), 'utf8')
const installGuards = () =>
  db.exec(migration('2026112219_contracts_guards.sql'))
const install = async () => {
  await installGuards()
  await db.exec(migration('2026112220_user_stats.sql'))
}

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`
    create function random_alphanumeric(n integer) returns text
      language sql as $$ select repeat('x', n) $$;
    create table contracts (id text primary key, token text not null);
    insert into contracts (id, token)
      values ('m1', 'MANA'), ('m2', 'MANA'), ('cash', 'CASH');
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
})

afterEach(async () => {
  await db.close()
})

type BetOpts = {
  contractId?: string
  amount?: number
  // How long before now() the bet was placed, as a Postgres interval.
  ago?: string
  isApi?: boolean
  isRedemption?: boolean
  isAutoRedemption?: boolean
}

const betData = (id: string, userId: string, o: BetOpts) => ({
  id,
  userId,
  contractId: o.contractId ?? 'm1',
  amount: o.amount ?? 10,
  shares: 10,
  outcome: 'YES',
  isRedemption: o.isRedemption ?? false,
  ...(o.isApi !== undefined && { isApi: o.isApi }),
  ...(o.isAutoRedemption !== undefined && {
    isAutoRedemption: o.isAutoRedemption,
  }),
})

const bet = (id: string, userId: string, o: BetOpts = {}) =>
  run(
    `insert into contract_bets (bet_id, contract_id, created_time, data)
     values ($1, $2, now() - $3::interval, $4::jsonb)`,
    [
      id,
      o.contractId ?? 'm1',
      o.ago ?? '0 seconds',
      JSON.stringify(betData(id, userId, o)),
    ]
  )

// An open limit order: nothing filled yet.
const order = (id: string, userId: string, o: BetOpts = {}) =>
  run(
    `insert into contract_bets (bet_id, contract_id, created_time, data)
     values ($1, $2, now() - $3::interval, $4::jsonb)`,
    [
      id,
      o.contractId ?? 'm1',
      o.ago ?? '0 seconds',
      JSON.stringify({
        ...betData(id, userId, { ...o, amount: 0 }),
        orderAmount: 100,
        limitProb: 0.5,
        isFilled: false,
        isCancelled: false,
        fills: [],
      }),
    ]
  )

// What updateMakers does: the cumulative filled amount merged into data.
const fill = (id: string, amount: number, isFilled = false) =>
  run(`update contract_bets set data = data || $2::jsonb where bet_id = $1`, [
    id,
    JSON.stringify({ amount, isFilled }),
  ])

const cancel = (id: string) =>
  run(
    `update contract_bets set data = data || '{"isCancelled":true}' where bet_id = $1`,
    [id]
  )

// Each user's count: their live row plus their backfilled history.
const counters = async () =>
  Object.fromEntries(
    (
      await tradeRows(
        `select user_id, coalesce(s.trades, 0) + coalesce(b.trades, 0) as trades
         from user_stats s full join user_stats_baseline b using (user_id)
         where coalesce(s.trades, 0) + coalesce(b.trades, 0) <> 0
         order by user_id`
      )
    ).map((r) => [r.user_id, r.trades])
  )

// The definition applied directly to every bet as it is now.
const directCounts = async () =>
  Object.fromEntries(
    (
      await tradeRows(`select b.user_id, count(*)::int as trades
         from contract_bets b
         join contracts c on c.id = b.contract_id and c.token = 'MANA'
         where user_stats_bet_trades(
           b.amount, b.is_redemption, b.is_api,
           coalesce(b.data ->> 'isAutoRedemption' = 'true', false)
         ) = 1
         group by b.user_id
         order by b.user_id`)
    ).map((r) => [r.user_id, r.trades])
  )

const DAY = 86_400

const backfillAll = async (window = DAY) => {
  for (let i = 0; i < 10_000; i++) {
    const step = await backfillUserStatsWindow(pg, window)
    if (step.completed) return
  }
  throw new Error('backfill did not finish')
}

describe('counting trades as they happen', () => {
  beforeEach(install)

  it('counts market bets and buys or sells of a person, in mana markets', async () => {
    await bet('b1', 'u1')
    await bet('b2', 'u1', { amount: -5 }) // a sale
    await bet('b3', 'u1', { isApi: true })
    await bet('b4', 'u1', { isRedemption: true })
    await bet('b5', 'u1', { contractId: 'cash' })
    await bet('b6', 'u1', { isAutoRedemption: true })
    await bet('b7', 'u1', { amount: 0 })
    await bet('b8', 'u2', { isApi: false })
    expect(await counters()).toEqual({ u1: 2, u2: 1 })
    expect(await counters()).toEqual(await directCounts())
  })

  it('counts a limit order once, when it first fills', async () => {
    await order('o1', 'maker')
    expect(await counters()).toEqual({})
    await fill('o1', 4)
    expect(await counters()).toEqual({ maker: 1 })
    await fill('o1', 9)
    await cancel('o1')
    expect(await counters()).toEqual({ maker: 1 })
    await order('o2', 'maker')
    await cancel('o2') // never filled
    expect(await counters()).toEqual({ maker: 1 })
  })

  it('handles several users in one statement, as bulk inserts and maker fills do', async () => {
    await run(
      `insert into contract_bets (bet_id, contract_id, data)
       select id, 'm1', jsonb_build_object('id', id, 'userId', u, 'contractId', 'm1',
         'amount', 10, 'shares', 10, 'outcome', 'YES', 'isRedemption', false)
       from (values ('x1', 'a'), ('x2', 'b'), ('x3', 'a')) v(id, u)`
    )
    await order('o1', 'a')
    await order('o2', 'b')
    await run(
      `update contract_bets as c set data = data || v.update
       from (values ('o1', '{"amount": 5}'::jsonb), ('o2', '{"amount": 7}'::jsonb)) as v(id, update)
       where c.bet_id = v.id`
    )
    expect(await counters()).toEqual({ a: 3, b: 2 })
  })

  it('moves a trade when a bet changes user, and removes a deleted one', async () => {
    await bet('b1', 'u1')
    await bet('b2', 'u1')
    await run(
      `update contract_bets set data = data || '{"userId":"u2"}' where bet_id = 'b1'`
    )
    expect(await counters()).toEqual({ u1: 1, u2: 1 })
    await run(`delete from contract_bets where bet_id = 'b2'`)
    expect(await counters()).toEqual({ u2: 1 })
    expect(await counters()).toEqual(await directCounts())
  })

  it("refuses to change a market's token", async () => {
    await bet('b1', 'u1')
    await expect(
      db.exec(`update contracts set token = 'CASH' where id = 'm1'`)
    ).rejects.toThrow(/token cannot change/)
    expect(await counters()).toEqual({ u1: 1 })
  })

  it('refuses to truncate contract_bets', async () => {
    await expect(db.exec('truncate contract_bets')).rejects.toThrow(
      /user_stats/
    )
  })
})

describe('guarding market references', () => {
  it('refuses a missing market in a backdated insert under read committed', async () => {
    await install()
    await expect(
      client.tx(async () => {
        await run('set transaction isolation level read committed')
        await run(`insert into contract_bets (bet_id, contract_id, created_time, data)
          select id, id, user_stats_bet_bound(),
            jsonb_build_object('userId', 'alice', 'contractId', id, 'amount', 10)
          from (values ('m1'), ('missing')) markets(id)`)
      })
    ).rejects.toMatchObject({
      code: 'P0001',
      message: expect.stringContaining(
        'bet names market "missing", which does not exist. bets must be written after their market'
      ),
    })
    expect(await run('select bet_id from contract_bets')).toEqual([])
    expect(await counters()).toEqual({})
    expect(await run('select bet_id from user_stats_bet_journal')).toEqual([])
  })

  it('raises a serialization failure for an invisible market', async () => {
    await install()
    // In two sessions, a market committed after the bettor's serializable
    // snapshot is invisible until retry. PGlite has one session, so use a
    // missing market to exercise the same lookup and check the retry code.
    await expect(
      client.tx(async () => {
        await run('set transaction isolation level serializable')
        await bet('b', 'alice', { contractId: 'missing' })
      })
    ).rejects.toMatchObject({
      code: '40001',
      message: expect.stringContaining('transaction snapshot predates market'),
    })
  })

  it('refuses to move a bet to a missing market', async () => {
    await install()
    await bet('b', 'alice')
    await expect(
      run(`update contract_bets set contract_id = 'missing' where bet_id = 'b'`)
    ).rejects.toMatchObject({ code: 'P0001' })
    expect(
      await run(`select contract_id from contract_bets where bet_id = 'b'`)
    ).toEqual([{ contract_id: 'm1' }])
    expect(await counters()).toEqual({ alice: 1 })
  })

  it('allows fills and cancellations on a historical bet with a missing market', async () => {
    await order('old', 'alice', { contractId: 'missing' })
    await install()
    await fill('old', 5)
    await cancel('old')
    expect(
      await run(
        `select amount::int, is_cancelled from contract_bets where bet_id = 'old'`
      )
    ).toEqual([{ amount: 5, is_cancelled: true }])
    expect(await counters()).toEqual({})
  })

  it('fixes market ids and tokens before the stats install', async () => {
    await bet('b', 'alice')
    await installGuards()
    await run(`update contracts set id = id, token = token where id = 'm1'`)
    await expect(
      run(`update contracts set id = 'renamed' where id = 'm1'`)
    ).rejects.toThrow(/cannot change/)
    await expect(
      run(`update contracts set token = 'CASH' where id = 'm1'`)
    ).rejects.toThrow(/token cannot change/)
    await expect(run(`delete from contracts where id = 'm2'`)).rejects.toThrow(
      /soft-delete the market instead/
    )
  })

  it.each(['read committed', 'repeatable read', 'serializable'])(
    'refuses to delete empty and referenced markets under %s',
    async (isolation) => {
      await run(
        `insert into contracts (id, token) values ('empty-cash', 'CASH')`
      )
      await install()
      await bet('mana-bet', 'alice')
      await bet('cash-bet', 'alice', { contractId: 'cash' })
      for (const id of ['m1', 'm2', 'cash', 'empty-cash']) {
        await expect(
          client.tx(async () => {
            await run(`set transaction isolation level ${isolation}`)
            await run('delete from contracts where id = $1', [id])
          })
        ).rejects.toThrow(/soft-delete the market instead/)
      }
      expect(await counters()).toEqual({ alice: 1 })
      expect(await counters()).toEqual(await directCounts())
    }
  )

  it('refuses to truncate contracts, including with cascade', async () => {
    await installGuards()
    await expect(run('truncate contracts')).rejects.toThrow(/soft-delete/)
    await expect(run('truncate contracts cascade')).rejects.toThrow(
      /soft-delete/
    )
  })

  it('refuses to delete the market of a backfilled bet', async () => {
    await bet('old', 'alice')
    await install()
    await backfillAll()
    await expect(run(`delete from contracts where id = 'm1'`)).rejects.toThrow(
      /soft-delete the market instead/
    )
    expect(await counters()).toEqual({ alice: 1 })
    expect(await counters()).toEqual(await directCounts())
  })

  it('retains a market whose only reference is an unprocessed journal image', async () => {
    await bet('old', 'alice')
    await install()
    await run(`delete from contract_bets where bet_id = 'old'`)
    await expect(run(`delete from contracts where id = 'm1'`)).rejects.toThrow(
      /soft-delete the market instead/
    )
    await backfillAll()
    expect(
      await tradeRows('select user_id, trades from user_stats_baseline')
    ).toEqual([{ user_id: 'alice', trades: 1 }])
    expect(await counters()).toEqual(await directCounts())
  })

  it('rolls back deleting a bet and its market in the same statement', async () => {
    await install()
    await bet('b', 'alice')
    await expect(
      client.tx(async () => {
        await run('set transaction isolation level read committed')
        await run(`with gone as (
          delete from contract_bets where bet_id = 'b' returning contract_id
        )
        delete from contracts c using gone where c.id = gone.contract_id`)
      })
    ).rejects.toThrow(/soft-delete the market instead/)
    expect(await counters()).toEqual({ alice: 1 })
    expect(await counters()).toEqual(await directCounts())
  })
})

describe('first bet images before the backfill', () => {
  const expectBackfilledCounts = async (expected: Record<string, number>) => {
    await backfillAll()
    const direct = await directCounts()
    expect(direct).toEqual(expected)
    expect(await counters()).toEqual(direct)
  }

  it('deletes and reinserts the same historical bet in one statement', async () => {
    await bet('original', 'alice')
    await install()
    // EXISTS can stop at the first RETURNING row. The INSERT's statement
    // trigger can run before the DELETE's, even though it reuses the freed id.
    await run(
      `with gone as (
         delete from contract_bets where bet_id = $1 returning bet_id
       )
       insert into contract_bets (bet_id, contract_id, created_time, data)
       select $1, 'm1', user_stats_bet_bound(), $2::jsonb
       where exists (select 1 from gone)`,
      ['original', JSON.stringify(betData('original', 'alice', {}))]
    )
    await expectBackfilledCounts({ alice: 1 })
  })

  it('keeps the marker when a later statement deletes a backdated insert', async () => {
    await install()
    await bet('late', 'alice', { ago: '1 day' })
    await run(`delete from contract_bets where bet_id = 'late'`)
    expect(
      await run(
        `select existed from user_stats_bet_journal where bet_id = 'late'`
      )
    ).toEqual([{ existed: false }])
    await expectBackfilledCounts({})
  })

  it.each<[string, string, Record<string, number>]>([
    ['delete', 'delete from contract_bets', {}],
    [
      'update',
      `update contract_bets set data = data || '{"userId":"bob"}'`,
      { bob: 1 },
    ],
  ])(
    'journals a backdated insert before a nested %s',
    async (_, change, expected) => {
      await install()
      await db.exec(`create function change_bet(id text) returns text language sql volatile as $$
        ${change} where bet_id = id returning bet_id
      $$`)
      expect(
        await run(
          `with added as (
             insert into contract_bets (bet_id, contract_id, created_time, data)
             values ('late', 'm1', user_stats_bet_bound() - interval '1 day', $1::jsonb)
             returning bet_id
           )
           select change_bet(bet_id) as changed from added`,
          [JSON.stringify(betData('late', 'alice', {}))]
        )
      ).toEqual([{ changed: 'late' }])
      await expectBackfilledCounts(expected)
    }
  )

  it('captures the historical row updated by an upsert', async () => {
    await bet('original', 'alice')
    await install()
    await run(
      `insert into contract_bets (bet_id, contract_id, data)
       values ($1, 'm1', $2::jsonb)
       on conflict (bet_id) do update set data = excluded.data`,
      ['original', JSON.stringify(betData('original', 'bob', {}))]
    )
    await expectBackfilledCounts({ bob: 1 })
  })

  it.each(['do update set data = excluded.data', 'do nothing'])(
    'handles backdated proposals for historical and new ids with on conflict %s',
    async (action) => {
      await bet('historical', 'alice')
      await install()
      const propose = (id: string, user: string) =>
        run(
          `insert into contract_bets (bet_id, contract_id, created_time, data)
           values ($1, 'm1', user_stats_bet_bound(), $2::jsonb)
           on conflict (bet_id) ${action} returning bet_id`,
          [id, JSON.stringify(betData(id, user, {}))]
        )
      await propose('historical', 'bob')
      expect(await propose('late', 'carol')).toEqual([{ bet_id: 'late' }])
      await propose('late', 'dave')
      if (action === 'do nothing') {
        await expectBackfilledCounts({ alice: 1, carol: 1 })
      } else {
        await expectBackfilledCounts({ bob: 1, dave: 1 })
      }
    }
  )

  it('marks a backdated replacement of a deleted post-bound bet', async () => {
    await order('at-bound', 'alice', { ago: '1 day' })
    await install()
    await bet('reused', 'alice')
    // A visible post-bound row suppresses the early marker. A skipped
    // insert contributes no row to the after insert transition table either.
    await run(
      `insert into contract_bets (bet_id, contract_id, created_time, data)
       values ('reused', 'm1', user_stats_bet_bound(), $1::jsonb)
       on conflict (bet_id) do nothing`,
      [JSON.stringify(betData('reused', 'bob', {}))]
    )
    expect(await run('select bet_id from user_stats_bet_journal')).toEqual([])
    await run(`delete from contract_bets where bet_id = 'reused'`)
    expect(await run('select bet_id from user_stats_bet_journal')).toEqual([])

    // The delete has committed before this replacement, so before insert
    // sees the id is free and writes the early marker.
    await bet('reused', 'bob', { ago: '2 days' })
    expect(
      await run('select bet_id, existed from user_stats_bet_journal')
    ).toEqual([{ bet_id: 'reused', existed: false }])
    await expectBackfilledCounts({ bob: 1 })
  })

  it('deletes a historical bet and moves another bet to its id', async () => {
    await bet('removed', 'alice')
    await bet('moved', 'bob')
    await install()
    await run(
      `with gone as (
         delete from contract_bets where bet_id = 'removed' returning bet_id
       )
       update contract_bets set bet_id = gone.bet_id
       from gone where contract_bets.bet_id = 'moved'`
    )
    await expectBackfilledCounts({ bob: 1 })
  })

  it('updates one historical bet and deletes another in one statement', async () => {
    await bet('updated', 'alice', { amount: 0 })
    await bet('removed', 'bob')
    await install()
    await run(
      `with filled as (
         update contract_bets set data = data || '{"amount": 5}'
         where bet_id = 'updated' returning bet_id
       )
       delete from contract_bets where bet_id = 'removed' and exists (select 1 from filled)`
    )
    await expectBackfilledCounts({ alice: 1 })
  })

  it('changes a historical bet id and inserts a new bet with its old id', async () => {
    await bet('original', 'alice')
    await install()
    await run(
      `with moved as (
         update contract_bets set bet_id = 'moved' where bet_id = $1 returning bet_id
       )
       insert into contract_bets (bet_id, contract_id, created_time, data)
       select $1, 'm1', user_stats_bet_bound(), $2::jsonb
       where exists (select 1 from moved)`,
      ['original', JSON.stringify(betData('original', 'bob', {}))]
    )
    await expectBackfilledCounts({ alice: 1, bob: 1 })
  })
})

describe('backfill', () => {
  // History made before the migration: what prod has at the install.
  const seedHistory = async () => {
    await bet('h1', 'alice', { ago: '30 days' })
    await bet('h2', 'alice', { ago: '29 days', isApi: true })
    await bet('h3', 'alice', { ago: '20 days', amount: -3 })
    await bet('h4', 'bob', { ago: '25 days' })
    await bet('h5', 'bob', { ago: '24 days', isRedemption: true })
    await bet('h6', 'bob', { ago: '23 days', contractId: 'cash' })
    await bet('h7', 'carol', { ago: '10 days', contractId: 'm2' })
    await order('h8', 'carol', { ago: '9 days' }) // open
    await order('h9', 'dave', { ago: '28 days' }) // open
    await order('h10', 'dave', { ago: '2 days' }) // open
    await order('h11', 'erin', { ago: '15 days' })
    await fill('h11', 3) // partly filled before the install
    await bet('h12', 'frank', { ago: '1 hour' }) // the newest: the bound
  }

  it('is not ready before the migration or before the backfill completes', async () => {
    expect(await isUserStatsTradesReady(pg)).toBe(false)
    await install()
    expect(await isUserStatsTradesReady(pg)).toBe(false)
    await backfillAll()
    expect(await isUserStatsTradesReady(pg)).toBe(true)
  })

  it('counts history once, with no changes during the backfill', async () => {
    await seedHistory()
    await install()
    expect(await counters()).toEqual({})
    await backfillAll()
    expect(await counters()).toEqual(await directCounts())
    expect(await counters()).toEqual({
      alice: 2,
      bob: 1,
      carol: 1,
      erin: 1,
      frank: 1,
    })
  })

  it('stays exact through changes made before, during and after it', async () => {
    await seedHistory()
    await install()

    // After the install, before the backfill starts:
    await fill('h8', 5) // an old open order fills
    await run(`delete from contract_bets where bet_id = 'h4'`) // an old trade goes
    await bet('late', 'bob', { ago: '12 days' }) // inserted now, dated before the bound
    await bet('new1', 'alice')

    // Part of the way: the windows up to about 26 days ago.
    await backfillUserStatsWindow(pg, 4 * DAY)
    await backfillUserStatsWindow(pg, DAY)

    // An old order whose window is done fills, and one whose window isn't.
    await fill('h9', 2)
    await fill('h10', 6)
    // Changes to old bets that don't change any count.
    await cancel('h11')
    await fill('h8', 7, true)
    await run(
      `update contract_bets set data = data || '{"userId":"zed"}' where bet_id = 'h7'`
    )

    await backfillAll(3 * DAY)
    await bet('new2', 'dave')
    await fill('h10', 9, true)

    expect(await counters()).toEqual(await directCounts())
    expect(await counters()).toEqual({
      alice: 3,
      bob: 1,
      carol: 1,
      dave: 3,
      erin: 1,
      frank: 1,
      zed: 1,
    })
  })

  it('writes history only to the baseline, never the rows bets write', async () => {
    await seedHistory()
    await install()
    await backfillAll()
    expect(await run(`select * from user_stats`)).toEqual([])
    expect(await counters()).toEqual(await directCounts())
  })

  it('counts once a later bet moved back to before the bound', async () => {
    await seedHistory()
    await install()
    await bet('later', 'alice', { ago: '0 seconds' })
    // Moved to before the bound (the newest bet at the install).
    await run(
      `update contract_bets set created_time = created_time - interval '2 days'
       where bet_id = 'later'`
    )
    await backfillAll()
    expect(await counters()).toEqual(await directCounts())
    expect((await counters()).alice).toBe(3)
  })

  it('refuses a window that is not positive, and leaves progress alone', async () => {
    await seedHistory()
    await install()
    await backfillUserStatsWindow(pg, 2 * DAY)
    const before = await run(
      `select done_before::text from user_stats_backfill`
    )
    for (const bad of [0, -2 * DAY, 0.5]) {
      await expect(backfillUserStatsWindow(pg, bad)).rejects.toThrow(/Window/)
    }
    expect(
      await run(`select done_before::text from user_stats_backfill`)
    ).toEqual(before)
    await backfillAll()
    expect(await counters()).toEqual(await directCounts())
  })

  it('does nothing more once complete, and survives running the migration again', async () => {
    await seedHistory()
    await install()
    await backfillAll()
    const before = await counters()
    const { bound } = (
      await run(`select bound::text from user_stats_backfill`)
    )[0] as { bound: string }

    await bet('later', 'alice', { ago: '1 second' })
    await install() // a second run keeps the bound and the counts
    const after = (await run(`select bound::text from user_stats_backfill`))[0]
    expect(after).toEqual({ bound })
    expect((await backfillUserStatsWindow(pg, DAY)).completed).toBe(true)
    expect(await counters()).toEqual({ ...before, alice: before.alice + 1 })
    expect(await counters()).toEqual(await directCounts())
  })

  it('completes at once with no history', async () => {
    await install()
    await backfillAll()
    expect(await isUserStatsTradesReady(pg)).toBe(true)
    expect(await counters()).toEqual({})
  })

  it('applies a window only once when it fails part way', async () => {
    await seedHistory()
    await install()
    // A window whose count fails (here, a statement timeout) applies nothing.
    await run(
      `alter function user_stats_bet_trades rename to user_stats_bet_trades_off`
    )
    await expect(backfillUserStatsWindow(pg, 100 * DAY)).rejects.toThrow()
    await run(
      `alter function user_stats_bet_trades_off rename to user_stats_bet_trades`
    )
    expect(await counters()).toEqual({})
    expect(
      (await run(`select done_before from user_stats_backfill`))[0]
    ).toEqual({ done_before: null })
    await backfillAll()
    expect(await counters()).toEqual(await directCounts())
  })
})

describe('reading a count and rank', () => {
  beforeEach(install)

  it('adds live and history, ranks ties together, and gives no rank for 0', async () => {
    await run(
      `insert into user_stats (user_id, trades) values ('a', 2), ('b', -1), ('c', 5),
         ('offset', -2), ('negative', -1)`
    )
    await run(
      `insert into user_stats_baseline (user_id, trades) values ('b', 4), ('d', 5),
         ('e', 0), ('offset', 2)`
    )
    expect(await getUserTrades(pg, 'c')).toEqual({ count: 5, rank: 1 })
    expect(await getUserTrades(pg, 'd')).toEqual({ count: 5, rank: 1 })
    expect(await getUserTrades(pg, 'b')).toEqual({ count: 3, rank: 3 })
    expect(await getUserTrades(pg, 'a')).toEqual({ count: 2, rank: 4 })
    expect(await getUserTrades(pg, 'e')).toEqual({ count: 0, rank: null })
    expect(await getUserTrades(pg, 'offset')).toEqual({ count: 0, rank: null })
    expect(await getUserTrades(pg, 'negative')).toEqual({
      count: 0,
      rank: null,
    })
    expect(await getUserTrades(pg, 'nobody')).toEqual({ count: 0, rank: null })
  })
})
