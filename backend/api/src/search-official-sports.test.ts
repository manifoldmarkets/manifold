import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'
import { fullSearchProps, searchProps } from 'common/api/market-search-types'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getForYouSQL } from 'shared/supabase/search-contracts'
import { userIdsToAverageTopicConversionScores } from 'shared/topic-interests'
import { searchMarketsFull, searchMarketsLite } from './search-contracts'

jest.mock('shared/supabase/init', () => ({
  pgp: jest.requireActual('pg-promise')(),
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/helpers/openai-utils', () => ({}))
jest.setTimeout(60_000)
const pgp = pgPromise()
let db: PGlite
const sqlReads: string[] = []
type DbRow = Record<string, unknown>
const query = async (sql: string, args?: unknown[]) => {
  const statement = pgp.as.format(sql, args)
  sqlReads.push(statement)
  return (await db.query<DbRow>(statement)).rows
}
const client = {
  one: async (sql: string, args: unknown[], fn: (r: DbRow) => unknown) =>
    fn((await query(sql, args))[0]),
  oneOrNone: async (
    sql: string,
    args: unknown[],
    fn: (r: DbRow | null) => unknown
  ) => fn((await query(sql, args))[0] ?? null),
  map: async (sql: string, args: unknown[], fn: (r: DbRow) => unknown) =>
    (await query(sql, args)).map(fn),
  multi: async (sql: string) => {
    sqlReads.push(sql)
    return (await db.exec(sql)).map((r) => r.rows)
  },
}
type SearchHandler = (
  input: unknown,
  auth?: { uid: string }
) => Promise<
  { id: string; createdTime: number; sportsDiscoveryFiltered?: true }[]
>
const full = searchMarketsFull as unknown as SearchHandler
const lite = searchMarketsLite as unknown as SearchHandler
const search = (opts: Record<string, unknown>) =>
  full(fullSearchProps.parse(opts))
const ids = (results: { id: string }[]) => results.map((r) => r.id)
const base = Date.parse('2026-11-21T12:00:00.000Z')
const [prod, dev] = MANIFOLD_SPORTS_USER_IDS
const reader = 'local-discovery-reader'
const forYou = (sort: string) =>
  full(
    fullSearchProps.parse({
      sort,
      sportsDiscovery: 'home',
      forYou: '1',
      limit: 12,
    }),
    { uid: reader }
  )

beforeAll(async () => {
  db = new PGlite()
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      client as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
  await db.exec(`
    create text search configuration english_extended (copy=english);
    create text search configuration english_nostop_with_prefix (copy=english);
    create function millis_to_ts(bigint) returns timestamptz immutable language sql as 'select to_timestamp($1::numeric / 1000)';
    create table contracts(id text primary key,data jsonb not null,creator_id text,created_time timestamptz,slug text,
      importance_score numeric,home_page_score_adjustment numeric,home_page_score_adjustment_expires_at timestamptz,
      freshness_score numeric,conversion_score numeric,view_count bigint,token text default 'MANA',boosted boolean,
      daily_score numeric,unique_bettor_count int default 0,visibility text default 'public',deleted boolean default false,
      close_time timestamptz,resolution_time timestamptz,outcome_type text default 'BINARY',group_slugs text[],
      question_fts tsvector,question_nostop_fts tsvector,description_fts tsvector);
    create table answers(contract_id text,text_fts tsvector);
    create table private_users(id text primary key, data jsonb);
    create table contract_bets(contract_id text,user_id text);
    create table contract_perp_events(contract_id text,user_id text,event_type text);
    create table user_disinterests(user_id text,contract_id text);
    create table user_follows(user_id text,follow_id text);
    create table groups(id text, slug text);
    create table group_contracts(contract_id text,group_id text);
    create table group_groups(top_id text,bottom_id text);
    insert into groups values ('sport','sport');
    create index contracts_created_time on contracts(created_time desc);
    create index contracts_importance_score on contracts(importance_score desc);
    create index contracts_freshness_score on contracts(freshness_score desc);
    create index contracts_feed_created on contracts(token,created_time desc)
      where resolution_time is null and deleted=false and visibility='public';
  `)
  const samples: {
    id: string
    owner: string | null
    rank: number
    data: Record<string, unknown>
  }[] = []
  const add = (
    id: string,
    owner: string | null,
    rank: number,
    data: Record<string, unknown> = {}
  ) => samples.push({ id, owner, rank, data })
  for (let n = 0; n < 1200; n++)
    add('flood' + n, prod, 6, {
      sportsEventId: 'bdl:nba:' + (n + 1),
      sportsMarketType: 'moneyline',
    })
  add('shown', null, 5)
  add('A', 'alice', 4, { sportsEventId: 'odds:basketball_nba:fan' })
  add('B', prod, 4, {
    sportsEventId: 'bdl-f1-title:2026:drivers',
    sportsMarketType: 'title',
  })
  add('a', prod, 4)
  add('older', 'reader', 1)
  add('odds', dev, 4, { sportsEventId: 'odds:basketball_nba:game' })
  add('f1', prod, 4, {
    sportsEventId: 'bdl-f1:17:22',
    sportsMarketType: 'podium',
  })
  add('fd', prod, 4, { sportsEventId: 'fd-90' })
  add('nonascii', prod, 0, { sportsEventId: 'odds:épl:X' })
  add('newline', prod, 0, { sportsEventId: 'fd-20\n' })
  add('conflict', prod, 0, {
    sportsEventId: 'bdl:nba:1',
    sportsProvider: 'odds',
  })
  add('fixture', prod, 0, { sportsEventId: 'bdl:nba:2', sportsFixture: true })
  const payload = samples.map((s) => ({
    ...s,
    data: {
      id: s.id,
      slug: s.id,
      question: 'basketball ' + s.id,
      creatorId: s.owner,
      creatorUsername: 'Maker',
      createdTime: base + s.rank,
      mechanism: 'cpmm-1',
      outcomeType: 'BINARY',
      prob: 0.5,
      pool: { YES: 10, NO: 10 },
      p: 0.5,
      ...s.data,
    },
  }))
  await db.query(
    `insert into contracts(id,slug,creator_id,created_time,importance_score,data,question_fts,question_nostop_fts,description_fts)
    select s->>'id',s->>'id',s->>'owner',millis_to_ts((s->'data'->>'createdTime')::bigint),(s->>'rank')::numeric,s->'data',
      to_tsvector('english',s->'data'->>'question'),to_tsvector('english',s->'data'->>'question'),''::tsvector
    from jsonb_array_elements($1::jsonb) s`,
    [JSON.stringify(payload)]
  )
  await db.exec(
    "insert into group_contracts values ('f1','sport'),('odds','sport')"
  )
})
afterAll(async () => {
  delete userIdsToAverageTopicConversionScores[reader]
  await db.close()
})

it('filters before SQL page cuts on both the newest merged queries and score-ranked sitemap', async () => {
  const args = { sort: 'newest', sportsDiscovery: 'new', limit: 2 }
  const first = await search(args)
  expect(ids(first)).toEqual(['shown', 'A'])
  const second = await search({
    ...args,
    sportsDiscoveryCursor: `${base + 4}:A`,
  })
  expect(ids(second)).toEqual(['B', 'a'])
  const third = await search({
    ...args,
    sportsDiscoveryCursor: `${base + 4}:a`,
  })
  expect(ids(third)).toEqual(['older', 'conflict'])
  expect(ids(await search({ ...args, offset: 2 }))).toEqual(ids(second))
  const legacy = await search({
    sort: 'newest',
    beforeTime: base + 4,
    limit: 2,
  })
  expect(ids(legacy)).toEqual(['older', 'conflict'])
  expect(
    ids(await search({ sort: 'score', sportsDiscovery: 'sitemap', limit: 3 }))
  ).toEqual(['shown', 'A', 'B'])
  expect(
    ids(
      await search({
        sort: 'score',
        sportsDiscovery: 'sitemap',
        limit: 2,
        offset: 3,
      })
    )
  ).toEqual(['a', 'older'])
  const lowerPage = await search({ ...args, limit: 20, beforeTime: base + 1 })
  expect(ids(lowerPage)).toEqual(['conflict', 'fixture', 'newline', 'nonascii'])
})

it('marks only the final emitted row of an opted-in full page', async () => {
  for (const [sort, sportsDiscovery] of [
    ['newest', 'new'],
    ['score', 'sitemap'],
  ]) {
    const batch = await search({ sort, sportsDiscovery, limit: 3 })
    expect(batch.map((row) => row.sportsDiscoveryFiltered)).toEqual([
      undefined,
      undefined,
      true,
    ])
  }
  expect(
    await search({
      sort: 'newest',
      sportsDiscovery: 'new',
      sportsDiscoveryCursor: '1:last',
    })
  ).toEqual([])
  const unmarked = await Promise.all([
    search({ sort: 'newest', limit: 2 }),
    search({
      sort: 'newest',
      sportsDiscovery: 'new',
      creatorId: prod,
      limit: 2,
    }),
    lite(searchProps.parse({ sort: 'newest', limit: 2 })),
  ])
  expect(
    unmarked.every(
      (batch) =>
        batch.length === 2 &&
        batch.every((row) => !('sportsDiscoveryFiltered' in row))
    )
  ).toBe(true)
})

it('keeps ordinary, focused and documented search unfiltered', async () => {
  const newest = { sort: 'newest', limit: 2 }
  expect(ids(await search(newest))[0]).toMatch(/^flood/)
  expect(
    ids(await search({ ...newest, sportsDiscovery: 'new', creatorId: prod }))[0]
  ).toMatch(/^flood/)
  expect(
    ids(await search({ ...newest, sportsDiscovery: 'new', topicSlug: 'sport' }))
  ).toEqual(['f1', 'odds'])
  expect(
    ids(await search({ ...newest, sportsDiscovery: 'new', gids: 'sport' }))
  ).toEqual(['f1', 'odds'])
  expect(
    ids(
      await search({
        ...newest,
        sportsDiscovery: 'new',
        term: 'https://manifold.markets/Maker/fd',
      })
    )
  ).toEqual(['fd'])
  expect(
    ids(await search({ ...newest, sportsDiscovery: 'sitemap' }))[0]
  ).toMatch(/^flood/)
  expect(
    searchProps.safeParse({ ...newest, sportsDiscovery: 'new' }).success
  ).toBe(false)
  expect(ids(await lite(searchProps.parse(newest)))[0]).toMatch(/^flood/)
})

it('keeps opted-in personalized Home results when official games occupy every top score', async () => {
  // Warm the real topic profile cache and let the handler load the private
  // user, apply dismissals and enforce visibility from the database.
  userIdsToAverageTopicConversionScores[reader] = { interest: 2 }
  await db.exec(`
    insert into private_users values ('${reader}', '{"blockedUserIds":[],"blockedByUserIds":[],"blockedContractIds":["older"],"blockedGroupSlugs":[]}');
    insert into user_disinterests values ('${reader}','a');
    insert into contracts(id,creator_id,created_time,importance_score,data,visibility)
      select 'private','another',created_time,importance_score,data || '{"id":"private"}'::jsonb,'unlisted'
      from contracts where id='shown';
    insert into group_contracts values ('A','interest'),('a','interest'),('private','interest');
    update contracts set freshness_score=importance_score;
  `)
  for (const sort of ['score', 'freshness-score']) {
    const result = await forYou(sort)
    expect(ids(result)[0]).toBe('A')
    expect(ids(result)).toEqual(expect.arrayContaining(['B', 'shown']))
    expect(ids(result)).not.toContain('a')
    expect(ids(result)).not.toContain('private')
    expect(ids(result)).not.toContain('older')
    expect(ids(result).some((id) => id.startsWith('flood'))).toBe(false)
    expect(result.at(-1)?.sportsDiscoveryFiltered).toBe(true)
    // At a smaller cutoff the Nth eligible score exists. Tied eligible
    // candidates stay, and candidates below the boundary drop out.
    const narrowed = await getForYouSQL({
      sort,
      limit: 12,
      offset: 0,
      filter: 'all',
      contractType: 'ALL',
      token: 'MANA',
      uid: reader,
      threshold: 3,
      excludeOfficialSports: true,
    })
    const rows = await db.query<{ id: string }>(narrowed)
    expect(ids(rows.rows)).toEqual(expect.arrayContaining(['A', 'B']))
    expect(ids(rows.rows)).not.toContain('older')
  }
})

it('uses the existing time and score indexes on a selective ordered page', async () => {
  await db.exec(`insert into contracts(id,created_time,importance_score,freshness_score,data)
    select 'ordinary'||n, millis_to_ts(1700000000000::bigint+n), -n,-n,jsonb_build_object('id','ordinary'||n,'createdTime',1700000000000::bigint+n)
    from generate_series(1,16000) n; analyze contracts;`)
  for (const [sort, sportsDiscovery, index] of [
    ['newest', 'new', 'contracts_created_time'],
    ['score', 'sitemap', 'contracts_importance_score'],
  ]) {
    sqlReads.length = 0
    await search({ sort, sportsDiscovery, limit: 2 })
    const query = sqlReads.at(-1)!.split(';')[0]
    const plan = await db.query('explain (format json) ' + query)
    expect(JSON.stringify(plan.rows)).toContain(index)
  }
  for (const [sort, index] of [
    ['score', 'contracts_importance_score'],
    ['freshness-score', 'contracts_freshness_score'],
  ]) {
    sqlReads.length = 0
    await forYou(sort)
    const plan = await db.query('explain (format json) ' + sqlReads.at(-1)!)
    expect(JSON.stringify(plan.rows)).toContain(index)
  }
})
