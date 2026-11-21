import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'
import {
  BDL_CANCELLATION_HOLD_MS,
  BDL_OVERDUE_ALERT_MS,
} from 'common/bdl/constants'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import type { SupabaseDirectClient } from '../supabase/init'
import { getSportsAttention } from './attention-queries'

jest.mock('../supabase/init', () => ({
  pgp: jest.requireActual('pg-promise')(),
}))
jest.setTimeout(60_000)
const now = Date.parse('2026-11-21T15:00:00Z')
const due = now - BDL_OVERDUE_ALERT_MS
const pgp = pgPromise()
let db: PGlite
let statement: string
const pg = {
  manyOrNone: async (sql: string, args: unknown[]) => {
    statement = pgp.as.format(sql, args)
    return (await db.query(statement)).rows
  },
} as unknown as SupabaseDirectClient

type Sample = {
  id: string
  data?: Record<string, unknown>
  close?: number | null
  owner?: string
  token?: string
  visibility?: string
  resolution?: string
  deleted?: boolean
  slug?: string
}
async function seed(...samples: Sample[]) {
  const values = samples.map(
    ({
      id,
      data,
      close,
      owner,
      token,
      visibility,
      resolution,
      deleted,
      slug,
    }) => ({
      id,
      close: close === null ? null : new Date(close ?? due - 1).toISOString(),
      owner: owner ?? MANIFOLD_SPORTS_USER_IDS[0],
      token: token ?? 'MANA',
      visibility: visibility ?? 'public',
      resolution,
      deleted,
      slug: slug ?? id,
      data: {
        sportsEventId: 'bdl:nba:123',
        sportsLeague: 'NBA',
        sportsMarketType: 'moneyline',
        creatorUsername: 'SportsBot',
        ...data,
      },
    })
  )
  await db.query(
    `insert into contracts (id,close_time,creator_id,token,visibility,resolution,deleted,question,slug,data)
    select x->>'id',(x->>'close')::timestamptz,x->>'owner',x->>'token',x->>'visibility',x->>'resolution',(x->>'deleted')::boolean,
      'Question '||(x->>'id'),x->>'slug',x->'data' from jsonb_array_elements($1::jsonb) x`,
    [JSON.stringify(values)]
  )
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create table contracts(id text primary key,close_time timestamptz,creator_id text,token text,visibility text,
    resolution text,deleted boolean,question text,slug text,data jsonb);
    create index contracts_creator_id on contracts(creator_id);
    create index contracts_close_time on contracts(close_time);`)
})
beforeEach(async () => {
  await db.exec('truncate contracts')
})
afterAll(async () => db.close())
const read = (limit = 100, cursor?: string, clock = now) =>
  getSportsAttention(pg, { limit, cursor }, clock)

it('selects only real official public MANA incidents, including legacy games and explicit title incidents', async () => {
  const past = due - 1
  const f1 = {
    sportsEventId: 'bdl-f1:10:20',
    sportsMarketType: 'podium',
    sportsStartTimestamp: '2026-11-01T15:00:00Z',
  }
  const title = {
    sportsEventId: 'bdl-f1-title:2026:drivers',
    sportsMarketType: 'title',
  }
  await seed(
    { id: 'bdl' },
    {
      id: 'odds',
      data: {
        sportsProvider: null,
        sportsEventId: 'odds:baseball_mlb:event',
        sportsMarketType: null,
      },
      owner: MANIFOLD_SPORTS_USER_IDS[1],
    },
    { id: 'fd', data: { sportsEventId: 'fd-876', sportsMarketType: null } },
    { id: 'f1', data: f1, close: now - DAY_MS },
    { id: 'title', data: title, close: now - 60 * DAY_MS },
    {
      id: 'markedTitle',
      data: {
        ...title,
        sportsAttentionReason: '  Standings\nneed review  ',
        sportsAttentionSince: past,
      },
      close: null,
    },
    {
      id: 'spread',
      data: {
        sportsEventId: 'odds:football:event',
        sportsMarketType: 'spread',
      },
    },
    {
      id: 'opaque',
      data: {
        sportsEventId: 'opaque',
        sportsProvider: 'football-data',
        sportsAttentionReason: 'Missing provider record',
      },
    },
    {
      id: 'manual',
      close: now + DAY_MS,
      data: {
        sportsAttentionReason: 'missing pair',
        sportsAttentionSince: 'garbage',
      },
    },
    {
      id: 'fixture',
      data: { sportsFixture: true, sportsAttentionReason: 'important' },
    },
    {
      id: 'fakePrefix',
      data: {
        sportsProvider: 'odds',
        sportsEventId: 'fixture:nba:1',
        sportsAttentionReason: 'fake',
      },
    },
    { id: 'explicitFixture', data: { sportsProvider: 'fixture' } },
    { id: 'badProvider', data: { sportsProvider: 'mystery' } },
    { id: 'unlinked', data: { sportsEventId: null } },
    { id: 'fakeBot', owner: 'reader' },
    { id: 'cash', token: 'CASH' },
    { id: 'resolved', resolution: 'CANCEL' },
    { id: 'deleted', deleted: true },
    { id: 'private', visibility: 'private' },
    { id: 'future', close: now + DAY_MS },
    { id: 'exactBoundary', close: due },
    { id: 'missingClose', close: null },
    { id: 'nonGame', data: { sportsMarketType: 'season' } },
    {
      id: 'emptyReason',
      close: null,
      data: { sportsAttentionReason: '  \r\n ' },
    },
    {
      id: 'invalidReason',
      close: null,
      data: { sportsAttentionReason: { key: 'do not disclose' } },
    },
    { id: 'badIdentity', data: { sportsEventId: 'bdl-f1:junk' } },
    { id: 'unsafeId', data: { sportsEventId: 'bdl:nba:9007199254740992' } },
    { id: 'badPair', data: { sportsEventId: 'bdl:mma:3:8-2' } },
    { id: 'noPair', data: { sportsEventId: 'bdl:wta:3' } },
    { id: 'tennis', data: { sportsEventId: 'bdl:atp:32:1-23' } },
    { id: 'missingOddsId', data: { sportsEventId: 'odds:abc:' } }
  )
  const { items, nextCursor } = await read()
  expect(items.map((i) => i.id).sort()).toEqual([
    'bdl',
    'f1',
    'fd',
    'manual',
    'markedTitle',
    'odds',
    'opaque',
    'spread',
    'tennis',
  ])
  expect(items.find((i) => i.id === 'bdl')).toEqual({
    id: 'bdl',
    question: 'Question bdl',
    provider: 'bdl',
    league: 'NBA',
    source: 'overdue',
    reason: 'Overdue final',
    closeTime: past,
    since: past + BDL_OVERDUE_ALERT_MS,
    href: '/SportsBot/bdl',
  })
  expect(items.find((i) => i.id === 'markedTitle')).toMatchObject({
    reason: 'Standings need review',
    source: 'stored',
    since: past,
    closeTime: null,
  })
  expect(items.find((i) => i.id === 'manual')).toMatchObject({ since: null })
  expect(items.find((i) => i.id === 'fd')?.provider).toBe('football-data')
  expect(items.find((i) => i.id === 'odds')?.provider).toBe('odds')
  expect(nextCursor).toBeNull()
})

it('keeps recorded identity incidents even when an event ID or provider cannot be recovered', async () => {
  const reason = { sportsAttentionReason: 'Identity needs review' }
  await seed(
    {
      id: 'known',
      data: { ...reason, sportsProvider: 'bdl', sportsEventId: null },
    },
    { id: 'malformed', data: { ...reason, sportsEventId: 'bdl-f1:junk' } },
    {
      id: 'leagueOnly',
      data: {
        ...reason,
        sportsLeagueKey: 'nba',
        sportsLeague: null,
        sportsMarketType: null,
        sportsEventId: null,
      },
    },
    {
      id: 'historical',
      data: { ...reason, sportsEventId: 'unattributed-event' },
    },
    {
      id: 'notSports',
      data: {
        ...reason,
        sportsEventId: null,
        sportsLeague: null,
        sportsMarketType: null,
      },
    },
    {
      id: 'fixture',
      data: { ...reason, sportsProvider: 'fixture', sportsEventId: null },
    },
    {
      id: 'fixtureId',
      data: {
        ...reason,
        sportsProvider: 'bdl',
        sportsEventId: 'fixture:nba:missing',
      },
    },
    {
      id: 'brokenUnmarked',
      data: { sportsProvider: 'bdl', sportsEventId: 'unattributed-event' },
    }
  )
  const { items } = await read()
  expect(items.map((item) => [item.id, item.provider])).toEqual([
    ['historical', 'unknown'],
    ['known', 'bdl'],
    ['leagueOnly', 'unknown'],
    ['malformed', 'bdl'],
  ])
  expect(
    items.every(
      (item) =>
        item.source === 'stored' && item.reason === reason.sportsAttentionReason
    )
  ).toBe(true)
})

it('honors MLB resumption, observed finals, confirmation holds and the actual F1 timing window', async () => {
  const mlb = {
    sportsEventId: 'bdl:mlb:45',
    sportsLiveStatus: 'suspended',
    sportsResumptionTime: now + 1,
  }
  const cancel = {
    sportsLiveStatus: 'CANCELED',
    sportsCanceledSince: now - HOUR_MS,
  }
  const session = {
    sportsEventId: 'bdl-f1:2:3',
    sportsMarketType: 'winner',
    sportsStartTimestamp: new Date(now - HOUR_MS).toISOString(),
  }
  await seed(
    { id: 'mlb', data: mlb },
    {
      id: 'oddsMlb',
      data: { ...mlb, sportsEventId: 'odds:baseball_mlb:event' },
    },
    { id: 'elapsed', data: { ...mlb, sportsResumptionTime: now } },
    { id: 'unknownResume', data: { ...mlb, sportsResumptionTime: null } },
    {
      id: 'stringResume',
      data: { ...mlb, sportsResumptionTime: String(now + 1) },
    },
    {
      id: 'hugeResume',
      data: { ...mlb, sportsResumptionTime: 8_800_000_000_000_000 },
    },
    {
      id: 'notMlb',
      data: { ...mlb, sportsEventId: 'bdl:nba:45', sportsLeagueKey: 'mlb' },
    },
    { id: 'postponedMlb', data: { ...mlb, sportsLiveStatus: 'postponed' } },
    {
      id: 'markedMlb',
      data: {
        ...mlb,
        sportsAttentionReason: 'Score disagrees',
        sportsAttentionSince: now - 100,
      },
    },
    { id: 'final', data: { sportsLiveStatus: 'FINAL' } },
    {
      id: 'finished',
      data: { sportsEventId: 'odds:sport:g', sportsLiveStatus: 'FINISHED' },
    },
    {
      id: 'awarded',
      data: { sportsEventId: 'fd-45', sportsLiveStatus: 'AWARDED' },
    },
    { id: 'finalMarker', data: { sportsFinalSince: now - 1 } },
    { id: 'badFinal', data: { sportsFinalSince: now + 1 } },
    {
      id: 'markedFinal',
      data: { sportsLiveStatus: 'FINAL', sportsAttentionReason: 'Disputed' },
    },
    { id: 'cancel', data: cancel },
    {
      id: 'cancelExpired',
      data: {
        ...cancel,
        sportsCanceledSince: now - BDL_CANCELLATION_HOLD_MS - 500,
      },
      close: now - 2 * DAY_MS,
    },
    {
      id: 'markedCancel',
      data: { ...cancel, sportsAttentionReason: 'Wrong sides' },
    },
    { id: 'earlyClose', data: session, close: now - DAY_MS },
    {
      id: 'badSessionTime',
      data: { ...session, sportsStartTimestamp: '2026-02-30T04:00:00Z' },
    },
    {
      id: 'offsetSession',
      data: {
        ...session,
        sportsStartTimestamp: '2026-11-21T18:30:00.123+10:30',
      },
      close: now - DAY_MS,
    },
    {
      id: 'f1Postponed',
      data: {
        ...session,
        sportsStartTimestamp: '2026-11-19T12:00:00Z',
        sportsLiveStatus: 'postponed',
      },
      close: now - DAY_MS,
    },
    {
      id: 'f1Canceled',
      data: {
        ...session,
        sportsStartTimestamp: '2026-01-01T00:00:00Z',
        sportsCanceledSince: now - 1,
      },
      close: now - DAY_MS,
    },
    {
      id: 'f1CancelExpired',
      data: {
        ...session,
        sportsStartTimestamp: '2026-01-01T00:00:00Z',
        sportsCanceledSince: now - 3 * HOUR_MS,
      },
      close: now - DAY_MS,
    }
  )
  const { items } = await read()
  expect(items.map((i) => i.id).sort()).toEqual([
    'badFinal',
    'cancelExpired',
    'elapsed',
    'f1CancelExpired',
    'hugeResume',
    'markedCancel',
    'markedFinal',
    'markedMlb',
    'notMlb',
    'postponedMlb',
    'stringResume',
    'unknownResume',
  ])
  expect(items.find((i) => i.id === 'cancelExpired')?.since).toBe(now - 500)
  expect(items.find((i) => i.id === 'markedMlb')).toMatchObject({
    reason: 'Score disagrees',
    source: 'stored',
    since: now - 100,
  })
})

it('paginates tied and missing onset times without repeats and pins time across requests', async () => {
  const unknown = {
    sportsAttentionReason: 'Manual review',
    sportsAttentionSince: { bad: now },
  }
  await seed(
    { id: 'z' },
    { id: 'A' },
    { id: 'a' },
    { id: 'unB', data: unknown, close: null },
    { id: 'unA', data: unknown, close: null },
    { id: 'new', close: due }
  )
  const first = await read(2)
  expect(first.items.map((i) => i.id)).toEqual(['A', 'a'])
  await seed({
    id: 'afterStart',
    close: null,
    data: {
      sportsAttentionReason: 'New incident',
      sportsAttentionSince: now + 1,
    },
  })
  const second = await read(2, first.nextCursor!, now + DAY_MS)
  expect(second.items.map((i) => i.id)).toEqual(['z', 'unA'])
  const third = await read(2, second.nextCursor!, now + DAY_MS)
  expect(third.items.map((i) => i.id)).toEqual(['unB'])
  expect(third.nextCursor).toBeNull()
  expect((await read(100, undefined, now + 1)).items.map((i) => i.id)).toEqual(
    expect.arrayContaining(['new', 'afterStart'])
  )
})

it('bounds output and rejects invalid queries before any database read', async () => {
  const fake = { manyOrNone: jest.fn() } as unknown as SupabaseDirectClient
  for (const limit of [0, 101, 0.5, NaN, Infinity])
    await expect(getSportsAttention(fake, { limit }, now)).rejects.toThrow()
  for (const cursor of [
    '',
    '1:1:u:bad/slug',
    '1:' + now + ':9999999999999999:id',
    '1:' + (now + 1) + ':u:id',
    'x'.repeat(256),
  ])
    await expect(getSportsAttention(fake, { cursor }, now)).rejects.toThrow()
  await expect(getSportsAttention(fake, {}, NaN)).rejects.toThrow()
  expect(fake.manyOrNone).not.toHaveBeenCalled()
  await seed(
    {
      id: 'unsafe',
      slug: '//host',
      data: {
        creatorUsername: '../go',
        sportsAttentionReason: 'x'.repeat(900),
      },
    },
    { id: 'control', slug: 'market\n' },
    { id: 'fragment', slug: 'foo#resolve' }
  )
  const { items } = await read()
  expect(items.every((i) => i.href === null)).toBe(true)
  expect(items.find((i) => i.id === 'unsafe')?.reason).toHaveLength(500)
})

it('uses the official creator index on a selective contracts population and limits the ordered result', async () => {
  await db.exec(`insert into contracts(id,creator_id,token,visibility,question,data)
    select 'ordinary'||n, 'other'||(n%500), 'MANA','public','Ordinary','{}'::jsonb from generate_series(1,18000) n`)
  await seed({ id: 'only' })
  await db.exec('analyze contracts')
  expect((await read(1)).items.map((i) => i.id)).toEqual(['only'])
  const plan = await db.query('explain (format json) ' + statement)
  expect(JSON.stringify(plan.rows)).toContain('contracts_creator_id')
  expect(JSON.stringify(plan.rows)).toContain('Limit')
})
