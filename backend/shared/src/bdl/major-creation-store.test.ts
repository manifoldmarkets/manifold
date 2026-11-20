import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { BDL_REISSUED_EVENT_MATCH_WINDOW_MS } from 'common/bdl/constants'
import { existingMajorGroups, majorCreationHold } from './major-creation-store'

jest.mock('../supabase/init', () => ({
  pgp: jest.requireActual('pg-promise')(),
}))
jest.setTimeout(30000)
const pgp = pgPromise(),
  postgres = new PGlite()
const db = {
  manyOrNone: async (sql: string, params: unknown[]) =>
    (await postgres.query(pgp.as.format(sql, params))).rows,
} as Parameters<typeof majorCreationHold>[0]
const now = Date.parse('2026-11-21T13:00:00Z'),
  start = now + 3600000
const input = {
  league: 'mlb' as const,
  homeId: 10,
  awayId: 20,
  eventId: 'bdl:mlb:200',
  now,
  start,
  seenEventIds: ['bdl:mlb:200', 'bdl:mlb:101'],
}
const bdl = {
  sportsProvider: 'bdl',
  sportsLeagueKey: 'mlb',
  sportsLeague: 'MLB',
  sportsEventId: 'bdl:mlb:100',
  sportsMarketType: 'moneyline',
  sportsHomeTeamId: '10',
  sportsAwayTeamId: '20',
  sportsStartTimestamp: new Date(now - 1).toISOString(),
}
const odds = {
  sportsEventId: 'odds:baseball_mlb:abc',
  sportsMarketType: 'moneyline',
  sportsLeague: 'MLB',
  sportsStartTimestamp: new Date(start + 1).toISOString(),
}
async function insert(
  data: Record<string, unknown>,
  overrides: {
    creator?: string
    token?: string
    resolved?: string
    deleted?: boolean
    close?: number
  } = {}
) {
  await postgres.query(
    pgp.as.format(
      'insert into contracts values ($1,$2,$3,$4,$5,$6,$7::jsonb)',
      [
        'prior',
        overrides.creator ?? MANIFOLD_SPORTS_USER_IDS[0],
        overrides.token ?? 'MANA',
        overrides.resolved ?? null,
        overrides.deleted ?? false,
        overrides.close ? new Date(overrides.close) : null,
        data,
      ]
    )
  )
}
beforeAll(async () => {
  await postgres.exec(
    'create table contracts(id text,creator_id text,token text,resolution text,deleted boolean,close_time timestamptz,data jsonb); create table groups(id text,slug text,privacy_status text);'
  )
})
beforeEach(async () => {
  await postgres.exec('truncate contracts,groups')
})
afterAll(async () => {
  await postgres.close()
})
it('resolves only configured existing public or curated groups, in requested order', async () => {
  await postgres.exec(
    "insert into groups values ('id-public','one','public'),('id-curated','two','curated'),('id-secret','hidden','private')"
  )
  expect(await existingMajorGroups(db, ['two', 'one'])).toEqual([
    'id-curated',
    'id-public',
  ])
  expect(await existingMajorGroups(db, ['two', 'absent'])).toBeNull()
  expect(await existingMajorGroups(db, ['hidden'])).toBeNull()
})
it('holds only an earlier kickoff than the latest open official legacy Odds market', async () => {
  await insert(odds)
  expect(await majorCreationHold(db, input)).toBe(
    'before latest open Odds kickoff'
  )
  expect(await majorCreationHold(db, { ...input, start: start + 1 })).toBeNull()
})
it('holds a missing old ID with either home/away orientation only within seven days', async () => {
  for (const [h, a] of [
    ['10', '20'],
    ['20', '10'],
  ]) {
    await postgres.exec('truncate contracts')
    await insert({
      ...bdl,
      sportsHomeTeamId: h,
      sportsAwayTeamId: a,
      sportsStartTimestamp: new Date(
        start - BDL_REISSUED_EVENT_MATCH_WINDOW_MS
      ).toISOString(),
    })
    expect(await majorCreationHold(db, input)).toBe('possible-reid: prior')
    expect(
      await majorCreationHold(db, { ...input, start: start + 1 })
    ).toBeNull()
  }
})
it.each([
  ['ID present on schedule', { ...bdl, sportsEventId: 'bdl:mlb:101' }, {}],
  ['same candidate ID', { ...bdl, sportsEventId: input.eventId }, {}],
  ['other league', { ...bdl, sportsLeagueKey: 'nba' }, {}],
  ['other provider', { ...bdl, sportsProvider: 'football-data' }, {}],
  ['different home team', { ...bdl, sportsHomeTeamId: '30' }, {}],
  ['different away team', { ...bdl, sportsAwayTeamId: '30' }, {}],
  [
    'old kickoff still in future',
    { ...bdl, sportsStartTimestamp: new Date(now + 1).toISOString() },
    {},
  ],
  ['old kickoff unknown', { ...bdl, sportsStartTimestamp: 'TBD' }, {}],
  ['unofficial creator', odds, { creator: 'member' }],
  ['other currency', odds, { token: 'CASH' }],
  ['resolved market', odds, { resolved: 'CANCEL' }],
  ['deleted market', odds, { deleted: true }],
  ['fixture', { ...odds, sportsFixture: true }, {}],
  ['spread', { ...odds, sportsMarketType: 'spread' }, {}],
  ['closed odds game', odds, { close: now }],
  ['other odds league', { ...odds, sportsLeague: 'NHL' }, {}],
  ['unknown explicit provider', { ...odds, sportsProvider: 'fixture' }, {}],
] as const)('permits the candidate with %s', async (_, data, overrides) => {
  await insert(data, overrides)
  // The candidate's ID is not required in this coverage list to exclude itself.
  expect(
    await majorCreationHold(db, { ...input, seenEventIds: ['bdl:mlb:101'] })
  ).toBeNull()
})
