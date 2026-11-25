import { recordBdlAttempt } from './request-stats'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'
import { BDL_LEAGUE_KEYS } from 'common/bdl/leagues'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { autoCreates, SPORTS_CALENDAR } from 'common/sports-calendar'
import type { SupabaseDirectClient } from '../supabase/init'
import { getBdlOperatorPanel } from './operator-panel-queries'

jest.mock('../supabase/init', () => ({
  pgp: jest.requireActual('pg-promise')(),
}))
jest.setTimeout(60_000)
const pgp = pgPromise()
let db: PGlite
const rows = async (sql: string, params?: unknown[]) =>
  (await db.query<Record<string, unknown>>(pgp.as.format(sql, params))).rows
const pg = {
  manyOrNone: rows,
  map: async (
    sql: string,
    params: unknown[],
    mapper: (value: Record<string, unknown>) => unknown
  ) => (await rows(sql, params)).map(mapper),
  none: async (sql: string, params?: unknown[]) => {
    await rows(sql, params)
  },
} as unknown as SupabaseDirectClient

const ddl = (name: string) =>
  readFileSync(resolve(__dirname, '../../../supabase', name), 'utf8')
const asOf = new Date('2026-11-20T15:00:00.000Z')
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table users(id text primary key);
    insert into users values ('admin');
    create table contracts(id text primary key, creator_id text, token text, visibility text,
      resolution text, deleted boolean, close_time timestamptz, mechanism text, data jsonb);`)
  await db.exec(ddl('sports_provider_request_stats.sql'))
  await db.exec(ddl('sports_competition_switches.sql'))
})
afterAll(async () => db.close())

it('separates trading and closed unresolved Odds inventory including pre-metadata games', async () => {
  const data = {
    sportsEventId: 'odds:basketball_nba:match',
    sportsLeague: 'NBA',
    sportsMarketType: 'moneyline',
  }
  const insert = (
    id: string,
    fields: Record<string, unknown> = {},
    columns: {
      owner?: string
      token?: string
      visibility?: string
      resolution?: string
      deleted?: boolean
      close?: string
      mechanism?: string
    } = {}
  ) =>
    db.query(
      'insert into contracts values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',
      [
        id,
        columns.owner ?? MANIFOLD_SPORTS_USER_IDS[0],
        columns.token ?? 'MANA',
        columns.visibility ?? 'public',
        columns.resolution,
        columns.deleted,
        columns.close,
        columns.mechanism ?? 'cpmm-multi-2',
        JSON.stringify({ ...data, ...fields }),
      ]
    )

  await insert('trading')
  await insert(
    'tagged-legacy',
    { sportsProvider: 'odds', sportsEventId: 'legacy-game' },
    { owner: MANIFOLD_SPORTS_USER_IDS[1], close: '2026-11-20T15:00:00.001Z' }
  )
  await insert(
    'historical-missing-type',
    { sportsMarketType: null, sportsLeague: null },
    { mechanism: 'cpmm-multi-1' }
  )
  await insert('exactly-closed', {}, { close: asOf.toISOString() })
  await insert(
    'historical-closed',
    { sportsMarketType: null },
    { close: '2016-01-01' }
  )
  await insert('closed-newer', {}, { close: '2026-11-20T14:59:59.999Z' })

  await insert('cash', {}, { token: 'CASH' })
  await insert('private', {}, { visibility: 'private' })
  await insert('deleted', {}, { deleted: true })
  await insert('unofficial', {}, { owner: 'someone' })
  await insert('resolved', {}, { resolution: 'CANCEL' })
  await insert('fixture-flag', { sportsFixture: true })
  await insert('fixture-id', {
    sportsProvider: 'odds',
    sportsEventId: 'fixture:nba:47',
  })
  await insert('alternate-provider', { sportsProvider: 'bdl' })
  await insert('spread', { sportsMarketType: 'spread' })
  await insert(
    'legacy-binary',
    { sportsMarketType: null },
    { mechanism: 'cpmm-1' }
  )
  await insert('missing-type-untyped-id', {
    sportsMarketType: null,
    sportsProvider: 'odds',
    sportsEventId: 'untyped-game',
  })
  await insert('malformed', { sportsEventId: 'odds:basketball_nba:' })
  await insert('unknown-key', { sportsEventId: 'odds:unverified_nba:44' })
  await insert('absent-id', { sportsEventId: null, sportsProvider: 'odds' })
  await insert('empty-id', { sportsEventId: '', sportsProvider: 'odds' })
  await insert('unverified', { sportsEventId: 'untyped-game' })
  await insert('conflicting-bdl-id', {
    sportsEventId: 'bdl:nba:501',
    sportsProvider: 'odds',
  })

  const soccer = { sportsLeague: 'Soccer' }
  await insert('epl', { ...soccer, sportsEventId: 'odds:soccer_epl:2026:9' })
  await insert(
    'ucl',
    { ...soccer, sportsEventId: 'odds:soccer_uefa_champs_league:9' },
    { close: asOf.toISOString() }
  )
  await insert('other-soccer', {
    ...soccer,
    sportsEventId: 'odds:soccer_fake:9',
  })
  await insert('ambiguous-label', {
    ...soccer,
    sportsProvider: 'odds',
    sportsEventId: 'legacy-game',
  })
  await insert('ncaab', {
    sportsLeague: 'NCAAB',
    sportsEventId: 'odds:basketball_ncaab:44',
  })
  const { leagues } = await getBdlOperatorPanel(pg, asOf)
  const row = (key: string) => leagues.find((l) => l.league === key)
  expect(row('nba')).toMatchObject({ openOdds: 3, closedOdds: 3 })
  expect(row('nfl')).toMatchObject({ openOdds: 0, closedOdds: 0 })
  expect(row('epl')).toMatchObject({ openOdds: 1, closedOdds: 0 })
  expect(row('ucl')).toMatchObject({ openOdds: 0, closedOdds: 1 })
  expect(row('ncaab')).toMatchObject({ openOdds: 1, closedOdds: 0 })
  expect(row('cbb')).toMatchObject({ openOdds: null, closedOdds: null })
  expect(
    leagues.reduce((total, league) => total + (league.openOdds ?? 0), 0)
  ).toBe(5)
  expect(
    leagues.reduce((total, league) => total + (league.closedOdds ?? 0), 0)
  ).toBe(4)
})

it('preserves lifetime HTTP totals, process scope, timestamps, absent quota and observed zero', async () => {
  const stamp = asOf.toISOString()
  const prior = '2026-11-19T00:15:00.000Z'
  await db.query(
    `insert into sports_provider_request_stats
    (provider,league_key,endpoint_template,process_role,success_count,unauthorized_count,rate_limited_count,
     other_count,last_status,last_request_at,last_success_at,quota_limit,quota_remaining) values
    ('bdl','nba','v2/odds','api',9007199254740993,2,3,4,429,$1,$2,600,0),
    ('bdl','nba','v2/odds','scheduler',0,1,0,0,401,$2,null,null,null),
    ('bdl','fifa/worldcup','v1/matches/{id}','recorder',1,0,0,0,200,$1,$1,null,null)`,
    [stamp, prior]
  )
  const { leagues } = await getBdlOperatorPanel(pg, asOf)
  expect(leagues.map((l) => l.league)).toEqual(BDL_LEAGUE_KEYS)
  expect(leagues.find((l) => l.league === 'nba')?.requests).toEqual([
    {
      provider: 'bdl',
      endpoint: 'v2/odds',
      role: 'api',
      successes: '9007199254740993',
      unauthorized: '2',
      throttled: '3',
      other: '4',
      status: 429,
      lastSuccess: prior,
      lastRequest: stamp,
      remaining: 0,
      limit: 600,
    },
    {
      provider: 'bdl',
      endpoint: 'v2/odds',
      role: 'scheduler',
      successes: '0',
      unauthorized: '1',
      throttled: '0',
      other: '0',
      status: 401,
      lastSuccess: null,
      lastRequest: prior,
      remaining: null,
      limit: null,
    },
  ])
  expect(leagues.find((l) => l.league === 'fifa/worldcup')).toMatchObject({
    vendorFreshness: null,
    recorderStatus: null,
    requests: [
      { endpoint: 'v1/matches/{id}', role: 'recorder', lastSuccess: stamp },
    ],
  })
  expect(leagues.find((l) => l.league === 'pga')).toMatchObject({
    openOdds: null,
    closedOdds: null,
    requests: [],
    phases: [],
  })
})

it('projects actual calendar defaults, stored phase switches and locks', async () => {
  const nba = SPORTS_CALENDAR.find(
    (p) => p.oddsKey === 'basketball_nba' && !p.locked
  )!
  const knockout = SPORTS_CALENDAR.find(
    (p) => p.oddsKey === 'soccer_uefa_champs_league' && !!p.locked
  )!
  for (const phase of [nba, knockout]) {
    await db.query(
      'insert into sports_competition_switches (competition_id,phase,enabled,updated_by) values ($1,$2,true,$3)',
      [phase.competitionId, phase.phase, 'admin']
    )
  }
  const { leagues } = await getBdlOperatorPanel(pg, asOf)
  const samePhase = (game: typeof nba) => ({
    competitionId: game.competitionId,
    phase: game.phase,
  })
  expect(leagues.find((l) => l.league === 'nba')?.phases).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        ...samePhase(nba),
        provider: 'odds',
        on: true,
        defaultOn: autoCreates(nba, {}),
      }),
    ])
  )
  expect(leagues.find((l) => l.league === 'ucl')?.phases).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        ...samePhase(knockout),
        on: false,
        defaultOn: false,
        locked: knockout.locked,
      }),
    ])
  )
  expect(leagues.find((l) => l.league === 'f1')).toMatchObject({
    openOdds: null,
    closedOdds: null,
    phases: expect.arrayContaining([
      expect.objectContaining({ provider: 'bdl' }),
    ]),
  })
})

it('shows the service’s real HTTP aggregates in the admin panel without exposing game IDs or payloads', async () => {
  const role = 'dev'
  const endpoint = 'v1/games/{id}'
  await pg.none(
    "delete from sports_provider_request_stats where provider = 'bdl' and league_key = $1 and endpoint_template = $2 and process_role = $3",
    ['nba', endpoint, role]
  )
  for (const [id, status, minute, remaining] of [
    [1041, 429, 1, 0],
    [1042, 200, 3, 3],
    [1043, 401, 2, 2],
  ]) {
    const attempt = {
      request: {
        path: '/nba/v1/games/' + id,
        at: new Date(Date.UTC(2026, 0, 1, 10, minute)).toISOString(),
        params: { cursor: 'sample-page-cursor' },
      },
      status,
      rateLimit: { limit: 10, remaining },
      body: { ignored: 'sample-provider-body' },
    }
    await recordBdlAttempt(pg, role, attempt)
  }
  const panel = await getBdlOperatorPanel(pg)
  const nba = panel.leagues.find((league) => league.league === 'nba')!
  const matching = nba.requests.filter(
    (request) => request.endpoint === endpoint && request.role === role
  )
  expect(matching).toHaveLength(1)
  expect(matching[0]).toMatchObject({
    provider: 'bdl',
    successes: '1',
    unauthorized: '1',
    throttled: '1',
    other: '0',
    status: 200,
    limit: 10,
    remaining: 3,
  })
  expect(matching[0].lastSuccess).toEqual(matching[0].lastRequest)
  expect(matching[0].lastSuccess).not.toBeNull()
  expect(JSON.stringify(nba)).not.toMatch(
    /sample-page-cursor|sample-provider-body|games\/104[123]/
  )
})

it('keeps providers distinct for one endpoint and includes leagues outside the BDL registry', async () => {
  await db.query(
    `insert into sports_provider_request_stats
      (provider, league_key, endpoint_template, process_role, last_status,
       success_count, last_request_at, last_success_at)
     values ('bdl','epl','v1/matches/{id}','api',200,2,$1,$1),
            ('football-data','epl','v1/matches/{id}','api',200,7,$1,$1),
            ('football-data','ENG-CH','/competitions/{code}/matches','api',200,3,$1,$1)`,
    [asOf.toISOString()]
  )
  const { leagues } = await getBdlOperatorPanel(pg, asOf)
  const epl = leagues.find((row) => row.league === 'epl')!
  expect(
    epl.requests.map(({ provider, endpoint, role, successes }) => [
      provider,
      endpoint,
      role,
      successes,
    ])
  ).toEqual([
    ['bdl', 'v1/matches/{id}', 'api', '2'],
    ['football-data', 'v1/matches/{id}', 'api', '7'],
  ])
  expect(leagues.find((row) => row.league === 'ENG-CH')).toMatchObject({
    openOdds: null,
    closedOdds: null,
    phases: [],
    requests: [
      {
        provider: 'football-data',
        endpoint: '/competitions/{code}/matches',
        successes: '3',
      },
    ],
  })
})
