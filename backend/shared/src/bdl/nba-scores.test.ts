import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as pgPromise from 'pg-promise'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { resolveOddsSportsMarkets } from 'scheduler/jobs/sports-odds-resolve'
import { BdlClientOptions, createBdlClient } from '../balldontlie-client'
import { pollOddsScoresAndResolve } from '../odds-markets'
import { publishSportsLiveScore } from '../publish-sports-live-score'
import { createSupabaseDirectClient } from '../supabase/init'
import { hasOddsApiKey } from '../the-odds-api-client'
import { fetchMajorGames } from './major-games'
import * as nbaScores from './nba-scores'
import { nbaScorePatch, pollNbaScores } from './nba-scores'
import { settleNbaGame } from './settle-nba-game'

jest.mock('./settle-nba-game', () => ({ settleNbaGame: jest.fn() }))

jest.mock('../balldontlie-client', () => ({
  ...jest.requireActual('../balldontlie-client'),
  createBdlClient: jest.fn(),
}))
jest.mock('./request-stats', () => ({
  recordServiceBdlResponse: jest.fn(),
  reportBdlRequestIssue: jest.fn(),
}))
jest.mock('../supabase/init', () => ({ createSupabaseDirectClient: jest.fn() }))
jest.mock('../utils', () => ({
  isProd: () => true,
  log: Object.assign(jest.fn(), { error: jest.fn() }),
}))
jest.mock('../publish-sports-live-score', () => ({
  publishSportsLiveScore: jest.fn(),
}))
jest.mock('../the-odds-api-client', () => ({ hasOddsApiKey: jest.fn() }))
jest.mock('../odds-markets', () => ({
  newScorePollState: () => ({}),
  pollOddsScoresAndResolve: jest.fn(),
}))

type Row = Record<string, unknown>
const fixture = (name: string): Row =>
  JSON.parse(
    readFileSync(
      join(
        __dirname,
        '../../test/fixtures/bdl/nba',
        'games__recorded-' + name + '.json'
      ),
      'utf8'
    )
  ).data[0]
const live = fixture('76ers-bucks-live')
const final = fixture('76ers-bucks-final')
const kickoff = String(live.datetime)
const phase = 'Regular Season (BDL)'
const competition = 'nba-regular-2026-27'
const pgp = pgPromise()
let db: PGlite
const rows = async (sql: string, params?: unknown[]) =>
  (await db.query<Row>(pgp.as.format(sql, params))).rows
let beforeCandidates: (() => Promise<void>) | undefined
let beforeSettings: (() => Promise<void>) | undefined
let afterWrite: (() => Promise<unknown>) | undefined
const pg = {
  manyOrNone: async (sql: string, params: unknown[]) => {
    await beforeCandidates?.()
    return rows(sql, params)
  },
  oneOrNone: async (sql: string, params: unknown[]) => {
    const result = (await rows(sql, params))[0] ?? null
    if (result) await afterWrite?.()
    return result
  },
  map: async (sql: string, params: unknown[], map: (row: Row) => unknown) => {
    if (sql.includes('from sports_score_polling')) await beforeSettings?.()
    return (await rows(sql, params)).map(map)
  },
} as unknown as ReturnType<typeof createSupabaseDirectClient>
let now: number
let wire: Row[]
let beforeResponse: (() => Promise<unknown>) | undefined
const requests: URL[] = []
const makeClient = jest.requireActual<typeof import('../balldontlie-client')>(
  '../balldontlie-client'
).createBdlClient
const restore = {
  master: process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED,
  key: process.env.BALLDONTLIE_API_KEY,
}
let seq = 0
async function market(fields: Row = {}) {
  const id = 'game' + ++seq
  const data = {
    sportsProvider: 'bdl',
    sportsLeagueKey: 'nba',
    sportsMarketType: 'moneyline',
    sportsStartKnown: true,
    sportsEventId: 'bdl:nba:21718156',
    closeTime: Date.parse(kickoff) + 3 * 3_600_000,
    sportsHomeTeam: 'Philadelphia 76ers',
    sportsAwayTeam: 'Milwaukee Bucks',
    sportsHomeTeamId: '23',
    sportsAwayTeamId: '17',
    sportsCompetitionId: competition,
    sportsStartTimestamp: kickoff,
    ...fields,
  }
  await db.query(
    "insert into contracts values ($1,$2,'MANA','public',false,null,'cpmm-multi-2',$3,$4::jsonb)",
    [
      id,
      MANIFOLD_SPORTS_USER_IDS[0],
      new Date(Date.parse(kickoff) + 3 * 3_600_000),
      JSON.stringify(data),
    ]
  )
  return id
}
const stored = async (id: string) =>
  (
    await db.query<{ data: Row }>('select data from contracts where id = $1', [
      id,
    ])
  ).rows[0].data
jest.setTimeout(30_000)
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create table contracts(id text primary key, creator_id text, token text, visibility text, deleted boolean, resolution text, mechanism text, close_time timestamptz, data jsonb);
    create table sports_score_polling(target text,interval_seconds integer,updated_by text,updated_time timestamptz);
    create table sports_competition_switches(competition_id text,phase text,enabled boolean,updated_by text,updated_time timestamptz);`)
})
beforeEach(async () => {
  jest.clearAllMocks()
  jest
    .mocked(settleNbaGame)
    .mockImplementation(async (_pg, id, _identity, _score, enabled, signal) => {
      if (!(await enabled()) || signal?.aborted) return
      await db.query('update contracts set resolution=$1 where id=$2', [
        'named-answer',
        id,
      ])
    })
  jest.mocked(createSupabaseDirectClient).mockReturnValue(pg)
  jest.mocked(hasOddsApiKey).mockReturnValue(false)
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
  process.env.BALLDONTLIE_API_KEY = 'offline-test'
  await db.exec(
    'truncate contracts,sports_score_polling,sports_competition_switches'
  )
  await db.query(
    'insert into sports_competition_switches values($1,$2,true,null,null)',
    [competition, phase]
  )
  await db.exec(
    "insert into sports_score_polling values ('league:nba',60,null,null)"
  )
  now = Date.parse('2026-11-21T18:19:40.469Z')
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  wire = [live]
  requests.length = 0
  beforeResponse = undefined
  beforeCandidates = undefined
  beforeSettings = undefined
  afterWrite = undefined
  const clock = {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms
    },
  }
  jest
    .mocked(createBdlClient)
    .mockImplementation((opts: BdlClientOptions = {}) =>
      makeClient({
        ...opts,
        clock,
        transport: async (url) => {
          requests.push(new URL(url))
          await beforeResponse?.()
          return new Response(JSON.stringify({ data: wire }), { status: 200 })
        },
      })
    )
})
afterEach(() => jest.restoreAllMocks())
afterAll(async () => {
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_SPORTS_BDL_ENABLED: restore.master,
    BALLDONTLIE_API_KEY: restore.key,
  })) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await db.close()
})

it('runs the recorded NBA game on the native tick without an Odds credential; binds both orientations and the actual close', async () => {
  const home = await market(),
    reversed = await market({
      sportsHomeTeamId: '17',
      sportsAwayTeamId: '23',
      sportsHomeTeam: 'Milwaukee Bucks',
      sportsAwayTeam: 'Philadelphia 76ers',
    })
  await resolveOddsSportsMarkets()
  expect(requests.map((r) => r.pathname)).toEqual(['/nba/v1/games'])
  expect(await stored(home)).toMatchObject({
    sportsHomeScore: 8,
    sportsAwayScore: 15,
    sportsLiveStatus: 'IN_PLAY',
    sportsLiveUpdatedTime: now,
    sportsScoreUpdatedTime: null,
  })
  expect(await stored(reversed)).toMatchObject({
    sportsHomeScore: 15,
    sportsAwayScore: 8,
  })
  expect(publishSportsLiveScore).toHaveBeenCalledTimes(2)
  await resolveOddsSportsMarkets()
  expect(requests).toHaveLength(1)
  wire = [final]
  now = Date.parse('2026-11-21T20:46:05.674Z')
  await resolveOddsSportsMarkets()
  expect((await stored(home)).closeTime).toBe(now - 1)
  expect((await stored(reversed)).sportsHomeScore).toBe(129)
  expect(settleNbaGame).toHaveBeenCalledTimes(2)
  expect(await stored(home)).toMatchObject({
    sportsHomeScore: 132,
    sportsAwayScore: 129,
    sportsLiveStatus: 'FINISHED',
  })
  expect(
    (await rows('select resolution from contracts')).map((r) => r.resolution)
  ).toEqual(['named-answer', 'named-answer'])
  expect(publishSportsLiveScore).toHaveBeenCalledTimes(4)
  now += 60_000
  await resolveOddsSportsMarkets()
  expect(requests).toHaveLength(2)
  expect(pollOddsScoresAndResolve).not.toHaveBeenCalled()
})

it('keeps scheduled, unknown, malformed, replaced and conflicted siblings out of the healthy score', async () => {
  const healthy = await market()
  const badRows: Row[] = [
    fixture('major-slate'),
    { ...live, status_state: 'unknown' },
    { ...live, home_team_score: -1 },
    { ...live, visitor_team_score: null },
    { ...live, visitor_team: null },
    { ...live, home_team: live.visitor_team },
    { ...final, visitor_team_score: final.home_team_score },
    { ...final, status: 'Final - Forfeit' },
  ]
  const siblings: string[] = []
  for (const [i, raw] of badRows.entries()) {
    const id = 99 + i
    siblings.push(await market({ sportsEventId: 'bdl:nba:' + id }))
    wire.push({ ...raw, id })
  }
  siblings.push(await market({ sportsHomeTeamId: '999' }))
  siblings.push(await market({ sportsEventId: 'bdl:nba:201' }))
  wire.push({ ...live, id: 201 }, { ...live, id: 201, home_team_score: 42 })
  await resolveOddsSportsMarkets()
  expect(requests).toHaveLength(1)
  expect(publishSportsLiveScore).toHaveBeenCalledTimes(1)
  expect((await stored(healthy)).sportsHomeScore).toBe(8)
  for (const id of siblings)
    expect((await stored(id)).sportsLiveStatus).toBeUndefined()
})

it('per-game cadence overrides the league, requires an enabled BDL phase, and does no I/O with the master off', async () => {
  const id = await market()
  await db.exec('update sports_score_polling set interval_seconds=0')
  await resolveOddsSportsMarkets()
  await db.query('insert into sports_score_polling values ($1,30,null,null)', [
    'game:' + id,
  ])
  await db.exec('update sports_competition_switches set enabled=false')
  await resolveOddsSportsMarkets()
  await db.exec('update sports_competition_switches set enabled=true')
  delete process.env.BALLDONTLIE_API_KEY
  await resolveOddsSportsMarkets()
  expect(requests).toHaveLength(0)
  process.env.BALLDONTLIE_API_KEY = 'offline-test'
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'false'
  jest.mocked(hasOddsApiKey).mockReturnValue(true)
  jest.mocked(pollOddsScoresAndResolve).mockResolvedValue({
    polled: 0,
    live: 0,
    resolved: 0,
    pending: 0,
    errors: 0,
  })
  await resolveOddsSportsMarkets()
  expect(pollOddsScoresAndResolve).toHaveBeenCalledTimes(1)
  expect(requests).toHaveLength(0)
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
  jest.mocked(hasOddsApiKey).mockReturnValue(false)
  await resolveOddsSportsMarkets()
  expect(requests).toHaveLength(1)
  now += 29_999
  await resolveOddsSportsMarkets()
  expect(requests).toHaveLength(1)
  now++
  await resolveOddsSportsMarkets()
  expect(requests).toHaveLength(2)
  await db.exec("delete from sports_score_polling where target like 'game:%'")
  now += 60_000
  await resolveOddsSportsMarkets()
  expect(requests).toHaveLength(2)
})

it('keeps an authorized Odds tick independent of a slow NBA read and coalesces concurrent NBA ticks', async () => {
  const id = await market()
  let started!: () => void
  const reading = new Promise<void>((resolve) => {
    started = resolve
  })
  let finish!: () => void
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  beforeResponse = () => {
    started()
    return pending
  }
  jest.mocked(hasOddsApiKey).mockReturnValue(true)
  jest.mocked(pollOddsScoresAndResolve).mockResolvedValue({
    polled: 0,
    live: 0,
    resolved: 0,
    pending: 0,
    errors: 0,
  })
  await resolveOddsSportsMarkets()
  await reading
  await resolveOddsSportsMarkets()
  expect(pollOddsScoresAndResolve).toHaveBeenCalledTimes(2)
  expect(requests).toHaveLength(1)
  expect(publishSportsLiveScore).not.toHaveBeenCalled()
  jest.mocked(hasOddsApiKey).mockReturnValue(false)
  const completed = resolveOddsSportsMarkets()
  finish()
  await completed
  expect((await stored(id)).sportsLiveStatus).toBe('IN_PLAY')
})

it.each(['game', 'league', 'phase'])(
  'rechecks the %s opt-out between two finals from one slate',
  async (scope) => {
    const first = await market()
    const second = await market({ sportsEventId: 'bdl:nba:101' })
    // A normal live poll one minute earlier paid for the first look. Only its
    // 60-second live cadence is due on this read, not the five-minute final.
    wire = [live, { ...live, id: 101 }]
    now = Date.parse('2026-11-21T20:45:05.674Z')
    await resolveOddsSportsMarkets()
    requests.length = 0
    jest.mocked(publishSportsLiveScore).mockClear()
    wire = [final, { ...final, id: 101 }]
    now += 60_000
    let held = ''
    jest
      .mocked(publishSportsLiveScore)
      .mockImplementationOnce(async (published) => {
        held = published === first ? second : first
        if (scope === 'phase')
          await db.exec('update sports_competition_switches set enabled=false')
        else if (scope === 'league')
          await db.exec('update sports_score_polling set interval_seconds=0')
        else
          await db.query(
            'insert into sports_score_polling values ($1,0,null,null)',
            ['game:' + held]
          )
      })
    await resolveOddsSportsMarkets()
    expect(requests).toHaveLength(1)
    expect(publishSportsLiveScore).toHaveBeenCalledTimes(1)
    expect((await stored(held)).sportsLiveStatus).toBe('IN_PLAY')
    expect(
      (await stored(held === first ? second : first)).sportsLiveStatus
    ).toBe('FINISHED')

    await db.exec('update sports_competition_switches set enabled=true')
    const paid = (
      await rows('select id from contracts where resolution is not null')
    ).map((r) => r.id)
    expect(paid).toEqual(
      scope === 'game' ? [held === first ? second : first] : []
    )
    await db.exec('update sports_score_polling set interval_seconds=60')
    now += 300_000
    await resolveOddsSportsMarkets()
    expect((await stored(held)).sportsLiveStatus).toBe('FINISHED')
    expect(
      await rows('select id from contracts where resolution is not null')
    ).toHaveLength(2)
  }
)

it('suppresses a publish when the game is disabled during an issued score write', async () => {
  const id = await market()
  afterWrite = () =>
    db.query('insert into sports_score_polling values ($1,0,null,null)', [
      'game:' + id,
    ])
  await resolveOddsSportsMarkets()
  expect((await stored(id)).sportsLiveStatus).toBe('IN_PLAY')
  expect(publishSportsLiveScore).not.toHaveBeenCalled()
})

it('aborts a run during final publication, then pays its closed fixture only on a fresh authorized read', async () => {
  const id = await market()
  wire = [final]
  now = Date.parse('2026-11-21T20:46:05.674Z')
  const controller = new AbortController()
  jest
    .mocked(publishSportsLiveScore)
    .mockImplementationOnce(async () => controller.abort())
  await pollNbaScores(pg, new Map(), controller.signal)
  expect((await stored(id)).closeTime).toBe(now - 1)
  expect(settleNbaGame).not.toHaveBeenCalled()
  expect(
    (await rows('select resolution from contracts'))[0].resolution
  ).toBeNull()
  now++
  await pollNbaScores(pg, new Map())
  expect((await rows('select resolution from contracts'))[0].resolution).toBe(
    'named-answer'
  )
})

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

it.each(['candidate scan', 'quota permission', 'provider response'])(
  'starts a replacement tick after a stalled %s and discards the abandoned result',
  async (stage) => {
    const id = await market()
    const entered = deferred()
    const blocked = deferred()
    const stall = () => {
      entered.release()
      return blocked.promise
    }
    let settingsReads = 0
    if (stage === 'candidate scan') beforeCandidates = stall
    // Due-market discovery, then client authorization, then the shared quota grant.
    if (stage === 'quota permission')
      beforeSettings = async () => {
        if (++settingsReads === 3) await stall()
      }
    if (stage === 'provider response') beforeResponse = stall
    const timers = jest.spyOn(global, 'setTimeout')
    const polls = jest.spyOn(nbaScores, 'pollNbaScores')
    const first = resolveOddsSportsMarkets()
    await entered.promise
    const coalesced = resolveOddsSportsMarkets()
    expect(polls).toHaveBeenCalledTimes(1)
    const timeout = timers.mock.calls.find(([, ms]) => ms === 180_000)
    expect(timeout).toBeDefined()
    now += 180_000
    timeout![0]()
    await Promise.all([first, coalesced])
    expect((await stored(id)).sportsLiveStatus).toBeUndefined()

    beforeCandidates = undefined
    beforeSettings = undefined
    const replacement = deferred()
    const complete = deferred()
    beforeResponse = () => {
      replacement.release()
      return complete.promise
    }
    const fresh = resolveOddsSportsMarkets()
    // Even the abandoned quota check must give up its shared grant before it returns.
    await replacement.promise
    blocked.release()
    await Promise.allSettled([polls.mock.results[0].value])
    expect((await stored(id)).sportsLiveStatus).toBeUndefined()
    expect(publishSportsLiveScore).not.toHaveBeenCalled()
    const concurrent = resolveOddsSportsMarkets()
    expect(polls).toHaveBeenCalledTimes(2)
    complete.release()
    await Promise.all([fresh, concurrent])
    expect(requests).toHaveLength(stage === 'provider response' ? 2 : 1)
    expect((await stored(id)).sportsLiveStatus).toBe('IN_PLAY')
    expect(publishSportsLiveScore).toHaveBeenCalledTimes(1)
  }
)

it('rechecks identity, visibility, phase and actual close after a slow fetch', async () => {
  const changed = await market(),
    hidden = await market(),
    extended = await market(),
    healthy = await market()
  wire = [final]
  now = Date.parse('2026-11-21T21:01:00Z')
  beforeResponse = async () => {
    await db.query(
      `update contracts set data=jsonb_set(data,'{sportsEventId}','"bdl:nba:123"') where id=$1`,
      [changed]
    )
    await db.query("update contracts set visibility='private' where id=$1", [
      hidden,
    ])
    await db.query(
      "update contracts set close_time=close_time+interval '1 hour' where id=$1",
      [extended]
    )
  }
  await resolveOddsSportsMarkets()
  expect((await stored(healthy)).sportsLiveStatus).toBe('FINISHED')
  expect((await stored(extended)).sportsLiveStatus).toBe('FINISHED')
  for (const id of [changed, hidden])
    expect((await stored(id)).sportsLiveStatus).toBeUndefined()
  beforeResponse = () =>
    db.exec('update sports_competition_switches set enabled=false')
  await market()
  now += 60_000
  await resolveOddsSportsMarkets()
  expect(publishSportsLiveScore).toHaveBeenCalledTimes(2)
})

it('polls finals without live scores only on an enabled phase, then retries an unpaid closed final on restart', async () => {
  const id = await market()
  await db.exec(
    "update sports_score_polling set interval_seconds=0; insert into sports_score_polling values ('finals',600,null,null)"
  )
  now = Date.parse('2026-11-21T21:01:00Z')
  await db.exec('update sports_competition_switches set enabled=false')
  await pollNbaScores(pg, new Map())
  expect(requests).toHaveLength(0)
  await db.exec('update sports_competition_switches set enabled=true')
  const attempts = new Map<string, number>()
  await pollNbaScores(pg, attempts)
  expect(requests).toHaveLength(1)
  expect((await stored(id)).sportsLiveStatus).toBeUndefined()
  wire = [final]
  now += 599_999
  await pollNbaScores(pg, attempts)
  expect(requests).toHaveLength(1)
  now++
  jest.mocked(settleNbaGame).mockRejectedValueOnce(new Error('interrupted'))
  await pollNbaScores(pg, attempts)
  expect((await stored(id)).sportsLiveStatus).toBe('FINISHED')
  expect((await stored(id)).closeTime).toBe(Date.parse('2026-11-21T21:00:00Z'))
  expect(
    (await rows('select resolution from contracts'))[0].resolution
  ).toBeNull()
  now += 1
  await pollNbaScores(pg, new Map())
  expect((await rows('select resolution from contracts'))[0].resolution).toBe(
    'named-answer'
  )
  expect(settleNbaGame).toHaveBeenCalledTimes(2)
})

it('keeps a concurrently written score and rejects another copy of the same receipt', async () => {
  const id = await market()
  beforeResponse = async () => {
    const newer = {
      sportsHomeScore: 12,
      sportsAwayScore: 18,
      sportsLiveStatus: 'IN_PLAY',
      sportsLiveUpdatedTime: now + 1,
    }
    await db.query('update contracts set data=data || $1::jsonb where id=$2', [
      JSON.stringify(newer),
      id,
    ])
    now += 2
  }
  await resolveOddsSportsMarkets()
  expect(await stored(id)).toMatchObject({
    sportsHomeScore: 12,
    sportsAwayScore: 18,
  })
  expect(publishSportsLiveScore).not.toHaveBeenCalled()
  beforeResponse = async () => {
    await db.query('update contracts set data=data || $1::jsonb where id=$2', [
      JSON.stringify({ sportsLiveUpdatedTime: now }),
      id,
    ])
  }
  now += 60_000
  await resolveOddsSportsMarkets()
  expect(publishSportsLiveScore).not.toHaveBeenCalled()
  expect(await stored(id)).toMatchObject({
    sportsHomeScore: 12,
    sportsAwayScore: 18,
  })
})

it('orients the recorded Detroit final by provider IDs independently of answer order and calendar eligibility', async () => {
  wire = [fixture('final')]
  const date = String(wire[0].date)
  const client = makeClient({
    role: 'recorder',
    key: 'offline-test',
    transport: async () => new Response(JSON.stringify({ data: wire })),
  })
  const [game] = await fetchMajorGames(
    client,
    'nba',
    date,
    date,
    new Set([21717855])
  )
  expect(nbaScorePatch({ home: '9', away: '2' }, game, now)).toMatchObject({
    sportsHomeScore: 121,
    sportsAwayScore: 113,
    sportsLiveStatus: 'FINISHED',
  })
})
