import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'

import { BDL_OPEN_ODDS_MATCH_WINDOW_MS } from 'common/bdl/constants'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'

import {
  findLockedSportsMarket,
  findSportsMarket,
} from './sports-market-dedupe'

jest.mock('./supabase/init', () => ({
  pgp: jest.requireActual('pg-promise')(),
}))
jest.setTimeout(30_000)
const pgp = pgPromise()
let pg: PGlite
const locks: string[] = []
const tx = {
  one: async (sql: string, params: string[]) => {
    const result = await pg.query(pgp.as.format(sql, params))
    locks.push(params[0])
    return result.rows[0]
  },
  oneOrNone: async (sql: string, params: unknown[]) =>
    (await pg.query(pgp.as.format(sql, params))).rows[0] ?? null,
  manyOrNone: async (sql: string, params: unknown[]) =>
    (await pg.query(pgp.as.format(sql, params))).rows,
} as unknown as Parameters<typeof findLockedSportsMarket>[0]
const candidate = {
  sportsEventId: 'bdl:mlb:410',
  sportsProvider: 'bdl' as const,
  sportsLeagueKey: 'mlb' as const,
  sportsLeague: 'MLB',
  sportsStartTimestamp: '2099-11-20T03:30:00Z',
  sportsHomeTeam: 'Montréal FC',
  sportsAwayTeam: 'Harbor & Bay',
}
const odds = {
  sportsEventId: 'odds:baseball_mlb:123',
  sportsLeague: 'MLB',
  sportsMarketType: 'moneyline',
  sportsStartTimestamp: candidate.sportsStartTimestamp,
  sportsHomeTeam: 'Harbor and Bay',
  sportsAwayTeam: 'Montreal',
}
type RecordOptions = {
  creator?: string
  token?: string
  resolution?: string
  close?: string
  deleted?: boolean
}
async function insert(
  id: string,
  data: Record<string, unknown>,
  opts: RecordOptions = {}
) {
  await pg.query(
    'insert into contracts(id,creator_id,token,resolution,close_time,deleted,data) values ($1,$2,$3,$4,$5,$6,$7::jsonb)',
    [
      id,
      opts.creator ?? MANIFOLD_SPORTS_USER_IDS[0],
      opts.token ?? 'MANA',
      opts.resolution ?? null,
      opts.close ?? '2099-12-01',
      opts.deleted ?? false,
      JSON.stringify(data),
    ]
  )
}
beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(
    "create table contracts(id text primary key,creator_id text,token text,resolution text,close_time timestamptz,deleted boolean,data jsonb, mechanism text default 'cpmm-multi-2')"
  )
})
beforeEach(async () => {
  locks.length = 0
  await pg.exec('truncate contracts')
})
afterAll(async () => pg.close())

it('counts an official cancelled BDL event only when opted in, including hidden or deleted rows', async () => {
  await insert(
    'cancelled',
    { ...candidate, sportsMarketType: 'moneyline' },
    { resolution: 'CANCEL', deleted: true }
  )
  expect(
    await findSportsMarket(tx, candidate.sportsEventId, 'moneyline')
  ).toBeNull()
  expect(
    await findSportsMarket(tx, candidate.sportsEventId, 'moneyline', true)
  ).toEqual({ id: 'cancelled' })
  expect(await findLockedSportsMarket(tx, candidate, 'moneyline')).toEqual({
    id: 'cancelled',
  })
  expect(locks).toEqual(['sports-moneyline:' + candidate.sportsEventId])
})

it('exempts only the individually selected canceled moneyline and still detects a replacement', async () => {
  const matching = { ...candidate, sportsMarketType: 'moneyline' }
  await insert('canceled', matching, { resolution: 'CANCEL' })
  expect(
    await findLockedSportsMarket(tx, candidate, 'moneyline', 'bdl:mlb:999')
  ).toEqual({ id: 'canceled' })
  expect(
    await findLockedSportsMarket(
      tx,
      candidate,
      'moneyline',
      candidate.sportsEventId
    )
  ).toBeNull()
  await insert('replacement', matching)
  expect(
    await findLockedSportsMarket(
      tx,
      candidate,
      'moneyline',
      candidate.sportsEventId
    )
  ).toEqual({ id: 'replacement' })
  await pg.query("update contracts set resolution='YES' where id='replacement'")
  expect(
    await findLockedSportsMarket(
      tx,
      candidate,
      'moneyline',
      candidate.sportsEventId
    )
  ).toEqual({ id: 'replacement' })
  await insert(
    'canceled-total',
    { ...matching, sportsMarketType: 'total' },
    { resolution: 'CANCEL' }
  )
  expect(
    await findLockedSportsMarket(
      tx,
      candidate,
      'total',
      candidate.sportsEventId
    )
  ).toEqual({ id: 'canceled-total' })
})

it('reserves a BDL type regardless of resolution while distinct event IDs and sibling types stay independent', async () => {
  await insert('other-bdl', {
    ...candidate,
    sportsEventId: 'bdl:mlb:409',
    sportsMarketType: 'moneyline',
  })
  await insert('sibling', { ...candidate, sportsMarketType: 'total' })
  await insert(
    'community',
    { ...candidate, sportsMarketType: 'moneyline' },
    { creator: 'reader' }
  )
  await insert(
    'other-token',
    { ...candidate, sportsMarketType: 'moneyline' },
    { token: 'CASH' }
  )
  expect(await findLockedSportsMarket(tx, candidate, 'moneyline')).toBeNull()
  await insert(
    'exact',
    { ...candidate, sportsMarketType: 'moneyline' },
    { resolution: 'YES' }
  )
  expect(await findLockedSportsMarket(tx, candidate, 'moneyline')).toEqual({
    id: 'exact',
  })
})

it.each([-1, 1])(
  'blocks an open official Odds pair in either order at the inclusive %d × six-hour boundary',
  async (direction) => {
    const edge = new Date(
      Date.parse(candidate.sportsStartTimestamp) +
        direction * BDL_OPEN_ODDS_MATCH_WINDOW_MS
    ).toISOString()
    await insert('match', { ...odds, sportsStartTimestamp: edge })
    expect(
      await findLockedSportsMarket(tx, candidate, 'moneyline')
    ).toMatchObject({ id: 'match' })
    expect(locks).toEqual([
      'sports-moneyline:bdl:mlb:410',
      'sports-moneyline:mlb:2099-11-19:harbor and bay:montreal',
      'sports-moneyline:mlb:2099-11-20:harbor and bay:montreal',
    ])
  }
)

it('temporarily skips MLB game two while the earlier same-team Odds moneyline is open, then allows a retry', async () => {
  const gameTwo = {
    ...candidate,
    sportsEventId: 'bdl:mlb:411',
    sportsStartTimestamp: new Date(
      Date.parse(candidate.sportsStartTimestamp) + 3 * 60 * 60_000
    ).toISOString(),
  }
  await insert('odds-game-one', odds)
  expect(await findLockedSportsMarket(tx, gameTwo, 'moneyline')).toMatchObject({
    id: 'odds-game-one',
  })

  await pg.query(
    "update contracts set close_time = '2000-01-01' where id = $1",
    ['odds-game-one']
  )
  expect(await findLockedSportsMarket(tx, gameTwo, 'moneyline')).toBeNull()
})

const unmatched: [string, Record<string, unknown>, RecordOptions][] = [
  [
    'outside window',
    {
      sportsStartTimestamp: new Date(
        Date.parse(candidate.sportsStartTimestamp) +
          BDL_OPEN_ODDS_MATCH_WINDOW_MS +
          1
      ).toISOString(),
    },
    {},
  ],
  ['invalid kickoff', { sportsStartTimestamp: 'unknown' }, {}],
  ['mismatched opponent', { sportsHomeTeam: 'Another club' }, {}],
  ['other SportId', { sportsLeague: 'NBA' }, {}],
  ['a different BDL event', { sportsEventId: 'bdl:mlb:421' }, {}],
  ['another type', { sportsMarketType: 'spread' }, {}],
  ['unofficial creator', {}, { creator: 'unofficial' }],
  ['other currency', {}, { token: 'CASH' }],
  ['resolved', {}, { resolution: 'YES' }],
  ['closed', {}, { close: '2000-01-01' }],
  ['deleted', {}, { deleted: true }],
  ['fixture marked on Odds row', { sportsFixture: true }, {}],
  [
    'explicit provider overrides the Odds prefix',
    { sportsProvider: 'fixture' },
    {},
  ],
]
it.each(unmatched)(
  'ignores %s for cross-provider matching',
  async (_name, fields, opts) => {
    await insert('unrelated', { ...odds, ...fields }, opts)
    expect(await findLockedSportsMarket(tx, candidate, 'moneyline')).toBeNull()
  }
)
const originalEnv = process.env
afterEach(() => {
  process.env = originalEnv
})
it('reserves a roleless canonical major game for both an exact Odds retry and an opposite BDL retry', async () => {
  process.env = { ...process.env, NEXT_PUBLIC_SPORTS_BDL_ENABLED: 'true' }
  await insert('historic', {
    ...odds,
    sportsLeague: undefined,
    sportsMarketType: undefined,
  })
  expect(await findSportsMarket(tx, odds.sportsEventId, 'moneyline')).toEqual({
    id: 'historic',
  })
  expect(await findLockedSportsMarket(tx, odds, 'moneyline')).toEqual({
    id: 'historic',
  })
  expect(
    await findLockedSportsMarket(tx, candidate, 'moneyline')
  ).toMatchObject({ id: 'historic' })
  await pg.exec("update contracts set mechanism = 'cpmm-1'")
  expect(await findLockedSportsMarket(tx, candidate, 'moneyline')).toBeNull()
  expect(await findSportsMarket(tx, odds.sportsEventId, 'moneyline')).toBeNull()
})

it.each([
  ['one matching side', { sportsAwayTeam: undefined }, true],
  ['a placeholder', { sportsAwayTeam: 'TBD' }, true],
  ['missing kickoff', { sportsStartTimestamp: null }, true],
  [
    'unrelated known side',
    { sportsHomeTeam: 'Other', sportsAwayTeam: null },
    false,
  ],
  [
    'outside the window',
    { sportsAwayTeam: null, sportsStartTimestamp: '2099-11-23T00:00:00Z' },
    false,
  ],
  [
    'wrong league prefix',
    { sportsEventId: 'odds:basketball_nba:other' },
    false,
  ],
  ['noncanonical key', { sportsEventId: 'odds:baseball_mlb:' }, false],
] as const)(
  'checks an unstamped opposite market with %s',
  async (_, extra, blocks) => {
    process.env = { ...process.env, NEXT_PUBLIC_SPORTS_BDL_ENABLED: 'true' }
    await insert('historical', {
      ...odds,
      sportsLeague: undefined,
      sportsMarketType: undefined,
      ...extra,
    })
    expect(!!(await findLockedSportsMarket(tx, candidate, 'moneyline'))).toBe(
      blocks
    )
  }
)

it.each(['bdl:nfl:410', 'bdl:mlb:410:prop', 'bdl:mlb:unknown'])(
  'holds a major moneyline with mismatched or noncanonical event %s',
  async (sportsEventId) => {
    process.env = { ...process.env, NEXT_PUBLIC_SPORTS_BDL_ENABLED: 'true' }
    await expect(
      findLockedSportsMarket(tx, { ...candidate, sportsEventId }, 'moneyline')
    ).rejects.toThrow('identity')
  }
)

it('uses only the original event lock for a legacy Odds moneyline with rollout off', async () => {
  process.env = { ...process.env }
  delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  await insert('bdl-counterpart', {
    ...candidate,
    sportsMarketType: 'moneyline',
  })
  expect(
    await findLockedSportsMarket(tx, odds, 'moneyline', undefined, true)
  ).toBeNull()
  expect(locks).toEqual(['sports-moneyline:' + odds.sportsEventId])
})
it('only compares Odds markets for BDL moneylines', async () => {
  process.env = { ...process.env, NEXT_PUBLIC_SPORTS_BDL_ENABLED: 'true' }
  await insert('odds-market', odds)
  expect(await findLockedSportsMarket(tx, candidate, 'winner')).toBeNull()
  const anotherOdds = { ...odds, sportsEventId: 'odds:baseball_mlb:other' }
  expect(await findLockedSportsMarket(tx, anotherOdds, 'moneyline')).toBeNull()
  expect(locks).toContain(
    'sports-moneyline:mlb:2099-11-19:harbor and bay:montreal'
  )
})
it.each([
  { sportsLeagueKey: undefined },
  { sportsHomeTeam: 'FC' },
  { sportsAwayTeam: undefined },
  { sportsAwayTeam: 'Montreal' },
  { sportsStartTimestamp: 'invalid' },
])(
  'refuses a BDL moneyline with an unusable matchup key',
  async (overrides) => {
    await expect(
      findLockedSportsMarket(tx, { ...candidate, ...overrides }, 'moneyline')
    ).rejects.toThrow('deduplication')
  }
)

it('preserves preexisting lookup behavior for football-data and unidentifiable Odds pairs', async () => {
  const legacy = { ...odds, sportsEventId: 'fd-123' }
  expect(await findLockedSportsMarket(tx, legacy, 'moneyline')).toBeNull()
  expect(locks).toEqual(['sports-moneyline:fd-123'])
  const incomplete = { ...odds, sportsHomeTeam: undefined }
  expect(await findLockedSportsMarket(tx, incomplete, 'moneyline')).toBeNull()
})

it('protects an open BDL moneyline when an operator switches back to Odds without changing other legacy lookups', async () => {
  process.env = { ...process.env, NEXT_PUBLIC_SPORTS_BDL_ENABLED: 'true' }
  await insert('bdl-game', { ...candidate, sportsMarketType: 'moneyline' })
  const latest = { ...odds, sportsEventId: 'odds:baseball_mlb:switched-back' }
  expect(await findLockedSportsMarket(tx, latest, 'moneyline')).toBeNull()
  expect(
    await findLockedSportsMarket(tx, latest, 'moneyline', undefined, true)
  ).toEqual(expect.objectContaining({ id: 'bdl-game' }))
  await expect(
    findLockedSportsMarket(
      tx,
      { ...latest, sportsHomeTeam: undefined },
      'moneyline',
      undefined,
      true
    )
  ).rejects.toThrow('deduplication')
})
