import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'
import type { SupabaseDirectClient } from '../supabase/init'
import {
  bdlStatsEndpoint,
  recordBdlAttempt,
  recordSportsProviderResponse,
} from './request-stats'
import type { SportsDataProvider } from 'common/sports-provider'
import { BDL_LEAGUES } from 'common/bdl/leagues'
jest.mock('../monitoring/log', () => ({ log: { warn: jest.fn() } }))

const pgp = pgPromise()
let db: PGlite
const direct = {
  none: async (sql: string, params?: unknown[]) => {
    await db.query(pgp.as.format(sql, params))
  },
}
const pg = direct as unknown as SupabaseDirectClient
beforeAll(async () => {
  db = new PGlite()
  await db.exec(
    'create role anon; create role authenticated; create role service_role bypassrls'
  )
  await db.exec(
    readFileSync(
      resolve(__dirname, '../../../supabase/sports_provider_request_stats.sql'),
      'utf8'
    )
  )
})
beforeEach(async () => {
  await db.exec('truncate sports_provider_request_stats')
})
afterAll(async () => db.close())

function attempt(
  path: string,
  status: number,
  minute: number,
  limit: number | null,
  remaining: number | null
) {
  const at = new Date(Date.UTC(2026, 5, 1, 12, minute)).toISOString()
  return {
    request: { path, at, params: {} },
    status,
    rateLimit: { limit, remaining },
    body: null,
  }
}
it('aggregates each HTTP outcome across retries, keeps the most recent quota and latest successful attempt, and isolates endpoint/role/league', async () => {
  for (const [status, minute] of [
    [200, 2],
    [429, 8],
    [201, 4],
    [401, 1],
    [500, 3],
  ])
    await recordBdlAttempt(
      pg,
      'scheduler',
      attempt('/nba/v1/games/44', status, minute, 100 + minute, minute)
    )
  await recordBdlAttempt(
    pg,
    'scheduler',
    attempt('/nba/v1/games/45', 401, 7, 40, 0)
  )
  await recordBdlAttempt(pg, 'api', attempt('/nba/v1/games/44', 200, 2, 33, 1))
  await recordBdlAttempt(
    pg,
    'scheduler',
    attempt('/nhl/v1/games/44', 200, 2, 33, 1)
  )
  await recordBdlAttempt(
    pg,
    'scheduler',
    attempt('/nba/v2/odds', 200, 2, 33, 1)
  )
  await recordBdlAttempt(
    pg,
    'scheduler',
    attempt('/nba/v1/games/44?cursor=private', 401, 10, null, null)
  )
  await recordBdlAttempt(
    pg,
    'scheduler',
    attempt('/account/v1/keys', 401, 10, null, null)
  )
  const { rows } =
    await db.query(`select league_key,endpoint_template,process_role,success_count::int as ok,unauthorized_count::int as unauthorized,
    rate_limited_count::int as limited,other_count::int as other,last_status,quota_limit,quota_remaining,
    extract(minute from last_success_at)::int as success_minute, extract(minute from last_request_at)::int as last_minute from sports_provider_request_stats order by league_key, endpoint_template,process_role`)
  expect(rows).toHaveLength(4)
  expect(rows).toContainEqual({
    league_key: 'nba',
    endpoint_template: 'v1/games/{id}',
    process_role: 'scheduler',
    ok: 2,
    unauthorized: 2,
    limited: 1,
    other: 1,
    last_status: 429,
    quota_limit: 108,
    quota_remaining: 8,
    success_minute: 4,
    last_minute: 8,
  })
})
it('stores malformed or out-of-range numeric quota headers as unknown', async () => {
  await recordBdlAttempt(
    pg,
    'scheduler',
    attempt('/nba/v1/games', 200, 1, 3.5, 999999999999)
  )
  expect(
    (
      await db.query(
        'select quota_limit,quota_remaining from sports_provider_request_stats'
      )
    ).rows
  ).toEqual([{ quota_limit: null, quota_remaining: null }])
})

it('keeps both boundaries of HTTP success, integer quotas and null headers on the newest attempt', async () => {
  for (const [state, minute] of [
    [199, 1],
    [299, 4],
    [300, 5],
    [200, 0],
  ]) {
    await recordBdlAttempt(
      pg,
      'scheduler',
      attempt(
        '/nfl/v1/odds',
        state,
        minute,
        minute === 5 ? null : 2147483647,
        minute === 5 ? -1 : 0
      )
    )
  }
  const { rows } =
    await db.query(`select success_count::int as ok,other_count::int as other,
    last_status,quota_limit,quota_remaining,extract(minute from last_success_at)::int as good from sports_provider_request_stats`)
  expect(rows).toEqual([
    {
      ok: 2,
      other: 2,
      last_status: 300,
      quota_limit: null,
      quota_remaining: null,
      good: 4,
    },
  ])
})

it.each(['nba', 'wnba', 'mlb', 'nhl', 'nfl'] as const)(
  'classifies %s service reads using the registry versions',
  (league) => {
    const config = BDL_LEAGUES[league]
    expect(bdlStatsEndpoint(config.apiBase + '/games')).toEqual({
      league,
      template: 'v1/games',
    })
    expect(bdlStatsEndpoint(config.apiBase + '/games/57399')).toEqual({
      league,
      template: 'v1/games/{id}',
    })
    expect(bdlStatsEndpoint(config.oddsApiBase + '/odds/opening')).toEqual({
      league,
      template: (league === 'nba' ? 'v2' : 'v1') + '/odds/opening',
    })
  }
)
it.each([
  ['/fifa/worldcup/v1/matches/3', 'fifa/worldcup', 'v1/matches/{id}'],
  ['/nba/v1/box_scores/live', 'nba', 'v1/box_scores/live'],
  ['/nfl/v1/teams/33/roster', 'nfl', 'v1/teams/{id}/roster'],
  ['/nhl/v1/plays', 'nhl', 'v1/plays'],
])('classifies %s without storing path identifiers', (path, league, template) =>
  expect(bdlStatsEndpoint(path)).toEqual({ league, template })
)
it.each([
  '/nba/v1/games/42?secret=private',
  '/nba/v1/games/private',
  '/nba/v1/teams/42/private',
  '/nba/v1/games/00000',
  '/account/v1/keys',
  '/bogus/v1/games',
  '/nba/v1/odds',
  '/nba/v2/games',
  '/nba/v1/games\n',
  '/nba/v1/games/%2f',
])('does not persist arbitrary or unclassified paths: %s', async (path) => {
  const sink = { none: jest.fn() }
  await recordBdlAttempt(sink, 'dev', attempt(path, 401, 1, 100, 0))
  expect(sink.none).not.toHaveBeenCalled()
})

it('keeps simultaneous same-key responses atomic within each provider', async () => {
  const observed = {
    at: '2026-06-01T12:02:00Z',
    status: 200,
    rateLimit: { limit: 100, remaining: 75 },
  }
  const stale = {
    at: '2026-06-01T12:01:00Z',
    status: 429,
    rateLimit: { limit: 100, remaining: 0 },
  }
  const key = { league: 'nba', template: 'v1/games/{id}' }
  await Promise.all(
    Array.from({ length: 5 }, () =>
      recordSportsProviderResponse(
        pg,
        { ...key, provider: 'odds' },
        'dev',
        observed
      )
    )
  )
  await Promise.all([
    recordSportsProviderResponse(
      pg,
      { ...key, provider: 'odds' },
      'dev',
      stale
    ),
    recordBdlAttempt(pg, 'dev', attempt('/nba/v1/games/11', 401, 3, 90, 1)),
  ])
  const { rows } = await db.query(
    'select provider, success_count::int,rate_limited_count::int,unauthorized_count::int,last_status,quota_remaining from sports_provider_request_stats order by provider'
  )
  expect(rows).toEqual([
    {
      provider: 'bdl',
      success_count: 0,
      rate_limited_count: 0,
      unauthorized_count: 1,
      last_status: 401,
      quota_remaining: 1,
    },
    {
      provider: 'odds',
      success_count: 5,
      rate_limited_count: 1,
      unauthorized_count: 0,
      last_status: 200,
      quota_remaining: 75,
    },
  ])
})

it.each([
  ['unknown-feed', 'nba', 'games'],
  ['fixture', 'nba', 'games'],
  ['legacy', 'nba', 'games'],
  ['toString', 'nba', 'games'],
  ['odds', '', 'games'],
  ['odds', '/nba', 'games'],
  ['odds', 'nba?secret', 'games'],
  ['odds', 'nba\n', 'games'],
  ['odds', 'a'.repeat(65), 'games'],
  ['odds', 'nba', ''],
  ['odds', 'nba', '   '],
  ['odds', 'nba', 'games?key=value'],
  ['odds', 'nba', 'games\n'],
  ['odds', 'nba', 'a'.repeat(129)],
  ['bdl', 'foreign', 'v1/games'],
  ['bdl', 'nba', 'v1/games/73'],
  ['bdl', 'nba', 'v2/games'],
  ['bdl', 'nba', 'unclassified'],
])(
  'rejects invalid stats dimensions before touching SQL: %j %j %j',
  async (provider, league, template) => {
    const sink = { none: jest.fn() }
    await expect(
      recordSportsProviderResponse(
        sink,
        { provider: provider as SportsDataProvider, league, template },
        'dev',
        {
          status: 200,
          at: '2026-06-01T12:00:00Z',
          rateLimit: { limit: null, remaining: null },
        }
      )
    ).rejects.toThrow('Invalid sports request statistics key')
    expect(sink.none).not.toHaveBeenCalled()
  }
)

it.each([0x00a0, 0x2007, 0x202f, 0xfeff])(
  'treats Unicode-only blank templates identically in the writer and SQL (code point %i)',
  async (codePoint) => {
    const spaces = ' ' + String.fromCodePoint(codePoint) + ' '
    const key = { provider: 'odds' as const, league: 'nba', template: spaces }
    const observation = {
      status: 200,
      at: '2026-06-01T12:00:00Z',
      rateLimit: { limit: null, remaining: null },
    }
    await expect(
      recordSportsProviderResponse(pg, key, 'dev', observation)
    ).rejects.toThrow('Invalid sports request statistics key')
    await expect(
      db.query(
        "insert into sports_provider_request_stats (provider,league_key,endpoint_template,process_role,other_count,last_status,last_request_at) values ('odds','nba',$1,'dev',1,500,now())",
        [spaces]
      )
    ).rejects.toMatchObject({ code: '23514' })
    await recordSportsProviderResponse(
      pg,
      { ...key, template: spaces + 'results' },
      'dev',
      observation
    )
  }
)
