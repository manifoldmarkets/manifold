import { readFileSync } from 'fs'
import { join } from 'path'
import * as dayjs from 'dayjs'
import { pgp, SERIAL_MODE } from 'shared/supabase/init'
import { getPerpPoolStats } from './pool-stats'

// Opt-in integration test: use a disposable, empty local database.
// PERP_POOL_STATS_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55437/perp_stats_test
const databaseUrl = process.env.PERP_POOL_STATS_TEST_DATABASE_URL
const integration = databaseUrl ? describe : describe.skip

integration('database-captured PERP pool stats', () => {
  const schema = `perp_stats_${Date.now()}`
  const connection = new URL(
    databaseUrl ?? 'postgres://localhost/perp_stats_test'
  )
  connection.searchParams.set('options', `-c search_path=${schema}`)
  const pg = pgp(connection.toString())
  let schemaCreated = false
  const migration = (name: string) =>
    readFileSync(join(__dirname, '../../../supabase/migrations', name), 'utf8')
  const captureMigration = () =>
    pg.none(migration('2026090601_capture_perp_pool_snapshots.sql'))
  const snapshotCount = () =>
    pg.one<{ count: number }>(
      `select count(*)::int as count from contract_perp_pool_events
       where event_type = 'snapshot' and contract_id = 'listed'`
    )
  const setPools = (long: number, short: number, id = 'listed') =>
    pg.none(
      `update contracts set data = data || jsonb_build_object(
         'poolLong', $1::numeric, 'poolShort', $2::numeric
       ) where id = $3`,
      [long, short, id]
    )

  beforeAll(async () => {
    const url = new URL(databaseUrl!)
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.pathname !== '/perp_stats_test'
    )
      throw new Error('Use a disposable local database named perp_stats_test')

    await pg.none('create schema $1:name', [schema])
    schemaCreated = true
    await pg.none(`
      create table contracts (
        id text primary key, slug text, question text, resolution_time timestamptz,
        created_time timestamptz default now(), outcome_type text,
        visibility text default 'public', deleted boolean default false,
        data jsonb not null
      );
      create table contract_perp_positions (
        contract_id text, user_id text, direction text, size numeric,
        cost_basis numeric, original_cost_basis numeric, taker_fee_cost_basis numeric,
        entry_price numeric, leverage numeric, liquidation_price numeric,
        opened_time timestamptz, updated_time timestamptz
      );
      create table txns (
        from_id text, to_id text, from_type text, to_type text,
        category text, amount numeric, token text
      );
      insert into contracts (id, slug, question, outcome_type, data) values
        ('listed', 'listed-perp', 'Listed PERP', 'PERP',
         '{"poolLong":100,"poolShort":100,"oraclePrice":100,"creatorUsername":"creator"}');
    `)
    await pg.none(migration('2026090401_add_perp_pool_events.sql'))
    // This is the previously unrecorded window between migrations/deployment.
    await setPools(120, 100)
    await captureMigration()
  })

  afterAll(async () => {
    if (schemaCreated) await pg.none('drop schema $1:name cascade', [schema])
    await pg.$pool.end()
  })

  it('starts continuous history at the actual balances after the old baseline', async () => {
    const stats = await getPerpPoolStats(pg, 365)
    expect(stats.points).toHaveLength(1)
    expect(stats.points[0]).toMatchObject({ poolLong: 120, poolShort: 100 })
    expect(stats.contracts[0].points).toEqual(stats.points)
    expect(stats.trackingStartTime).not.toBeNull()
  })

  it('captures old writers that never insert an application event', async () => {
    await setPools(130, 100)
    const stats = await getPerpPoolStats(pg, 1)
    expect(stats.points[0]).toMatchObject({ poolLong: 130, poolShort: 100 })
    expect(stats.contracts[0].poolLong).toBe(130)
  })

  it('does not add detailed application events to the saved balances', async () => {
    await pg.tx(async (tx) => {
      await tx.none(`insert into contract_perp_pool_events (
        contract_id, event_type, pool_long_before, pool_long_after,
        pool_short_before, pool_short_after, cash_in
      ) values ('listed', 'open', 130, 140, 100, 100, 10)`)
      await tx.none(`update contracts set data = data || '{"poolLong":140}'
                     where id = 'listed'`)
    })
    const stats = await getPerpPoolStats(pg, 1)
    expect(stats.points[0].poolLong).toBe(140)
    expect(stats.contracts[0].poolLong).toBe(140)
  })

  it('ignores price-only updates and rolls back snapshots with failed trades', async () => {
    const before = await snapshotCount()
    await pg.none(`update contracts set data = data || '{"oraclePrice":105}'
                   where id = 'listed'`)
    expect(await snapshotCount()).toEqual(before)
    await expect(
      pg.tx(async (tx) => {
        await tx.none(`update contracts set data = data || '{"poolLong":200}'
                       where id = 'listed'`)
        throw new Error('cancel trade')
      })
    ).rejects.toThrow('cancel trade')
    expect(await snapshotCount()).toEqual(before)
    expect((await getPerpPoolStats(pg, 1)).points[0].poolLong).toBe(140)
  })

  it('keeps the original tracking start when the capture migration is retried', async () => {
    const before = await snapshotCount()
    const stats = await getPerpPoolStats(pg, 1)
    await captureMigration()
    expect(await snapshotCount()).toEqual(before)
    expect((await getPerpPoolStats(pg, 1)).trackingStartTime).toBe(
      stats.trackingStartTime
    )
  })

  it('waits for an in-flight writer before installing capture', async () => {
    let unlockWriter: () => void = () => undefined
    let notifyLocked: () => void = () => undefined
    const locked = new Promise<void>((resolve) => {
      notifyLocked = resolve
    })
    const unlocked = new Promise<void>((resolve) => {
      unlockWriter = resolve
    })
    const writer = pg.tx({ mode: SERIAL_MODE }, async (tx) => {
      await tx.one(`select id from contracts where id = 'listed' for update`)
      notifyLocked()
      await unlocked
      // Application events take the ledger lock before the contract update.
      await tx.none(`insert into contract_perp_pool_events (
        contract_id, event_type, pool_long_before, pool_long_after,
        pool_short_before, pool_short_after
      ) values ('listed', 'oracle', 140, 135, 100, 105)`)
      await tx.none(`update contracts set data = data || '{"poolLong":135,"poolShort":105}'
                     where id = 'listed'`)
    })
    await locked
    const migrating = captureMigration()
    try {
      const deadline = Date.now() + 3000
      let waiting = false
      while (!waiting && Date.now() < deadline) {
        const row = await pg.one<{ waiting: boolean }>(`select exists (
          select 1 from pg_locks where relation = 'contracts'::regclass
          and mode = 'AccessExclusiveLock' and not granted
        ) as waiting`)
        waiting = row.waiting
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(waiting).toBe(true)
    } finally {
      unlockWriter()
      await Promise.all([writer, migrating])
    }
    expect((await getPerpPoolStats(pg, 1)).points[0]).toMatchObject({
      poolLong: 135,
      poolShort: 105,
    })
    await setPools(140, 100)
  })

  it('excludes unlisted and deleted markets from every public total and history', async () => {
    await pg.none(`
      insert into contracts (id, slug, question, outcome_type, visibility, deleted, data) values
        ('unlisted', 'hidden', 'Hidden PERP', 'PERP', 'unlisted', false,
         '{"poolLong":900,"poolShort":900,"oraclePrice":100}'),
        ('deleted', 'deleted', 'Deleted PERP', 'PERP', 'public', true,
         '{"poolLong":900,"poolShort":900,"oraclePrice":100}'),
        ('binary', 'binary', 'Binary market', 'BINARY', 'public', false, '{}');
      insert into txns values
        ('creator', 'listed', 'USER', 'CONTRACT', 'CREATE_CONTRACT_ANTE', 200, 'M$'),
        ('user', 'listed', 'USER', 'CONTRACT', 'PERP_OPEN_MARGIN', 40, 'M$'),
        ('user', 'unlisted', 'USER', 'CONTRACT', 'PERP_OPEN_MARGIN', 900, 'M$'),
        ('deleted', 'user', 'CONTRACT', 'USER', 'PERP_CLOSE_PAYOUT', 900, 'M$');
    `)
    const stats = await getPerpPoolStats(pg, 1)
    expect(stats.contracts.map((contract) => contract.id)).toEqual(['listed'])
    expect(stats.flows.initialSubsidy).toBe(200)
    expect(stats.flows.marginIn).toBe(40)
    expect(stats.flows.traderPayouts).toBe(0)
    expect(stats.points[0]).toMatchObject({ poolLong: 140, poolShort: 100 })
  })

  it('retains a resolved listed market with zero backing and its cash history', async () => {
    await setPools(0, 0)
    await pg.none(
      `update contracts set resolution_time = now() where id = 'listed'`
    )
    const stats = await getPerpPoolStats(pg, 1)
    expect(stats.contracts[0].isResolved).toBe(true)
    expect(stats.points[0]).toMatchObject({ poolLong: 0, poolShort: 0 })
    expect(stats.flows.initialSubsidy).toBe(200)
  })

  it('carries closing snapshots across quiet days and respects the requested range', async () => {
    const today = dayjs().tz('America/Los_Angeles').startOf('day')
    await pg.none(`insert into contracts (id, slug, question, outcome_type, data)
      values ('history', 'history', 'Historical PERP', 'PERP',
      '{"poolLong":30,"poolShort":40,"oraclePrice":100,"creatorUsername":"creator"}')`)
    for (const [daysAgo, long] of [
      [3, 10],
      [1, 20],
    ]) {
      await pg.none(
        `insert into contract_perp_pool_events (
        contract_id, event_type, applied_ts, pool_long_before, pool_long_after,
        pool_short_before, pool_short_after
      ) values ('history', 'snapshot', $1, $2, $2, 40, 40)`,
        [today.subtract(daysAgo, 'day').add(12, 'hour').toISOString(), long]
      )
    }
    const full = await getPerpPoolStats(pg, 4)
    expect(
      full.contracts
        .find((contract) => contract.id === 'history')
        ?.points.map((point) => point.poolLong)
    ).toEqual([10, 10, 20, 30])
    const limited = await getPerpPoolStats(pg, 2)
    expect(
      limited.contracts
        .find((contract) => contract.id === 'history')
        ?.points.map((point) => point.poolLong)
    ).toEqual([20, 30])
  })

  it('returns no charts or cash totals when no listed markets remain', async () => {
    await pg.none(`update contracts set visibility = 'unlisted'`)
    const stats = await getPerpPoolStats(pg, 365)
    expect(stats.contracts).toEqual([])
    expect(stats.points).toEqual([])
    expect(stats.flows.cashIn).toBe(0)
    expect(stats.trackingStartTime).toBeNull()
  })
})
