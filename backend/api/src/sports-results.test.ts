import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import {
  sportsResultsProps,
  type SportsResultsProps,
} from 'common/sports-results'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { readSportsResults, sportsResults } from './sports-results'

jest.mock('shared/supabase/init', () => ({
  pgp: jest.requireActual('pg-promise')(),
  createSupabaseDirectClient: jest.fn(),
}))
jest.setTimeout(60_000)
const pgp = pgPromise()
const db = new PGlite()
const read = (props: SportsResultsProps) =>
  readSportsResults(
    {
      manyOrNone: async (sql, values) =>
        (await db.query(pgp.as.format(sql as string, values))).rows,
    } as Parameters<typeof readSportsResults>[0],
    props
  )
const stamp = '2026-11-21T11:32:00.123456Z'
const owner = MANIFOLD_SPORTS_USER_IDS[0]
type Seed = {
  id: string
  owner?: string
  visibility?: string
  token?: string
  deleted?: boolean
  outcome?: string
  resolution?: string | null
  stamp?: string | null
  slug?: string
  data?: Record<string, unknown>
  answers?: string[]
}
async function seed({
  id,
  owner: creator = owner,
  visibility = 'public',
  token = 'MANA',
  deleted = false,
  outcome = 'MULTIPLE_CHOICE',
  resolution = id + '-h',
  stamp: date = stamp,
  slug = id,
  data,
  answers = ['Harbor', 'River', 'Draw'],
}: Seed) {
  const metadata = {
    creatorUsername: 'ManifoldSports',
    sportsEventId: 'odds:soccer_epl:' + id,
    sportsHomeTeam: 'Harbor',
    sportsAwayTeam: 'River',
    sportsLiveStatus: 'FINISHED',
    sportsHomeScore: 0,
    sportsAwayScore: 2,
    ...data,
  }
  await db.query(
    pgp.as.format(
      'insert into contracts(id,slug,question,creator_id,visibility,token,deleted,outcome_type,resolution,resolution_time,group_slugs,data) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text[],$12::jsonb)',
      [
        id,
        slug,
        'Winner of ' + id + '?',
        creator,
        visibility,
        token,
        deleted,
        outcome,
        resolution,
        date,
        ['fixture-topic'],
        JSON.stringify(metadata),
      ]
    )
  )
  for (const [index, text] of answers.entries()) {
    const answerId = id + ['-h', '-a', '-d'][index]
    await db.query(
      pgp.as.format('insert into answers values ($1,$2,$3,$4)', [
        answerId,
        id,
        text,
        index,
      ])
    )
  }
}
beforeAll(async () => {
  await db.exec(`create table contracts(id text primary key,slug text,question text,creator_id text,visibility text,token text,deleted boolean,outcome_type text,resolution text,resolution_time timestamptz,group_slugs text[],data jsonb);
 create table answers(id text primary key,contract_id text,text text,index int);`)
})
beforeEach(async () => {
  await db.exec('truncate contracts,answers')
})
afterAll(async () => {
  await db.close()
})

it('exposes only settled public house MANA game markets, including both official owners', async () => {
  await seed({ id: 'house' })
  await seed({
    id: 'other-house',
    owner: MANIFOLD_SPORTS_USER_IDS[1],
    data: {
      sportsEventId: 'bdl:epl:91',
      sportsMarketType: 'moneyline',
      sportsLeagueKey: 'epl',
    },
  })
  for (const row of [
    { id: 'community', owner: 'another-user' },
    { id: 'private', visibility: 'private' },
    { id: 'unlisted', visibility: 'unlisted' },
    { id: 'cash', token: 'CASH' },
    { id: 'deleted', deleted: true },
    { id: 'unsettled', resolution: null },
    { id: 'no-time', stamp: null },
    { id: 'prop', data: { sportsMarketType: 'prop' } },
    { id: 'fake', data: { sportsFixture: true } },
    { id: 'forged', data: { sportsProvider: 'bdl' } },
    { id: 'plain', data: { sportsEventId: undefined } },
    {
      id: 'conflict',
      data: { sportsEventId: 'bdl:epl:891', sportsLeagueKey: 'laliga' },
    },
    { id: 'season', data: { sportsEventId: 'bdl-f1-title:2026:drivers' } },
    { id: 'other-sport', data: { sportsEventId: 'bdl:nba:8' } },
    { id: 'bad-slug', slug: '../unsafe' },
    { id: 'bad-user', data: { creatorUsername: 'foo/bar' } },
    { id: 'numeric', outcome: 'MULTI_NUMERIC' },
  ])
    await seed(row)
  const page = await read({ sport: 'soccer' })
  expect(page.items.map((i) => i.id).sort()).toEqual(['house', 'other-house'])
  expect(page.items[0]).toMatchObject({
    href: '/ManifoldSports/other-house',
    league: 'EPL',
    groupSlugs: ['fixture-topic'],
  })
  expect(page.nextCursor).toBeNull()
})

it('shows the actual payout separately from observed final scores, including a refund and corrected manual winner', async () => {
  await seed({ id: 'manual', resolution: 'manual-h' })
  await seed({ id: 'refund', resolution: 'CANCEL' })
  await seed({ id: 'running', data: { sportsLiveStatus: 'IN_PLAY' } })
  await seed({ id: 'bad-score', data: { sportsHomeScore: '0' } })
  await seed({
    id: 'split',
    resolution: 'CHOOSE_MULTIPLE',
    data: { resolutions: { 'split-h': 50, 'split-a': 50, 'split-d': 0 } },
  })
  await seed({
    id: 'unknown',
    resolution: 'CHOOSE_MULTIPLE',
    data: { resolutions: { 'unknown-h': 100, orphan: 50 } },
  })
  await seed({
    id: 'draw',
    resolution: 'draw-d',
    data: { sportsHomeScore: 0, sportsAwayScore: 0 },
  })
  const rows = Object.fromEntries(
    (await read({ sport: 'soccer' })).items.map((i) => [i.id, i])
  )
  expect(rows.manual).toMatchObject({
    payout: 'Harbor',
    finalScore: { home: 'Harbor', homeScore: 0, away: 'River', awayScore: 2 },
  })
  expect(rows.refund).toMatchObject({
    payout: 'N/A (refunded)',
    finalScore: null,
  })
  expect(rows.running.finalScore).toBeNull()
  expect(rows['bad-score'].finalScore).toBeNull()
  expect(rows.split.payout).toBe('Harbor 50% · River 50%')
  expect(rows.unknown.payout).toBe('Settled')
  expect(rows.draw).toMatchObject({
    payout: 'Draw',
    finalScore: { homeScore: 0, awayScore: 0 },
  })
})

it('retains proven World Cup home/away ordering for games without stored names, and filters leagues before limiting', async () => {
  const time = '2026-11-20T10:00:00Z'
  await seed({
    id: 'cup',
    stamp: time,
    data: {
      sportsEventId: 'fd-542011',
      sportsHomeTeam: undefined,
      sportsAwayTeam: undefined,
    },
    answers: ['England', 'Japan', 'Draw'],
  })
  await seed({
    id: 'spain',
    data: { sportsEventId: 'odds:soccer_spain_la_liga:a1' },
  })
  await seed({ id: 'england', data: { sportsEventId: 'bdl:epl:34' } })
  expect(
    (await read({ sport: 'soccer', league: 'fifa/worldcup', limit: 1 })).items
  ).toEqual([
    expect.objectContaining({
      id: 'cup',
      payout: 'England',
      finalScore: {
        home: 'England',
        away: 'Japan',
        homeScore: 0,
        awayScore: 2,
      },
    }),
  ])
  expect(
    (await read({ sport: 'soccer', league: 'laliga', limit: 1 })).items.map(
      (i) => i.id
    )
  ).toEqual(['spain'])
  expect(await read({ sport: 'nba', league: 'epl' })).toEqual({
    items: [],
    nextCursor: null,
  })
})

it('pages tied settlement timestamps and sub-millisecond neighbors in deterministic newest order', async () => {
  for (const id of ['a', 'b', 'c', 'd']) await seed({ id })
  await seed({ id: 'z', stamp: '2026-11-21T11:32:00.123455Z' })
  await seed({ id: 'latest', stamp: '2026-11-21T11:32:00.123457Z' })
  const seen: string[] = []
  let cursor: string | undefined
  do {
    const page = await read({ sport: 'soccer', limit: 2, cursor })
    seen.push(...page.items.map((i) => i.id))
    cursor = page.nextCursor ?? undefined
    if (cursor)
      expect(
        sportsResultsProps.safeParse({ sport: 'soccer', cursor }).success
      ).toBe(true)
  } while (cursor)
  expect(seen).toEqual(['latest', 'd', 'c', 'b', 'a', 'z'])
})

it('rejects malformed cursors, unsupported league filters, all-sports and invalid limits', () => {
  for (const cursor of [
    '2026-02-31T11:00:00.123456Z|a',
    stamp + '|a/b',
    stamp + '|' + 'x'.repeat(129),
    'garbage',
  ])
    expect(sportsResultsProps.safeParse({ sport: 'nba', cursor }).success).toBe(
      false
    )
  for (const bad of [
    { sport: 'all' },
    { sport: 'nba', league: 'made-up' },
    { sport: 'nba', limit: 0 },
    { sport: 'nba', limit: 51 },
  ])
    expect(sportsResultsProps.safeParse(bad).success).toBe(false)
})
it('returns an empty anonymous result without opening a database connection when disabled', async () => {
  const previous = process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  try {
    delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
    await expect(
      sportsResults(
        { sport: 'soccer' },
        undefined,
        {} as Parameters<typeof sportsResults>[2]
      )
    ).resolves.toEqual({ items: [], nextCursor: null })
    expect(createSupabaseDirectClient).not.toHaveBeenCalled()
  } finally {
    if (previous === undefined)
      delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
    else process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = previous
  }
})
