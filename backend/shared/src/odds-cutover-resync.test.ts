import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'
import { OddsMarketParams } from 'common/odds-markets'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { SPORTS_DATA_PROVIDERS } from 'common/sports-provider'
import { getSportsAttention } from './bdl/attention-queries'
import { SPORTS_CREATION_BUDGET_LOCK_SQL } from './bdl/major-settings'
import { reconcileOddsKickoff } from './odds-cutover-resync'
import { findSportsMarket } from './sports-market-dedupe'
import type { SupabaseDirectClient } from './supabase/init'

jest.mock('./supabase/init', () => ({
  pgp: jest.requireActual('pg-promise')(),
}))
jest.setTimeout(30000)
const pgp = pgPromise()
const table = 'sports_market_schedule_observations'
const migration = readFileSync(
  resolve(
    __dirname,
    '../../supabase/migrations/2026112201_sports_market_schedule_observations.sql'
  ),
  'utf8'
)
const owner = MANIFOLD_SPORTS_USER_IDS[0]
const first = '2099-09-25T09:00:00Z'
const shifted = '2099-09-25T20:00:00Z'
const now = Date.parse('2099-09-20T00:00:00Z')
const stamp = '2099-09-20T00:00:00.000002Z'
const prev = '2099-09-20T00:00:00.000001Z'
const next = '2099-09-20T00:00:00.000003Z'
const event = 'odds:baseball_mlb:canonical'
const params: OddsMarketParams = {
  outcomeType: 'MULTIPLE_CHOICE',
  answers: ['Road', 'Home'],
  question: 'New title',
  description: '',
  closeTime: Date.parse(shifted),
  sportsEventId: event,
  sportsStartTimestamp: shifted,
  sportsLeague: 'MLB',
  sportsHomeTeam: 'Home',
  sportsAwayTeam: 'Road',
  sportsMarketType: 'moneyline',
}
const opts = {
  observedAt: stamp,
  checkBdl: true,
  titleFor: () => 'Original title',
}
let db: PGlite
let original: string | undefined
let beforeTransaction: (() => Promise<void>) | undefined
const traced: string[] = []
function methods(connection: Pick<PGlite, 'query'>) {
  const query = async (sql: string, args?: unknown[]) => {
    traced.push(sql)
    return (await connection.query(pgp.as.format(sql, args))).rows
  }
  return {
    one: async (s: string, args?: unknown[]) => (await query(s, args))[0],
    oneOrNone: async (s: string, args?: unknown[]) =>
      (await query(s, args))[0] ?? null,
    manyOrNone: query,
    none: async (s: string, args?: unknown[]) => {
      await query(s, args)
    },
  }
}
function client() {
  return {
    ...methods(db),
    tx: async (run: (tx: ReturnType<typeof methods>) => Promise<unknown>) => {
      await beforeTransaction?.()
      return db.transaction((tx) => run(methods(tx)))
    },
  } as unknown as SupabaseDirectClient
}
beforeAll(async () => {
  original = process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to public,anon,authenticated,service_role;
    create table contracts(id text primary key,data jsonb not null,creator_id text not null default '${owner}',token text default 'MANA',
      mechanism text default 'cpmm-multi-2', resolution text,close_time timestamptz default '2099-12-31',deleted boolean default false,
      visibility text default 'public',slug text,question text generated always as (data->>'question') stored);`)
  await db.exec(migration)
  await db.exec(migration)
})
beforeEach(async () => {
  beforeTransaction = undefined
  traced.length = 0
  await db.exec('truncate contracts cascade')
})
afterAll(async () => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  else process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = original
  await db.close()
})
async function seed(
  id: string,
  overrides: Record<string, unknown> = {},
  resolution: string | null = null
) {
  await db.query(
    'insert into contracts(id,data,resolution,slug) values ($1,$2::jsonb,$3,$1)',
    [
      id,
      JSON.stringify({
        sportsEventId: event,
        sportsLeague: 'MLB',
        sportsMarketType: 'moneyline',
        sportsHomeTeam: 'Home',
        sportsAwayTeam: 'Road',
        sportsStartTimestamp: first,
        question: 'Original title',
        creatorUsername: 'ManifoldSports',
        ...overrides,
      }),
      resolution,
    ]
  )
}
const fields = async (id: string) =>
  (
    await db.query<{ data: Record<string, unknown> }>(
      'select data from contracts where id=$1',
      [id]
    )
  ).rows[0].data
const receipt = async (id: string) =>
  (
    await db.query<{
      counterpart_contract_ids: string[]
      same_event_contract_ids: string[]
      participant_mismatch: boolean
    }>(
      'select counterpart_contract_ids,same_event_contract_ids,participant_mismatch from sports_market_schedule_observations where contract_id=$1',
      [id]
    )
  ).rows[0]
it('acquires the league-wide funding lock before any row or matchup lock even for a different pair', async () => {
  await seed('odds')
  await reconcileOddsKickoff(client(), params, opts)
  const firstLock = traced.find(
    (s) => s.includes('advisory') || s.includes('for update')
  )
  expect(firstLock).toBe(SPORTS_CREATION_BUDGET_LOCK_SQL)
  expect(traced.some((s) => s.includes('for update of c'))).toBe(true)
  expect((await fields('odds')).sportsStartTimestamp).toBe(shifted)
})
it('preserves each persisted matchup and both plausible doubleheader IDs across a crash and retry with existing attention', async () => {
  await seed('odds', {
    sportsAttentionReason: 'Already investigating',
    sportsAttentionSince: now - 1000,
  })
  for (const [id, eventNumber, start] of [
    ['bdl-b', '102', '2099-09-26T02:00:00Z'],
    ['bdl-a', '101', '2099-09-25T14:00:00Z'],
    ['outside', '103', '2099-09-26T02:00:01Z'],
  ])
    await seed(id, {
      sportsEventId: 'bdl:mlb:' + eventNumber,
      sportsProvider: 'bdl',
      sportsStartTimestamp: start,
    })
  await seed('changed-pair', {
    sportsEventId: 'bdl:mlb:99',
    sportsProvider: 'bdl',
    sportsAwayTeam: 'Other',
    sportsStartTimestamp: shifted,
  })
  const disputed = { ...params, sportsAwayTeam: 'Other' }
  await reconcileOddsKickoff(client(), disputed, opts)
  const row = await fields('odds')
  expect(row).toMatchObject({
    sportsStartTimestamp: shifted,
    sportsAwayTeam: 'Road',
    question: 'Original title',
    sportsAttentionReason: 'Already investigating',
    sportsAttentionSince: now - 1000,
  })
  expect(JSON.stringify(row)).not.toMatch(
    /bdl-a|bdl-b|observed_at|participant_mismatch/
  )
  expect(await receipt('odds')).toEqual({
    counterpart_contract_ids: ['bdl-a', 'bdl-b'],
    same_event_contract_ids: [],
    participant_mismatch: true,
  })
  // A fresh worker knows only the database. Its unchanged kickoff still exposes both candidates.
  await reconcileOddsKickoff(client(), params, { ...opts, observedAt: next })
  const incident = (await getSportsAttention(client(), {}, now)).items.find(
    (r) => r.id === 'odds'
  )
  expect(incident).toMatchObject({
    since: now - 1000,
    reason:
      'Already investigating; overlaps open BDL markets bdl-a, bdl-b; provider participants differ from the stored market',
  })
})
it('updates every unresolved canonical sibling even when a resolved untyped match came first', async () => {
  await seed('0-final', { sportsMarketType: null }, 'YES')
  await seed('a', { sportsMarketType: null })
  await seed('b')
  await seed('wrong-type', { sportsMarketType: 'spread' })
  await seed('fixt', { sportsFixture: true })
  await seed('wrong-provider', { sportsProvider: 'bdl' })
  await seed('void', {}, 'CANCEL')
  await seed('deleted')
  await seed('community')
  await seed('cash')
  await db.exec(
    "update contracts set deleted=true where id='deleted';update contracts set creator_id='other' where id='community';update contracts set token='CASH' where id='cash'"
  )
  expect(await findSportsMarket(client(), event, 'moneyline')).toBeTruthy()
  await reconcileOddsKickoff(client(), params, opts)
  for (const id of ['a', 'b']) {
    expect((await fields(id)).sportsStartTimestamp).toBe(shifted)
    expect((await receipt(id)).same_event_contract_ids).toEqual(['a', 'b'])
  }
  for (const id of [
    '0-final',
    'fixt',
    'void',
    'wrong-type',
    'wrong-provider',
    'deleted',
    'community',
    'cash',
  ]) {
    expect((await fields(id)).sportsStartTimestamp).toBe(first)
    expect(await receipt(id)).toBeUndefined()
  }
})
it('rejects a proposal after the stored kickoff changed between the initial read and row lock', async () => {
  await seed('odds')
  beforeTransaction = async () => {
    await db.query(
      "update contracts set data=data||jsonb_build_object('sportsStartTimestamp',$1::text)",
      ['2099-09-25T18:00:00Z']
    )
  }
  expect(await reconcileOddsKickoff(client(), params, opts)).toContain(
    'superseded'
  )
  expect((await fields('odds')).sportsStartTimestamp).toBe(
    '2099-09-25T18:00:00Z'
  )
  expect(await receipt('odds')).toBeUndefined()
})
it('rejects delayed earlier HTTP observations and equal database clock ticks, including after an unchanged fresh read', async () => {
  await seed('odds')
  await reconcileOddsKickoff(
    client(),
    { ...params, sportsStartTimestamp: first },
    opts
  )
  for (const date of [prev, stamp])
    expect(
      await reconcileOddsKickoff(client(), params, {
        ...opts,
        observedAt: date,
      })
    ).toContain('superseded')
  expect((await fields('odds')).sportsStartTimestamp).toBe(first)
  await reconcileOddsKickoff(client(), params, { ...opts, observedAt: next })
  expect((await fields('odds')).sportsStartTimestamp).toBe(shifted)
})
it('keeps dry runs free of acquisition writes and locks', async () => {
  await seed('odds')
  expect(
    await reconcileOddsKickoff(client(), params, {
      ...opts,
      dryRun: true,
      observedAt: undefined,
    })
  ).toContain('would move')
  expect(await receipt('odds')).toBeUndefined()
  expect(traced).toHaveLength(1)
})
it('keeps schedule evidence private and keyed by market and supported provider', async () => {
  const sql = (q: string) => db.query(q)
  expect(
    (
      await sql(
        `select relrowsecurity from pg_class where oid='${table}'::regclass`
      )
    ).rows
  ).toEqual([{ relrowsecurity: true }])
  expect(
    (await sql(`select * from pg_policy where polrelid='${table}'::regclass`))
      .rows
  ).toEqual([])
  for (const role of ['anon', 'authenticated', 'service_role'])
    for (const privilege of [
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
    ]) {
      const allowed =
        role === 'service_role' &&
        ['SELECT', 'INSERT', 'UPDATE'].includes(privilege)
      expect(
        (
          await db.query('select has_table_privilege($1,$2,$3) as permitted', [
            role,
            table,
            privilege,
          ])
        ).rows
      ).toEqual([{ permitted: allowed }])
    }
  await seed('market')
  const put = (id: string, provider: string, date = stamp) =>
    db.query(
      `insert into ${table} (contract_id,provider,observed_at) values($1,$2,$3)`,
      [id, provider, date]
    )
  for (const provider of SPORTS_DATA_PROVIDERS) await put('market', provider)
  await expect(put('market', 'odds')).rejects.toMatchObject({ code: '23505' })
  await expect(put('unknown-id', 'bdl')).rejects.toMatchObject({
    code: '23503',
  })
  await expect(put('market', 'unknown')).rejects.toMatchObject({
    code: '23514',
  })
  await expect(put('market', 'odds', 'infinity')).rejects.toMatchObject({
    code: '23514',
  })
  await db.query('delete from contracts where id=$1', ['market'])
  expect((await sql(`select * from ${table}`)).rows).toEqual([])
})

it('excludes typed void, fixture, deleted, non-house and other-provider rows from exact Odds admission', async () => {
  await seed('fixture', { sportsFixture: true })
  await seed('wrong', { sportsProvider: 'bdl' })
  await seed('void', {}, 'CANCEL')
  await seed('deleted')
  await seed('other')
  await db.exec(
    "update contracts set deleted=true where id='deleted';update contracts set creator_id='different' where id='other'"
  )
  expect(await findSportsMarket(client(), event, 'moneyline')).toBeNull()
  await seed('canonical', { sportsMarketType: null }, 'YES')
  expect(await findSportsMarket(client(), event, 'moneyline')).toEqual({
    id: 'canonical',
  })
})

it('continues a confirmed kickoff correction when the historical timestamp and participant names are unusable', async () => {
  await seed('damaged', {
    sportsHomeTeam: ' ',
    sportsAwayTeam: ' ',
    sportsStartTimestamp: 'not-a-date',
  })
  const titleFor = jest.fn(() => {
    throw new Error('Invalid historical date')
  })
  await reconcileOddsKickoff(client(), params, { ...opts, titleFor })
  expect(titleFor).not.toHaveBeenCalled()
  expect((await fields('damaged')).sportsStartTimestamp).toBe(shifted)
  expect((await receipt('damaged')).participant_mismatch).toBe(true)
})
