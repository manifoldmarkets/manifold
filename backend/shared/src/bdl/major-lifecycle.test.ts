import { readFileSync } from 'fs'
import { join } from 'path'
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
import { runMajorLifecycle, majorPollDue } from './major-lifecycle'
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
const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(join(__dirname, '../../test/fixtures/bdl/nba', name), 'utf8')
  ).data[0]
const original = fixture('games__spec-major-slate.json')
let raw: Record<string, unknown>
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
    create table answers(id text primary key,contract_id text,index int,text text,resolution text,resolution_time timestamptz,is_other boolean);
    create table sports_competition_switches (competition_id text,phase text,enabled boolean,updated_time timestamptz default now(),updated_by text);
    create table sports_score_polling(target text,interval_seconds int,updated_time timestamptz default now(),updated_by text);
    create table groups(id text,slug text,privacy_status text);
    create table sports_creation_settings(scope text,ante_cap int,base_ante int,starts_on date,group_slugs text[]);
    insert into groups values('topic','sports','public');
    insert into sports_score_polling(target,interval_seconds) values('league:nba',30);
    insert into sports_creation_settings values('nba',1000,100,'2026-11-01','{sports}'),('wave:1',9999,null,null,null),('global',9999,null,null,null);`)
})
beforeEach(async () => {
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
  await db.exec('truncate contracts, answers, sports_competition_switches')
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
      if (path === '/nba/v1/games/101') data = raw
      else if (path === '/nba/v1/games')
        data = u.searchParams.getAll('dates[]').includes(String(raw.date))
          ? [raw]
          : []
      else if (path === '/nba/v2/odds')
        data = [
          {
            ...fixture('odds__spec-major-moneyline.json'),
            updated_at: iso(now),
          },
        ]
      else if (path === '/nba/v1/standings')
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
  expect((await loadMarket('one')).sportsRecordedResult).toBeNull()
})
