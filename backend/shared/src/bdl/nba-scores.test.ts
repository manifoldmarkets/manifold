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
import { nbaScorePatch } from './nba-scores'
import { settlePendingNbaGames } from './settle-nba-game'
jest.mock('./settle-nba-game', () => ({
  settlePendingNbaGames: jest.fn().mockResolvedValue(''),
}))

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
let afterWrite: ((id: string) => Promise<unknown>) | undefined
const pg = {
  manyOrNone: async (sql: string, params: unknown[]) => {
    await beforeCandidates?.()
    return rows(sql, params)
  },
  oneOrNone: async (sql: string, params: unknown[]) => {
    const result = (await rows(sql, params))[0] ?? null
    if (result) await afterWrite?.(String(params[1]))
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
    sportsHomeTeamId: '23',
    sportsHomeTeam: 'Philadelphia 76ers',
    sportsAwayTeam: 'Milwaukee Bucks',
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
  expect(await stored(home)).toMatchObject({
    closeTime: now - 1,
    sportsHomeScore: 132,
    sportsAwayScore: 129,
    sportsLiveStatus: 'FINISHED',
    sportsFinalObservation: expect.objectContaining({
      sportsEventId: 'bdl:nba:21718156',
      sportsAwayScore: 129,
      sportsHomeScore: 132,
      sportsHomeTeamId: '23',
      sportsLiveUpdatedTime: now,
    }),
  })
  expect(
    (await rows('select resolution from contracts')).map((r) => r.resolution)
  ).toEqual([null, null])
  expect(publishSportsLiveScore).toHaveBeenCalledTimes(4)
  now += 60_000
  await resolveOddsSportsMarkets()
  expect(requests).toHaveLength(2)
  expect(pollOddsScoresAndResolve).not.toHaveBeenCalled()
})

it('shortens the exact equality millisecond when closing a recorded final', async () => {
  const id = await market()
  wire = [final]
  now = Date.parse('2026-11-21T21:00:00Z')
  await resolveOddsSportsMarkets()
  expect(requests).toHaveLength(1)
  expect(await stored(id)).toMatchObject({
    sportsLiveStatus: 'FINISHED',
    closeTime: now - 1,
  })
  expect(publishSportsLiveScore).toHaveBeenCalledTimes(1)
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
    { ...live, status_state: 'final', home_team_score: 15 },
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
    wire = [final, { ...final, id: 101 }]
    // Before finals-only cadence starts, a live read may report an early final.
    now = Date.parse('2026-11-21T20:09:00Z')
    let held = ''
    afterWrite = async (written) => {
      afterWrite = undefined
      held = written === first ? second : first
      if (scope === 'phase')
        await db.exec('update sports_competition_switches set enabled=false')
      else if (scope === 'league')
        await db.exec('update sports_score_polling set interval_seconds=0')
      else
        await db.query(
          'insert into sports_score_polling values ($1,0,null,null)',
          ['game:' + held]
        )
    }
    await resolveOddsSportsMarkets()
    expect(requests).toHaveLength(1)
    expect(publishSportsLiveScore).toHaveBeenCalledTimes(
      scope === 'game' ? 1 : 0
    )
    expect((await stored(held)).sportsLiveStatus).toBeUndefined()
    expect(
      (await stored(held === first ? second : first)).sportsLiveStatus
    ).toBe('FINISHED')

    await db.exec('update sports_competition_switches set enabled=true')
    await db.exec('update sports_score_polling set interval_seconds=60')
    now += 60_000
    await resolveOddsSportsMarkets()
    expect((await stored(held)).sportsLiveStatus).toBe('FINISHED')
    expect(publishSportsLiveScore).toHaveBeenCalledTimes(
      scope === 'game' ? 2 : 1
    )
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
  for (const id of [changed, hidden, extended])
    expect((await stored(id)).sportsLiveStatus).toBeUndefined()
  beforeResponse = () =>
    db.exec('update sports_competition_switches set enabled=false')
  await market()
  now += 60_000
  await resolveOddsSportsMarkets()
  expect(publishSportsLiveScore).toHaveBeenCalledTimes(1)
})

it('commits both verified finals before the first broadcast and preserves an earlier close', async () => {
  const first = await market()
  const second = await market({ sportsEventId: 'bdl:nba:101' })
  const earlier = Date.parse(kickoff) + 90 * 60_000
  await db.query('update contracts set close_time=$1 where id=$2', [
    new Date(earlier),
    second,
  ])
  wire = [final, { ...final, id: 101 }]
  now = Date.parse('2026-11-21T20:46:05.674Z')
  let atFirstBroadcast: Row[] = []
  jest.mocked(publishSportsLiveScore).mockImplementationOnce(async () => {
    atFirstBroadcast = await Promise.all([stored(first), stored(second)])
    throw new Error('isolated delivery failure')
  })
  await resolveOddsSportsMarkets()
  expect(atFirstBroadcast).toEqual([
    expect.objectContaining({
      sportsLiveStatus: 'FINISHED',
      closeTime: now - 1,
    }),
    expect.objectContaining({
      sportsLiveStatus: 'FINISHED',
      closeTime: earlier,
    }),
  ])
  expect(requests).toHaveLength(1)
  expect(publishSportsLiveScore).toHaveBeenCalledTimes(2)
})

it('retains the 300-second live cadence under 60-second finals checks', async () => {
  const id = await market()
  await db.exec(
    "update sports_score_polling set interval_seconds=300; insert into sports_score_polling values ('finals',60,null,null)"
  )
  now = Date.parse('2026-11-21T20:10:00Z')
  for (let minute = 0; minute <= 5; minute++) {
    wire = [{ ...live, home_team_score: 80 + minute }]
    await resolveOddsSportsMarkets()
    expect((await stored(id)).sportsHomeScore).toBe(minute === 5 ? 85 : 80)
    now += 60_000
  }
  expect(requests).toHaveLength(6)
  expect(publishSportsLiveScore).toHaveBeenCalledTimes(2)
})

it('checks finals with live polling off and holds contradictory or incomplete evidence independently', async () => {
  await db.exec('update sports_score_polling set interval_seconds=0')
  now = Date.parse('2026-11-21T20:09:59.999Z')
  const good = await market()
  const variants = [
    { status: 'Forfeit' },
    { status: 'Postponed' },
    { time: 'Q4 1:31' },
    { period: 2 },
    { status_state: 'canceled' },
    { visitor_team_score: null },
    { visitor_team_score: 132 },
    { datetime: '2026-11-21T18:15:00Z' },
  ]
  wire = [{ ...final, status: 'Final/OT', period: 5 }]
  const held: string[] = []
  for (const [i, fields] of variants.entries()) {
    held.push(await market({ sportsEventId: 'bdl:nba:' + (100 + i) }))
    wire.push({ ...final, ...fields, id: 100 + i })
  }
  const named = await market({ sportsAwayTeam: 'Unconfirmed team' })
  const attention = await market({ sportsAttentionReason: 'Check fixture' })
  await resolveOddsSportsMarkets()
  expect(requests).toHaveLength(0)
  now++
  await resolveOddsSportsMarkets()
  expect(requests).toHaveLength(1)
  expect(await stored(good)).toMatchObject({
    sportsLiveStatus: 'FINISHED',
    closeTime: now - 1,
  })
  for (const id of [...held, named, attention]) {
    expect((await stored(id)).sportsLiveStatus).toBeUndefined()
    expect((await stored(id)).closeTime).toBeUndefined()
  }
  expect(publishSportsLiveScore).toHaveBeenCalledTimes(1)
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

it('continues the next native score tick while a previous settlement is still delivering notifications', async () => {
  now = Date.parse('2026-11-23T18:19:40Z')
  wire = [{ ...live, date: '2026-11-23', datetime: '2026-11-23T18:00:00Z' }]
  const id = await market({ sportsStartTimestamp: '2026-11-23T18:00:00.000Z' })
  await db.query('update contracts set close_time=$1 where id=$2', [
    new Date(now + 3 * 3_600_000),
    id,
  ])
  let complete!: (cursor: string) => void
  const pending = new Promise<string>((resolve) => {
    complete = resolve
  })
  jest.mocked(settlePendingNbaGames).mockReturnValueOnce(pending)
  try {
    await resolveOddsSportsMarkets()
    expect(settlePendingNbaGames).toHaveBeenCalledTimes(1)
    now += 61_000
    wire = [{ ...wire[0], home_team_score: 42 }]
    await resolveOddsSportsMarkets()
    expect((await stored(id)).sportsHomeScore).toBe(42)
    expect(settlePendingNbaGames).toHaveBeenCalledTimes(1)
  } finally {
    complete('')
  }
})
