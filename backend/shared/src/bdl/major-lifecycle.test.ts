import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'
import { SPORTS_CALENDAR } from 'common/sports-calendar'
import { manifoldSportsUserId } from 'common/sports'
import { convertAnswer } from 'common/supabase/contracts'
import type { Row } from 'common/supabase/utils'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { createBdlClient } from '../balldontlie-client'
import type {
  SupabaseDirectClient,
  SupabaseTransaction,
} from '../supabase/init'
import { createSportsContract } from '../sports-markets'
import { resolveMarketHelper } from '../resolve-market-helpers'
import { sendTextEmail } from '../send-email'
import { publishSportsLiveScore } from '../publish-sports-live-score'
import { runMajorCreation } from './create-major-markets'
import {
  deliverMajorAlerts,
  runMajorLifecycle,
  majorPollDue,
} from './major-lifecycle'
import {
  listMajorMarkets,
  recordMajorObservation,
  settleRecordedMajor,
} from './major-lifecycle-store'
import { fetchMajorSnapshots } from './major-snapshots'
import type { MajorMarket } from './major-result'
import type { User } from 'common/user'

jest.mock('../supabase/init', () => ({
  pgp: jest.requireActual('pg-promise')(),
  createSupabaseDirectClient: jest.fn(() => {
    throw Error('unexpected external DB')
  }),
}))
jest.mock('../resolve-market-helpers', () => ({
  resolveMarketHelper: jest.fn(),
}))
jest.mock('../publish-sports-live-score', () => ({
  publishSportsLiveScore: jest.fn(),
}))
jest.mock('../odds-markets', () => ({
  sportsCreator: async () => ({
    id: jest.requireActual('common/sports').manifoldSportsUserId(false),
  }),
}))
jest.mock('../sports-markets', () => ({
  createSportsContract: jest.fn(),
  flushSportsGroupEmbeddings: jest.fn(),
  SportsMarketAlreadyExistsError: class extends Error {},
}))
jest.mock('../tiptap', () => ({ anythingToRichText: (v: unknown) => v }))
jest.mock('../monitoring/log', () => ({
  log: { info: jest.fn(), warn: jest.fn() },
}))
jest.mock('../send-email', () => ({ sendTextEmail: jest.fn() }))
jest.mock('../utils', () => ({
  isProd: () => false,
  log: { error: jest.fn(), warn: jest.fn() },
}))
jest.mock('./creation-budget', () => ({
  requireBdlCreationBudget: async () => ({ reason: null, lowBalance: false }),
  BdlCreationBudgetError: class extends Error {},
}))
jest.setTimeout(30_000)

const pgp = pgPromise(),
  db = new PGlite()
const iso = (n: number) => new Date(n).toISOString()
const originalFlag = process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
const house = manifoldSportsUserId(false),
  user = { id: house } as User
const kickoff = Date.parse('2026-11-07T01:00:00Z')
const initial = kickoff - DAY_MS
let now = initial
const clock = {
  now: () => now,
  sleep: async (ms: number) => {
    now += ms
  },
}
const phase = SPORTS_CALENDAR.find(
  (p) =>
    p.bdlLeagueKey === 'nba' &&
    p.startDate <= '2026-11-07' &&
    p.endDate >= '2026-11-07'
)!
const scorePolling = { sports: {}, leagues: { nba: 30 }, games: {}, finals: 60 }
const original = {
  id: 101,
  status_state: 'scheduled',
  period: 0,
  home_team: { id: 11, full_name: 'Lake City Owls' },
  visitor_team: { id: 12, full_name: 'Northport Foxes' },
  home_team_score: 0,
  visitor_team_score: 0,
}
let raw: Record<string, unknown>
let otherGames: Record<string, unknown>[]
const quotedIds: string[][] = []
let client: ReturnType<typeof createBdlClient>
const requests: string[] = []
let testTx: Transaction | undefined
const read = <T>(sql: string, args: unknown[] = []) =>
  (testTx ?? db).query<T>(pgp.as.format(sql, args)).then((v) => v.rows)
function shim(connection: PGlite | Transaction): SupabaseDirectClient {
  const query = async (sql: string, args: unknown[] = []) =>
    (await connection.query(pgp.as.format(sql, args))).rows
  return {
    manyOrNone: query,
    one: async (sql: string, args: unknown[]) => (await query(sql, args))[0],
    oneOrNone: async (sql: string, args: unknown[]) =>
      (await query(sql, args))[0] ?? null,
    none: async (sql: string, args: unknown[]) => {
      await query(sql, args)
    },
    map: async (sql: string, args: unknown[], fn: (row: unknown) => unknown) =>
      (await query(sql, args)).map(fn),
    tx: (f: (tx: SupabaseDirectClient) => Promise<unknown>) =>
      db.transaction(async (tx) => {
        testTx = tx
        try {
          return await f(shim(tx))
        } finally {
          testTx = undefined
        }
      }),
  } as unknown as SupabaseDirectClient
}
const pg = shim(db)
const runner = (job: 'sync' | 'resolve' | 'watch') =>
  runMajorLifecycle(job, { pg, clock, client })
async function loadMarket(id: string) {
  const [{ data }] = await read<{ data: MajorMarket }>(
    'select data from contracts where id=$1',
    [id]
  )
  const rows = await read<Row<'answers'>>(
    'select * from answers where contract_id=$1 order by index',
    [id]
  )
  return { ...data, answers: rows.map(convertAnswer) }
}
async function addMarket(
  params: Record<string, unknown>,
  id: string,
  answers: readonly string[]
) {
  const data = {
    ...params,
    id,
    token: 'MANA',
    visibility: 'public',
    creatorId: house,
    creatorUsername: 'ManifoldSports',
    slug: id,
    mechanism: 'cpmm-multi-2',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: true,
    addAnswersMode: 'DISABLED',
    isResolved: false,
  }
  await read(
    'insert into contracts(id,creator_id,data,token,visibility,outcome_type) values ($1,$2,$3,$4,$5,$6)',
    [id, house, data, 'MANA', 'public', 'MULTIPLE_CHOICE']
  )
  for (let index = 0; index < answers.length; index++)
    await read(
      'insert into answers(id,contract_id,index,text) values($1,$2,$3,$4)',
      [id + '-' + index, id, index, answers[index]]
    )
}
async function create() {
  const created = await runMajorCreation(
    { league: 'nba' },
    { pg, clock, client }
  )
  expect(
    created.log.map(({ status, contractId, reason }) => ({
      status,
      contractId,
      reason,
    }))
  ).toEqual([{ status: 'created', contractId: 'one', reason: null }])
  return loadMarket('one')
}
beforeAll(async () => {
  await db.exec(`create table contracts (id text primary key, creator_id text, visibility text,token text,outcome_type text,deleted boolean,data jsonb,resolution text,resolution_time timestamptz,close_time timestamptz);
    create role anon;create role authenticated;create role service_role;
    create table answers(id text primary key,contract_id text,index int,text text,prob double precision,resolution text,resolution_time timestamptz,is_other boolean);
    create table sports_competition_switches (competition_id text,phase text,enabled boolean,updated_time timestamptz default now(),updated_by text);
    create table sports_score_polling(target text,interval_seconds int,updated_time timestamptz default now(),updated_by text);
    create table groups(id text,slug text,privacy_status text);
    create table sports_creation_settings(scope text,ante_cap int,base_ante int,starts_on date,group_slugs text[]);
    insert into groups values('topic','sports','public');
    insert into sports_score_polling(target,interval_seconds) values('league:nba',30);
    insert into sports_creation_settings values('nba',1000,100,'2026-11-01','{sports}'),('wave:1',9999,null,null,null),('global',9999,null,null,null);`)
  await db.exec(
    readFileSync(
      join(
        __dirname,
        '../../../supabase/sports_market_attention_deliveries.sql'
      ),
      'utf8'
    )
  )
})
beforeEach(async () => {
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
  await db.exec(
    'truncate contracts, answers, sports_competition_switches,sports_market_attention_deliveries'
  )
  for (const p of SPORTS_CALENDAR.filter(
    (p) => p.sport === 'nba' && (p.oddsKey || p === phase)
  ))
    await read(
      'insert into sports_competition_switches(competition_id,phase,enabled) values($1,$2,$3)',
      [p.competitionId, p.phase, p === phase]
    )
  jest.clearAllMocks()
  now = initial
  requests.length = 0
  quotedIds.length = 0
  otherGames = []
  raw = {
    ...original,
    date: '2026-11-06',
    datetime: iso(kickoff),
    season: 2026,
    postseason: false,
  }
  client = createBdlClient({
    role: 'recorder',
    key: 'dummy-test-only',
    clock: { ...clock },
    transport: async (input) => {
      const u = new URL(input),
        path = u.pathname
      requests.push(path)
      let data: unknown
      const slate = [raw, ...otherGames]
      if (path.startsWith('/nba/v1/games/')) {
        data = slate.find((game) => String(game.id) === path.split('/').pop())
        if (!data) return new Response(null, { status: 404 })
      } else if (path === '/nba/v1/games')
        data = slate.filter((game) =>
          u.searchParams.getAll('dates[]').includes(String(game.date))
        )
      else if (path === '/nba/v2/odds') {
        const ids = u.searchParams.getAll('game_ids[]')
        quotedIds.push(ids)
        data = ids.map((id) => ({
          game_id: Number(id),
          vendor: 'test-book',
          moneyline_home_odds: 150,
          moneyline_away_odds: -150,
          updated_at: iso(now),
        }))
      } else if (path === '/nba/v1/standings')
        data = [
          {
            season: 2026,
            team: { id: 11 },
            wins: 9,
            losses: 4,
            conference_rank: 2,
          },
        ]
      else throw Error('Unknown fixture path ' + path)
      return new Response(
        JSON.stringify({ data, meta: { next_cursor: null } }),
        { status: 200 }
      )
    },
  })
  // The real creator owns phase, pricing and funding checks. Stand-ins replace the platform's
  // creation/payment side effects; every lifecycle query and the last payout assertion use SQL.
  jest
    .mocked(createSportsContract)
    .mockImplementation(async (_, __, params, opts) => {
      await opts!.chooseAnte!(pg as SupabaseTransaction)
      await addMarket({ ...params }, 'one', params.answers ?? [])
      return { id: 'one' } as Awaited<ReturnType<typeof createSportsContract>>
    })
  jest
    .mocked(resolveMarketHelper)
    .mockImplementation(async (candidate, _, __, outcome, observer, guard) => {
      const fresh = await loadMarket(candidate.id)
      // PGlite has one connection. The native PG test exercises two concurrent sessions.
      guard!(fresh)
      await testTx!.query(
        pgp.as.format(
          'update contracts set data=data || $1::jsonb,resolution=$2,resolution_time=$3 where id=$4',
          [
            {
              resolution: outcome.outcome,
              isResolved: true,
              resolutionTime: now,
            },
            outcome.outcome,
            iso(now),
            candidate.id,
          ]
        )
      )
      observer?.('committed')
      return { contract: { ...fresh, isResolved: true }, userUpdates: [] }
    })
})
afterEach(() => {
  if (originalFlag === undefined)
    delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  else process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = originalFlag
})
afterAll(async () => db.close())

it('creates, syncs a live scoreboard and pays one recorded final to both linked markets on a fake clock', async () => {
  const m = await create()
  expect(m).toMatchObject({
    sportsEntrantIds: [12, 11],
    sportsCompetitionPhase: phase.phase,
  })
  await addMarket({ ...m }, 'sibling', ['Northport Foxes', 'Lake City Owls'])
  now += MINUTE_MS
  expect(await runner('sync')).toMatchObject({ observed: 2, errors: 0 })
  expect(requests.filter((p) => p.endsWith('/standings'))).toHaveLength(1)
  requests.length = 0
  jest.mocked(publishSportsLiveScore).mockClear()
  now = kickoff + HOUR_MS
  raw = {
    ...raw,
    status_state: 'in_progress',
    period: 2,
    time: '05:32',
    home_team_score: 40,
    visitor_team_score: 44,
  }
  expect(await runner('resolve')).toEqual({
    observed: 2,
    settled: 0,
    attention: 0,
    errors: 0,
  })
  const live = await loadMarket('one')
  expect(live).toMatchObject({
    sportsObservedStartTime: now,
    sportsLivePeriod: expect.anything(),
    sportsLiveClock: '05:32',
    sportsLiveDetail: { standings: { home: { wins: 9, losses: 4 } } },
  })
  expect(requests.some((p) => p.endsWith('/standings'))).toBe(false)
  expect(publishSportsLiveScore).toHaveBeenCalledTimes(2)
  expect(resolveMarketHelper).not.toHaveBeenCalled()
  now += 2 * HOUR_MS
  raw = {
    ...raw,
    status_state: 'final',
    home_team_score: 110,
    visitor_team_score: 98,
    time: null,
  }
  requests.length = 0
  expect(await runner('resolve')).toEqual({
    observed: 2,
    settled: 2,
    attention: 0,
    errors: 0,
  })
  expect(requests.filter((p) => p.endsWith('/games/101'))).toHaveLength(1)
  const a = await loadMarket('one'),
    b = await loadMarket('sibling')
  expect(a.sportsRecordedResult).toEqual(b.sportsRecordedResult)
  expect(a.sportsResultHash).toEqual(b.sportsResultHash)
  expect([a.resolution, b.resolution]).toEqual(['one-1', 'sibling-1'])
  expect(await runner('resolve')).toMatchObject({ observed: 0, settled: 0 })
  now += 2 * HOUR_MS
  raw = { ...raw, home_team_score: 90 }
  expect(await runner('watch')).toMatchObject({
    observed: 2,
    settled: 0,
    attention: 2,
  })
  expect((await loadMarket('one')).resolution).toBe('one-1')
  now += 2 * HOUR_MS
  expect(await runner('watch')).toMatchObject({ attention: 0, settled: 0 })
  now += 15 * DAY_MS
  expect(await listMajorMarkets(pg, house, 'nba', true, now)).toEqual([])
  expect(resolveMarketHelper).toHaveBeenCalledTimes(2)
  expect(sendTextEmail).not.toHaveBeenCalled()
})
const heldId = 'bdl:nba:102'
async function addEarlierMarket() {
  const names = ['Northport Foxes', 'Lake City Owls']
  await addMarket(
    {
      sportsMarketType: 'moneyline',
      sportsProvider: 'bdl',
      sportsLeagueKey: 'nba',
      sportsLeague: 'NBA',
      sportsEventId: heldId,
      sportsStartTimestamp: iso(initial - HOUR_MS),
      sportsHomeTeamId: '11',
      sportsAwayTeamId: '12',
      sportsCompetitionId: phase.competitionId,
      sportsCompetitionPhase: phase.phase,
      sportsEntrantIds: [12, 11],
      sportsTeamNames: names,
      closeTime: initial + DAY_MS,
    },
    'affected',
    names
  )
}
it('holds a new ID and alerts possible-reid when its same-team predecessor has actually vanished', async () => {
  await addEarlierMarket()
  const candidate = await runMajorCreation(
    { league: 'nba' },
    { pg, clock, client }
  )
  expect(candidate.log).toContainEqual(
    expect.objectContaining({
      eventId: 'bdl:nba:101',
      status: 'skipped',
      reason: 'possible-reid: affected',
    })
  )
  expect(await read('select id from contracts')).toEqual([{ id: 'affected' }])
  expect(await runner('sync')).toMatchObject({
    observed: 1,
    attention: 1,
    settled: 0,
    errors: 0,
  })
  expect(await loadMarket('affected')).toMatchObject({
    sportsAttentionReason: 'possible-reid',
    isResolved: false,
  })
  expect(requests).toContain('/nba/v1/games/102')
  expect(resolveMarketHelper).not.toHaveBeenCalled()
})
it('retains the incomplete game for discovery, alerts its existing market, and pays only the confirmed game', async () => {
  await addEarlierMarket()
  otherGames = [
    {
      ...raw,
      id: 102,
      visitor_team: { id: null, full_name: 'Northport Foxes' },
    },
  ]
  const created = await runMajorCreation(
    { league: 'nba' },
    { pg, clock, client }
  )
  expect(created.log).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        eventId: heldId,
        status: 'skipped',
        reason: 'unidentifiable entrants',
      }),
      expect.objectContaining({
        eventId: 'bdl:nba:101',
        status: 'created',
        contractId: 'one',
      }),
    ])
  )
  expect(createSportsContract).toHaveBeenCalledTimes(1)
  expect(quotedIds).toEqual([['101']])
  now = kickoff + HOUR_MS
  raw = {
    ...raw,
    status_state: 'in_progress',
    period: 2,
    home_team_score: 40,
    visitor_team_score: 44,
  }
  otherGames = [
    {
      ...otherGames[0],
      status_state: 'final',
      home_team_score: 130,
      visitor_team_score: 90,
    },
  ]
  expect(await runner('sync')).toMatchObject({
    observed: 2,
    attention: 1,
    settled: 0,
    errors: 0,
  })
  const held = await loadMarket('affected')
  expect(held).toMatchObject({
    isResolved: false,
    sportsAttentionReason: 'unidentifiable entrants',
    sportsHomeScore: null,
    sportsAwayScore: null,
    sportsRecordedResult: null,
    sportsResultHash: null,
  })
  expect(await loadMarket('one')).toMatchObject({ sportsHomeScore: 40 })
  now += 2 * HOUR_MS
  raw = {
    ...raw,
    status_state: 'final',
    home_team_score: 110,
    visitor_team_score: 98,
  }
  expect(await runner('resolve')).toMatchObject({
    observed: 2,
    settled: 1,
    errors: 0,
  })
  expect(
    jest.mocked(resolveMarketHelper).mock.calls.map(([market]) => market.id)
  ).toEqual(['one'])
  expect((await loadMarket('one')).resolution).toBe('one-1')
  expect((await loadMarket('affected')).isResolved).toBe(false)
})
it('is inert for disabled master and phases and excludes other providers, private contracts and fixtures', async () => {
  const m = await create()
  for (const [id, change] of Object.entries({
    odds: { sportsProvider: 'odds' },
    fixture: { sportsFixture: true },
    other: { creatorId: 'another' },
    suffix: { sportsEventId: 'bdl:nba:101:extra' },
  }))
    await addMarket({ ...m, ...change }, id, [])
  await read("update contracts set creator_id='another' where id='other'")
  requests.length = 0
  now = kickoff + HOUR_MS
  for (const flag of [false, true]) {
    if (flag) await read('update sports_competition_switches set enabled=false')
    process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = String(flag)
    for (const job of ['sync', 'resolve', 'watch'] as const)
      expect(await runner(job)).toMatchObject({ observed: 0, settled: 0 })
  }
  expect(requests).toEqual([])
  expect(resolveMarketHelper).not.toHaveBeenCalled()
  await read(
    'update sports_competition_switches set enabled=true where competition_id=$1 and phase=$2',
    [phase.competitionId, phase.phase]
  )
  expect(await runner('sync')).toMatchObject({ observed: 1, settled: 0 })
})
it('rechecks the durable record, authoritative answers and actual enabled switch before paying; rejects stale observations', async () => {
  const m = await create()
  now = kickoff + 3 * HOUR_MS
  raw = {
    ...raw,
    status_state: 'final',
    home_team_score: 87,
    visitor_team_score: 70,
  }
  const g = (await fetchMajorSnapshots(client, 'nba', [{ id: 101 }])).get(101)!
  const write = () =>
    recordMajorObservation(
      pg,
      house,
      'nba',
      m.sportsEventId,
      g,
      now - 1,
      now,
      false,
      () => true,
      false
    )
  const [stored] = await write()
  expect(stored.payout).toBeDefined()
  expect(await write()).toEqual([])
  expect(
    await recordMajorObservation(
      pg,
      house,
      'nba',
      m.sportsEventId,
      g,
      now,
      now - 1,
      false,
      () => true,
      false
    )
  ).toEqual([])
  const settle = () =>
    settleRecordedMajor(
      pg,
      stored.market,
      'nba',
      stored.payout!,
      user,
      clock.now,
      () => true
    )
  await read('update sports_competition_switches set enabled=false')
  await expect(settle()).rejects.toThrow('disabled')
  await read(
    'update sports_competition_switches set enabled=true where phase=$1',
    [phase.phase]
  )
  await read("update answers set resolution='NO' where id='one-1'")
  await expect(settle()).rejects.toThrow('evidence changed')
  await read('update answers set resolution=null')
  await read(
    'update contracts set data=data || \'{"sportsResultHash":"corrected"}\' where id=\'one\''
  )
  await expect(settle()).rejects.toThrow('evidence changed')
  expect((await loadMarket('one')).isResolved).toBe(false)
  expect(
    await settleRecordedMajor(
      pg,
      stored.market,
      'nba',
      stored.payout!,
      user,
      clock.now,
      () => false
    )
  ).toBe(false)
})
it('uses the independent phase/league polling cadence and covers old unresolved and 14-day corrections', async () => {
  const m = await create()
  expect(majorPollDue('resolve', m, 'nba', scorePolling, kickoff - 1)).toBe(
    false
  )
  expect(
    majorPollDue(
      'resolve',
      m,
      'nba',
      { ...scorePolling, leagues: {} },
      kickoff + MINUTE_MS
    )
  ).toBe(false)
  expect(
    majorPollDue('resolve', m, 'nba', scorePolling, kickoff + MINUTE_MS)
  ).toBe(true)
  expect(
    majorPollDue(
      'sync',
      { ...m, sportsLastSyncTime: kickoff },
      'nba',
      scorePolling,
      kickoff + 15 * MINUTE_MS - 1
    )
  ).toBe(false)
  expect(
    majorPollDue('sync', m, 'nba', scorePolling, kickoff + 90 * DAY_MS)
  ).toBe(true)
  expect(
    majorPollDue(
      'watch',
      {
        ...m,
        resolutionTime: kickoff,
        sportsResultHash: 'ok',
        sportsLastCheckedTime: kickoff,
      },
      'nba',
      scorePolling,
      kickoff + HOUR_MS - 1
    )
  ).toBe(false)
})
it('uses the locked answer rows and conflicting sibling evidence during a new terminal read', async () => {
  const m = await create()
  now = kickoff + 2 * HOUR_MS
  raw = {
    ...raw,
    status_state: 'final',
    home_team_score: 7,
    visitor_team_score: 5,
  }
  const g = (await fetchMajorSnapshots(client, 'nba', [{ id: 101 }])).get(101)!
  const write = () =>
    recordMajorObservation(
      pg,
      house,
      'nba',
      m.sportsEventId,
      g,
      now - 1,
      now,
      false,
      () => true,
      false
    )
  await read("update answers set resolution='NO' where id='one-0'")
  let rows = await write()
  expect(rows[0].payout).toBeUndefined()
  expect(rows[0].change.alert).toBe('unexpected market answers')
  await read('update answers set resolution=null')
  await addMarket({ ...m }, 'other', ['Northport Foxes', 'Lake City Owls'])
  await read(
    "update contracts set resolution='CANCEL',data=data||$1::jsonb where id='other'",
    [{ isResolved: true, resolution: 'CANCEL' }]
  )
  now += MINUTE_MS
  rows = await write()
  expect(rows).toHaveLength(1)
  expect(rows[0].change.patch.sportsAttentionReason).toBe(
    'conflicting sibling results'
  )
  expect(rows[0].payout).toBeUndefined()
  // An explicit force-recreation can settle after a prior, mistaken refund.
  await read("update contracts set data=data || $1::jsonb where id='other'", [
    { resolutionTime: initial - 1 },
  ])
  await read(
    "update contracts set data=data - 'sportsAttentionReason' || $1::jsonb where id='one'",
    [{ createdTime: initial }]
  )
  now += MINUTE_MS
  expect((await write())[0].payout?.status).toBe('final')
})
it('rejects an unrelated doubleheader ID and older provider revisions even after a later network response', async () => {
  const m = await create()
  now = kickoff + 2 * HOUR_MS
  const g = (await fetchMajorSnapshots(client, 'nba', [{ id: 101 }])).get(101)!
  const write = (game: typeof g) =>
    recordMajorObservation(
      pg,
      house,
      'nba',
      m.sportsEventId,
      game,
      now,
      now + 1,
      false,
      () => true,
      false
    )
  expect(await write({ ...g, id: 102 })).toEqual([])
  expect(
    await write({ ...g, status: 'in_progress', scoreUpdatedTime: now - 1 })
  ).toHaveLength(1)
  now += MINUTE_MS
  expect(
    await write({ ...g, status: 'final', scoreUpdatedTime: now - HOUR_MS })
  ).toEqual([])
  const revision = now
  expect(
    await write({
      ...g,
      eligible: false,
      entrantIssue: 'unidentifiable entrants',
      away: { id: null, name: null },
      scoreUpdatedTime: revision,
    })
  ).toHaveLength(1)
  expect(await loadMarket('one')).toMatchObject({
    sportsAttentionReason: 'unidentifiable entrants',
    sportsScoreUpdatedTime: revision,
    sportsRecordedResult: null,
  })
  now += MINUTE_MS
  expect(
    await write({ ...g, status: 'final', scoreUpdatedTime: revision - 1 })
  ).toEqual([])
  expect((await loadMarket('one')).sportsRecordedResult).toBeNull()
})

it('retains failed mail across recovery and sends each later correction independently', async () => {
  const m = await create()
  const save = (
    observation: Parameters<typeof recordMajorObservation>[4],
    when: number
  ) =>
    recordMajorObservation(
      pg,
      house,
      'nba',
      m.sportsEventId,
      observation,
      when,
      when,
      false,
      () => true,
      false
    )
  const final = {
    ...raw,
    status_state: 'final',
    home_team_score: 12,
    visitor_team_score: 10,
  }
  const game = (await fetchMajorSnapshots(client, 'nba', [{ id: 101 }])).get(
    101
  )!
  const first = kickoff + HOUR_MS
  await save(undefined, first)
  await save({ ...game, status: 'in_progress' }, first + 1)
  raw = final
  const result = (await fetchMajorSnapshots(client, 'nba', [{ id: 101 }])).get(
    101
  )!
  await save(result, first + 2)
  await save({ ...result, homeScore: 9 }, first + 3)
  await save({ ...result, homeScore: 8 }, first + 4)
  await save({ ...result, homeScore: 8 }, first + 5)
  const pending = () =>
    read<{ reason: string }>(
      'select reason from sports_market_attention_deliveries order by occurred_at'
    )
  expect((await pending()).map((a) => a.reason)).toEqual([
    'missing game',
    'result corrected',
    'result corrected',
  ])
  const send = jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
  await deliverMajorAlerts(pg, 'nba', first + 6, () => true, send)
  expect(send).toHaveBeenCalledTimes(3)
  expect(await pending()).toEqual([{ reason: 'missing game' }])
  await deliverMajorAlerts(pg, 'nba', first + 7, () => true, send)
  expect(send).toHaveBeenCalledTimes(3)
  await deliverMajorAlerts(
    pg,
    'nba',
    first + 6 + 5 * MINUTE_MS,
    () => true,
    send
  )
  expect(send).toHaveBeenCalledTimes(4)
  expect(await pending()).toEqual([])
})

it('retries an acknowledged mail when the local transaction rolls back, and keeps its identity', async () => {
  const m = await create()
  await recordMajorObservation(
    pg,
    house,
    'nba',
    m.sportsEventId,
    undefined,
    kickoff + 1,
    kickoff + 1,
    false,
    () => true,
    false
  )
  const rollback = {
    tx: (fn: (tx: SupabaseTransaction) => Promise<unknown>) =>
      pg.tx(async (tx) => {
        await fn(tx)
        throw new Error('simulated transaction rollback')
      }),
  } as unknown as SupabaseDirectClient
  const send = jest.fn().mockResolvedValue(true)
  await expect(
    deliverMajorAlerts(rollback, 'nba', kickoff + 2, () => true, send)
  ).rejects.toThrow('simulated transaction rollback')
  expect(
    await read('select incident_key from sports_market_attention_deliveries')
  ).toHaveLength(1)
  await deliverMajorAlerts(pg, 'nba', kickoff + 3, () => true, send)
  expect(send).toHaveBeenCalledTimes(2)
  expect(send.mock.calls[1]).toEqual(send.mock.calls[0])
  expect(
    await read('select incident_key from sports_market_attention_deliveries')
  ).toHaveLength(0)
})

it('holds a different paid sibling outcome or contradictory native weights through the payout boundary', async () => {
  const m = await create()
  now = kickoff + 2 * HOUR_MS
  raw = {
    ...raw,
    status_state: 'final',
    home_team_score: 85,
    visitor_team_score: 73,
  }
  const g = (await fetchMajorSnapshots(client, 'nba', [{ id: 101 }])).get(101)!
  const [offer] = await recordMajorObservation(
    pg,
    house,
    'nba',
    m.sportsEventId,
    g,
    now,
    now,
    false,
    () => true,
    false
  )
  expect(offer.payout).toBeDefined()
  await addMarket({ ...offer.market }, 'second', [
    'Northport Foxes',
    'Lake City Owls',
  ])
  const modify = async (
    resolution: string,
    weights: Record<string, number>
  ) => {
    await read(
      "update contracts set resolution=$1,data=data||$2::jsonb where id='second'",
      [resolution, { isResolved: true, resolution, resolutions: weights }]
    )
    await read(
      "update answers set prob=coalesce(($1::jsonb->>id)::float/100,0) where contract_id='second'",
      [weights]
    )
  }
  await modify('second-0', { 'second-0': 100 })
  expect(
    await settleRecordedMajor(
      pg,
      offer.market,
      'nba',
      offer.payout!,
      user,
      clock.now,
      () => true
    )
  ).toBe(false)
  await modify('second-1', { 'second-0': 100 })
  expect(
    await settleRecordedMajor(
      pg,
      offer.market,
      'nba',
      offer.payout!,
      user,
      clock.now,
      () => true
    )
  ).toBe(false)
  expect(resolveMarketHelper).not.toHaveBeenCalled()
  await modify('second-1', { 'second-1': 100 })
  await read("update answers set prob=0.5 where contract_id='second'")
  expect(
    await settleRecordedMajor(
      pg,
      offer.market,
      'nba',
      offer.payout!,
      user,
      clock.now,
      () => true
    )
  ).toBe(false)
  await modify('second-1', { 'second-1': 100 })
  expect(
    await settleRecordedMajor(
      pg,
      offer.market,
      'nba',
      offer.payout!,
      user,
      clock.now,
      () => true
    )
  ).toBe(true)
})
it('orders overlapping source revisions and requires a fresh serial read after an unversioned disagreement', async () => {
  const m = await create(),
    start = kickoff + HOUR_MS
  raw = {
    ...raw,
    status_state: 'final',
    home_team_score: 85,
    visitor_team_score: 73,
  }
  const g = (await fetchMajorSnapshots(client, 'nba', [{ id: 101 }])).get(101)!
  const write = (row: typeof g, request: number, received: number) =>
    recordMajorObservation(
      pg,
      house,
      'nba',
      m.sportsEventId,
      row,
      request,
      received,
      false,
      () => true,
      false
    )
  expect(
    (await write({ ...g, scoreUpdatedTime: start }, start, start + 10))[0]
      .payout
  ).toBeDefined()
  const newer = (
    await write(
      { ...g, status: 'in_progress', scoreUpdatedTime: start + 20 },
      start + 5,
      start + 25
    )
  )[0]
  expect(newer.change.patch.sportsRevisionWatermark).toBe(start + 20)
  expect(newer.payout).toBeUndefined()
  expect(
    await write({ ...g, scoreUpdatedTime: start }, start + 30, start + 31)
  ).toEqual([])
  const delayed = (
    await write({ ...g, scoreUpdatedTime: undefined }, start + 5, start + 35)
  )[0]
  expect(delayed.change.patch.sportsAttentionReason).toBe('result corrected')
  expect(delayed.payout).toBeUndefined()
})

it.each([15, 20, 30])(
  'revokes a pending unversioned cancellation for intersecting acquisitions completed at offset %i until a fresh serial read',
  async (completion) => {
    const m = await create(),
      t = kickoff + HOUR_MS
    raw = { ...raw, status_state: 'canceled', status: 'Canceled' }
    const g = (await fetchMajorSnapshots(client, 'nba', [{ id: 101 }])).get(
      101
    )!
    const write = (state: typeof g, begin: number, end: number) =>
      recordMajorObservation(
        pg,
        house,
        'nba',
        m.sportsEventId,
        state,
        begin,
        end,
        false,
        () => true,
        false
      )
    expect((await write(g, t, t + 20))[0].change.record?.status).toBe(
      'canceled'
    )
    const conflict = (
      await write({ ...g, status: 'in_progress' }, t + 10, t + completion)
    )[0]
    expect(conflict.change.patch.sportsAttentionReason).toBe(
      'unconfirmed observation order'
    )
    expect(conflict.change.patch.sportsCanceledSince).toBeNull()
    const recovered = (await write(g, t + 31, t + 40))[0]
    expect(recovered.change.record?.status).toBe('canceled')
    expect(recovered.change.patch.sportsCanceledSince).toBe(t + 40)
  }
)
