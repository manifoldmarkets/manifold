import { readFileSync } from 'fs'
import { join } from 'path'
import { pgp } from 'shared/supabase/init'
import { getPerpPoolStats } from './pool-stats'

const databaseUrl = process.env.PERP_POOL_STATS_TEST_DATABASE_URL
const integration = databaseUrl ? describe : describe.skip

integration('hourly PERP stats', () => {
  const schema = `perp_stats_${Date.now()}`
  const connection = new URL(
    databaseUrl ?? 'postgres://localhost/perp_stats_test'
  )
  connection.searchParams.set('options', `-c search_path=${schema}`)
  const pg = pgp(connection.toString())
  let created = false
  const migration = readFileSync(
    join(
      __dirname,
      '../../../supabase/migrations/2026090701_add_perp_hourly_stats.sql'
    ),
    'utf8'
  )
  const capture = () => pg.one('select capture_perp_hourly_stats()')
  const stats = () => getPerpPoolStats(pg, 365)

  beforeAll(async () => {
    const url = new URL(databaseUrl!)
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.pathname !== '/perp_stats_test'
    )
      throw new Error('Use a disposable local database named perp_stats_test')
    await pg.none('create schema $1:name', [schema])
    created = true
    await pg.none(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
      end $$;
      create table contracts (
        id text primary key, slug text, question text, resolution_time timestamptz,
        created_time timestamptz default now() - interval '10 days', outcome_type text,
        visibility text default 'public', deleted boolean default false, data jsonb not null
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
      create table contract_perp_funding_events (
        contract_id text, ts timestamptz, pool_long_after numeric,
        pool_short_after numeric, oracle_price numeric
      );
      insert into contracts (id, slug, question, outcome_type, data) values
        ('listed', 'listed-perp', 'Listed PERP', 'PERP',
         '{"poolLong":150,"poolShort":150,"oraclePrice":110,"creatorUsername":"creator"}');
      insert into contract_perp_positions values
        ('listed','long-user','long',200,100,100,0,100,2,50,now(),now()),
        ('listed','short-user','short',200,100,100,0,100,2,150,now(),now());
      insert into contract_perp_funding_events values
        ('listed',now()-interval '2 days',120,130,100);
    `)
    await pg.multi(migration)
  })
  afterAll(async () => {
    if (created) await pg.none('drop schema $1:name cascade', [schema])
    await pg.$pool.end()
  })

  it('captures pool minus both marked trader claims, without treating margin as house money', async () => {
    const result = await stats()
    expect(result.points.at(-1)).toMatchObject({
      totalPool: 300,
      houseLiquidity: 100,
      isEstimate: false,
    })
    expect(result.lastCaptureTime).not.toBeNull()
    expect(result.contracts[0].markedPositionValue).toBeCloseTo(200)
  })

  it('backfills recorded backing, leaving uncomputed house value unknown', async () => {
    const result = await stats()
    expect(result.points[0]).toMatchObject({
      totalPool: 250,
      houseLiquidity: null,
      isEstimate: true,
    })
    // No observation yesterday: no carried-forward invented data point.
    expect(result.points).toHaveLength(2)
  })

  it('retries replace the current hour and migration reruns preserve history', async () => {
    await capture()
    await pg.multi(migration)
    const result = await pg.one<{ count: number }>(
      'select count(*)::int as count from contract_perp_hourly_stats'
    )
    expect(result.count).toBe(2)
  })

  it('trading changes do not write stats; the next capture records them', async () => {
    await pg.none(
      `update contracts set data = data || '{"poolLong":175}' where id='listed'`
    )
    expect((await stats()).points.at(-1)?.totalPool).toBe(300)
    await capture()
    expect((await stats()).points.at(-1)?.totalPool).toBe(325)
  })

  it('floors each losing claim separately and retains negative house equity', async () => {
    await pg.none(
      `update contracts set data = data || '{"oraclePrice":300}' where id='listed'`
    )
    await capture()
    expect((await stats()).points.at(-1)?.houseLiquidity).toBe(-175)
  })

  it('a failed capture leaves prior observations and trading state intact', async () => {
    await pg.none(
      `update contract_perp_positions set entry_price=0 where user_id='long-user'`
    )
    await expect(capture()).rejects.toThrow()
    expect(
      (
        await pg.one(
          "select total_pool from contract_perp_hourly_stats where source='snapshot'"
        )
      ).total_pool
    ).toBe(325)
    await pg.none(
      `update contract_perp_positions set entry_price=100 where user_id='long-user'`
    )
  })

  it('filters unlisted, deleted and non-perp markets from history and cash totals', async () => {
    await pg.none(`
      insert into contracts (id, outcome_type, visibility, deleted, data) values
        ('hidden','PERP','unlisted',false,'{"poolLong":500,"poolShort":500,"oraclePrice":100}'),
        ('deleted','PERP','public',true,'{"poolLong":500,"poolShort":500,"oraclePrice":100}'),
        ('binary','BINARY','public',false,'{}');
      insert into txns values
        ('bank','listed','BANK','CONTRACT','CREATE_CONTRACT_ANTE',100,'M$'),
        ('bank','hidden','BANK','CONTRACT','CREATE_CONTRACT_ANTE',900,'M$'),
        ('bank','deleted','BANK','CONTRACT','CREATE_CONTRACT_ANTE',900,'M$'),
        ('bank','binary','BANK','CONTRACT','CREATE_CONTRACT_ANTE',900,'M$');
    `)
    await capture()
    const result = await stats()
    expect(result.contracts.map((c) => c.id)).toEqual(['listed'])
    expect(result.flows.initialSubsidy).toBe(100)
    expect(result.points.at(-1)?.totalPool).toBe(325)
  })

  it('does not publish partial sitewide totals when a newly listed market has gaps', async () => {
    await pg.none(`update contracts set visibility='public' where id='hidden'`)
    const result = await stats()
    expect(result.points).toHaveLength(1)
    expect(result.points[0].totalPool).toBe(1325)
    await pg.none(
      `update contracts set visibility='unlisted' where id='hidden'`
    )
  })

  it('shows zero after resolution and supports an empty listed set', async () => {
    await pg.none(
      `update contracts set resolution_time=now(), data=data || '{"poolLong":0,"poolShort":0}' where id='listed'; delete from contract_perp_positions where contract_id='listed'`
    )
    await capture()
    expect((await stats()).points.at(-1)).toMatchObject({
      totalPool: 0,
      houseLiquidity: 0,
    })
    await pg.none(
      `update contracts set visibility='unlisted' where id='listed'`
    )
    expect(await stats()).toMatchObject({
      contracts: [],
      points: [],
      lastCaptureTime: null,
    })
  })
})
