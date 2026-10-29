// The provider, the database and resolution's side effects are mocked; the
// scheduler-facing routing in f1-markets.ts runs for real against them.
jest.mock('shared/utils', () => ({
  getUser: jest.fn(),
  isProd: () => false,
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
  contractColumnsToSelect: 'data',
}))
jest.mock('shared/supabase/init', () => ({}))
jest.mock('shared/tiptap', () => ({
  anythingToRichText: () => ({ type: 'doc', content: [] }),
}))
jest.mock('shared/resolve-market-helpers', () => ({
  resolveMarketHelper: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('shared/sports-markets', () => ({
  createSportsContract: jest.fn(),
  ensureOfficialGroup: jest.fn(),
  findSportsMarket: jest.fn().mockResolvedValue(null),
  SportsGameStartedError: class extends Error {},
  SportsMarketAlreadyExistsError: class extends Error {},
}))
jest.mock('shared/odds-markets', () => ({ sportsCreator: jest.fn() }))
jest.mock('shared/supabase/sports-competition-switches', () => ({
  getCompetitionSwitches: jest.fn(),
}))
jest.mock('shared/balldontlie-f1-client', () => ({
  BalldontlieError: class extends Error {
    constructor(message: string, readonly status: number) {
      super(message)
    }
  },
  getF1DriverStandings: jest.fn(),
  getF1Events: jest.fn(),
  getF1SessionResults: jest.fn(),
  getF1Sessions: jest.fn(),
  getF1TeamStandings: jest.fn(),
}))

import { MarketContract } from 'common/contract'
import {
  F1DriverStanding,
  F1Event,
  F1Session,
  F1SessionResult,
  F1TeamStanding,
} from 'common/f1-markets'
import { millisToTs } from 'common/supabase/utils'
import { User } from 'common/user'
import { HOUR_MS } from 'common/util/time'
import { log } from 'shared/utils'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { sportsCreator } from 'shared/odds-markets'
import { getCompetitionSwitches } from 'shared/supabase/sports-competition-switches'
import {
  BalldontlieError,
  getF1DriverStandings,
  getF1Events,
  getF1SessionResults,
  getF1Sessions,
  getF1TeamStandings,
} from 'shared/balldontlie-f1-client'
import {
  createSportsContract,
  ensureOfficialGroup,
  findSportsMarket,
} from 'shared/sports-markets'
import {
  createF1Markets,
  createF1MarketsForActiveCalendar,
  F1CreateResult,
  resolveF1Markets,
  resolveF1TitleMarkets,
} from './f1-markets'

// The Mexico City race (session 1870) starts 1 Nov 20:00Z and its markets
// close at 23:00Z, so they're due from 2 Nov 01:00Z.
const CLOSE = Date.parse('2026-11-01T23:00:00Z')
const NOW = CLOSE + 4 * HOUR_MS
const creator = { id: 'sports-user', username: 'ManifoldSports' } as User

const session = (status: F1Session['status_state']): F1Session => ({
  id: 1870,
  event: {
    id: 374,
    name: 'Mexico City Grand Prix',
    short_name: '',
    season: 2026,
  },
  type: 'Race',
  name: 'Race',
  date: '2026-11-01T20:00:00.000Z',
  status_state: status,
})
/** Driver ids by finishing position, in session 1870 unless said. */
const classified = (...ids: number[]) =>
  ids.map(
    (id, i) =>
      ({
        session: { id: 1870 },
        driver: { id },
        position: i + 1,
        is_winner: i === 0,
      } as F1SessionResult)
  )

type AnswerRow = {
  id: string
  index: number
  text: string
  resolution: string | null
}
const answerRows = (ids: string[], resolved: Record<string, string> = {}) =>
  ids.map(
    (id, index): AnswerRow => ({
      id,
      index,
      text: `Driver ${id}`,
      resolution: resolved[id] ?? null,
    })
  )

const market = (
  id: string,
  marketType: 'winner' | 'podium',
  entrantIds: (number | null)[]
) => ({
  data: {
    id,
    question: `2026 Mexico City Grand Prix: ${marketType}`,
    closeTime: CLOSE,
    outcomeType: 'MULTIPLE_CHOICE',
    mechanism: 'cpmm-multi-1',
    shouldAnswersSumToOne: marketType === 'winner',
    sportsEventId: 'bdl-f1:374:1870',
    sportsMarketType: marketType,
    sportsEntrantIds: entrantIds,
  },
  importance_score: 0,
})

function database(
  rows: ReturnType<typeof market>[],
  answers: Record<string, AnswerRow[]>
) {
  const manyOrNone = jest.fn(async (sql: string, values: unknown[]) => {
    if (sql.includes('from contracts')) return rows
    if (sql.includes('from answers')) return answers[values[0] as string] ?? []
    return []
  })
  return { manyOrNone, pg: { manyOrNone } as unknown as SupabaseDirectClient }
}

const winner = market('winner', 'winner', [11, 22, 33, null])
const winnerAnswers = answerRows(['a11', 'a22', 'a33', 'other'])
const podium = market('podium', 'podium', [11, 22, 33, 44])
const podiumIds = ['p11', 'p22', 'p33', 'p44']

beforeEach(() => {
  jest.clearAllMocks()
  // Drops a test's own payout behaviour (clearAllMocks keeps it).
  jest.mocked(resolveMarketHelper).mockReset()
  jest.spyOn(Date, 'now').mockReturnValue(NOW)
  jest.mocked(sportsCreator).mockResolvedValue(creator)
  jest.mocked(getF1Sessions).mockResolvedValue([session('final')])
  jest.mocked(getF1SessionResults).mockResolvedValue(classified(22, 11, 33, 44))
})

afterEach(() => jest.restoreAllMocks())

describe('resolveF1Markets', () => {
  it('reads every due market of the last 30 days', async () => {
    const db = database([], {})
    const r = await resolveF1Markets(db.pg)
    expect(r.checked).toBe(0)
    const [sql, values] = db.manyOrNone.mock.calls[0]
    expect(values[1]).toBe(millisToTs(NOW - 2 * HOUR_MS))
    expect(values[2]).toBe(millisToTs(NOW - 30 * 24 * HOUR_MS))
    expect(sql).toMatch(/order by close_time asc\s+limit 1001/)
    expect(getF1Sessions).not.toHaveBeenCalled()
  })

  // A market waiting on a session the provider doesn't list.
  const stuck = (n: number) =>
    Array.from({ length: n }, (_, i) => {
      const m = market(`stuck${i}`, 'winner', [11, 22, 33, null])
      return { ...m, data: { ...m.data, sportsEventId: 'bdl-f1:374:9999' } }
    })

  it('pays a market waiting behind a hundred stuck ones', async () => {
    const db = database([...stuck(100), winner], { winner: winnerAnswers })
    const r = await resolveF1Markets(db.pg)
    expect(r.waiting).toBe(100)
    expect(r.resolved).toBe(1)
    expect(jest.mocked(resolveMarketHelper).mock.calls[0][3]).toEqual({
      outcome: 'a22',
      resolutions: { a22: 100 },
    })
  })

  it('says once when the backlog is bigger than a run reads', async () => {
    const db = database(stuck(1001), {})
    const alerted = new Set<string>()
    const r = await resolveF1Markets(db.pg, alerted)
    expect(r.checked).toBe(1000)
    expect(jest.mocked(log.error).mock.calls).toEqual([
      [expect.stringContaining('more than 1000 F1 markets are due')],
    ])
    await resolveF1Markets(db.pg, alerted)
    expect(log.error).toHaveBeenCalledTimes(1)
  })

  it("pays nothing from another session's results", async () => {
    jest
      .mocked(getF1SessionResults)
      .mockResolvedValue(
        classified(22, 11, 33, 44).map((r) => ({ ...r, session: { id: 1869 } }))
      )
    const db = database([winner], { winner: winnerAnswers })
    const r = await resolveF1Markets(db.pg)
    expect(r.attention).toBe(1)
    expect(resolveMarketHelper).not.toHaveBeenCalled()
  })

  it('pays nothing when the provider files the session under another event', async () => {
    jest.mocked(getF1Sessions).mockResolvedValue([
      {
        ...session('canceled'),
        event: { ...session('final').event, id: 999 },
      },
    ])
    const db = database([winner], { winner: winnerAnswers })
    const r = await resolveF1Markets(db.pg)
    expect(r.attention).toBe(1)
    expect(resolveMarketHelper).not.toHaveBeenCalled()
  })

  /**
   * A resolveMarketHelper that only runs the caller's check against `fresh`,
   * its stand-in for the transaction's own read of the market.
   */
  const checkingAgainst =
    (fresh: Record<string, string>, seen: unknown[] = []) =>
    async (...args: Parameters<typeof resolveMarketHelper>) => {
      const check = args[5]
      seen.push(check)
      check?.({
        answers: answerRows(podiumIds, fresh),
      } as unknown as MarketContract)
      return undefined as unknown as Awaited<
        ReturnType<typeof resolveMarketHelper>
      >
    }

  it('stops a podium payout when an answer was resolved after the snapshot', async () => {
    // A person resolved the fourth driver YES after this run read the answers.
    jest
      .mocked(resolveMarketHelper)
      .mockImplementation(checkingAgainst({ p44: 'YES' }))
    const db = database([podium], { podium: answerRows(podiumIds) })
    const r = await resolveF1Markets(db.pg)
    expect(r.errors).toBe(1)
    expect(r.resolved).toBe(0)
    // The first payout's own check refused, so no answer was paid.
    expect(resolveMarketHelper).toHaveBeenCalledTimes(1)
  })

  it('checks every answer-level payout against the fresh read', async () => {
    const seen: unknown[] = []
    // A fresh read that agrees: nothing resolved other than intended.
    jest
      .mocked(resolveMarketHelper)
      .mockImplementation(checkingAgainst({ p11: 'YES' }, seen))
    const db = database([podium], { podium: answerRows(podiumIds) })
    expect((await resolveF1Markets(db.pg)).resolved).toBe(1)
    expect(seen).toHaveLength(4)
    expect(seen.every((c) => typeof c === 'function')).toBe(true)

    // Cancelling refuses a fresh YES on another answer too.
    jest.mocked(getF1Sessions).mockResolvedValue([session('canceled')])
    jest
      .mocked(resolveMarketHelper)
      .mockImplementation(checkingAgainst({ p22: 'YES' }))
    expect((await resolveF1Markets(db.pg)).errors).toBe(1)
  })

  it("pays a winner market to the classified winner's answer by driver id", async () => {
    const db = database([winner], { winner: winnerAnswers })
    const r = await resolveF1Markets(db.pg)
    expect(r.resolved).toBe(1)
    expect(resolveMarketHelper).toHaveBeenCalledTimes(1)
    expect(jest.mocked(resolveMarketHelper).mock.calls[0][3]).toEqual({
      outcome: 'a22',
      resolutions: { a22: 100 },
    })
  })

  it('resolves a podium answer by answer and picks up where a run stopped', async () => {
    const db = database([podium], {
      podium: answerRows(podiumIds, { p11: 'YES' }),
    })
    const r = await resolveF1Markets(db.pg)
    expect(r.resolved).toBe(1)
    expect(
      jest.mocked(resolveMarketHelper).mock.calls.map(([, , , args]) => args)
    ).toEqual([
      { outcome: 'YES', answerId: 'p22' },
      { outcome: 'YES', answerId: 'p33' },
      { outcome: 'NO', answerId: 'p44' },
    ])
  })

  it('stops a podium with an answer resolved the other way, and says so once', async () => {
    const db = database([podium], {
      podium: answerRows(podiumIds, { p44: 'YES' }),
    })
    const alerted = new Set<string>()
    const r = await resolveF1Markets(db.pg, alerted)
    expect(r.attention).toBe(1)
    expect(resolveMarketHelper).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalledTimes(1)
    await resolveF1Markets(db.pg, alerted)
    expect(log.error).toHaveBeenCalledTimes(1)
  })

  it('hands a classification that does not check out to a person', async () => {
    jest
      .mocked(getF1SessionResults)
      .mockResolvedValue([...classified(22, 11, 33), ...classified(44)])
    const db = database([winner], { winner: winnerAnswers })
    const r = await resolveF1Markets(db.pg)
    expect(r.attention).toBe(1)
    expect(resolveMarketHelper).not.toHaveBeenCalled()
  })

  it('resolves a cancelled session N/A: winner whole, podium per answer', async () => {
    jest.mocked(getF1Sessions).mockResolvedValue([session('canceled')])
    const db = database([winner, podium], {
      winner: winnerAnswers,
      podium: answerRows(podiumIds),
    })
    const r = await resolveF1Markets(db.pg)
    expect(r.resolved).toBe(2)
    const calls = jest.mocked(resolveMarketHelper).mock.calls
    expect(calls[0][3]).toEqual({ outcome: 'CANCEL' })
    expect(calls.slice(1).map(([, , , args]) => args)).toEqual(
      podiumIds.map((answerId) => ({ outcome: 'CANCEL', answerId }))
    )
    expect(getF1SessionResults).not.toHaveBeenCalled()
  })

  it('waits for a final classification, then asks a person', async () => {
    jest.mocked(getF1Sessions).mockResolvedValue([session('delayed')])
    const db = database([winner], { winner: winnerAnswers })
    expect((await resolveF1Markets(db.pg)).waiting).toBe(1)

    // Final but empty, as the US Grand Prix was two days after the race.
    jest.mocked(getF1Sessions).mockResolvedValue([session('final')])
    jest.mocked(getF1SessionResults).mockResolvedValue([])
    expect((await resolveF1Markets(db.pg)).waiting).toBe(1)
    expect(log.error).not.toHaveBeenCalled()

    jest.mocked(Date.now).mockReturnValue(CLOSE + 13 * HOUR_MS)
    const late = await resolveF1Markets(db.pg)
    expect(late.attention).toBe(1)
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(resolveMarketHelper).not.toHaveBeenCalled()
  })

  it('says a refused key or plan plainly', async () => {
    jest
      .mocked(getF1Sessions)
      .mockRejectedValue(new BalldontlieError('401 Unauthorized', 401))
    const db = database([winner], { winner: winnerAnswers })
    await expect(resolveF1Markets(db.pg)).rejects.toThrow(
      "BALLDONTLIE refused /sessions (401): the key is invalid or its plan doesn't include F1 ALL-STAR"
    )
  })
})

describe('createF1MarketsForActiveCalendar', () => {
  // Inside the F1 2026 phase (28 Aug to 7 Dec).
  beforeEach(() =>
    jest.mocked(Date.now).mockReturnValue(Date.parse('2026-10-27T12:00:00Z'))
  )
  const pg = {} as SupabaseDirectClient

  it("creates nothing when it can't read the switches", async () => {
    jest.mocked(getCompetitionSwitches).mockRejectedValue(new Error('down'))
    expect(await createF1MarketsForActiveCalendar(pg)).toEqual({})
    expect(log.error).toHaveBeenCalled()
    expect(getF1Events).not.toHaveBeenCalled()
  })

  it('leaves F1 alone until its phase is switched on', async () => {
    jest.mocked(getCompetitionSwitches).mockResolvedValue({})
    expect(await createF1MarketsForActiveCalendar(pg)).toEqual({})
    expect(getF1Events).not.toHaveBeenCalled()

    jest
      .mocked(getCompetitionSwitches)
      .mockResolvedValue({ 'f1-2026:2026 Remaining': true })
    jest.mocked(getF1Events).mockResolvedValue([])
    const r = await createF1MarketsForActiveCalendar(pg)
    expect(Object.keys(r)).toEqual(['f1-2026'])
    expect(getF1Events).toHaveBeenCalledWith(2026)
  })

  it('creates nothing for a competition whose phases are all off', async () => {
    const r = await createF1Markets(pg, 'f1-2026', { switches: {} })
    expect(r.log).toEqual([])
    expect(getF1Events).not.toHaveBeenCalled()
  })

  it('opens a season switched on in the winter, long before its window', async () => {
    jest
      .mocked(getCompetitionSwitches)
      .mockResolvedValue({ 'f1-2027:2027 Season': true })
    jest.mocked(getF1Events).mockResolvedValue([])
    jest.mocked(getF1DriverStandings).mockResolvedValue([])
    jest.mocked(getF1TeamStandings).mockResolvedValue([])
    const r = await createF1MarketsForActiveCalendar(pg)
    expect(Object.keys(r)).toEqual(['f1-2027'])
    expect(getF1Events).toHaveBeenCalledWith(2027)
    expect(r['f1-2027'].log.map((l) => l.reason)).toEqual([
      'no 2027 or 2026 drivers standings, so no field',
      'no 2027 or 2026 constructors standings, so no field',
    ])
  })
})

// ─── Titles ───────────────────────────────────────────────────────────────────

const driverRow = (id: number, points: number, position = 0, season = 2026) =>
  ({
    id,
    season,
    driver: {
      id,
      display_name: `Driver ${id}`,
      short_name: `D. ${id}`,
      team: { id: 800, name: 'T', display_name: 'T', color: 'FF8000' },
    },
    position,
    points,
  } as F1DriverStanding)
const teamRow = (id: number, points: number, position = 0, season = 2026) =>
  ({
    id,
    season,
    team: { id, name: `Team ${id}`, display_name: `Team ${id}`, color: null },
    position,
    points,
  } as F1TeamStanding)
const weekend = (
  id: number,
  start: string,
  race: string,
  status_state: F1Event['status_state']
): F1Event => ({
  id,
  name: `Grand Prix ${id}`,
  short_name: '',
  season: 2027,
  start_date: start,
  end_date: race,
  status_state,
})

describe('createF1Markets: titles', () => {
  // The winter before 2027: the provider has no 2027 weekend yet.
  const WINTER = Date.parse('2026-12-20T12:00:00Z')
  const pg = {} as SupabaseDirectClient
  beforeEach(() => {
    jest.mocked(Date.now).mockReturnValue(WINTER)
    jest.mocked(getF1Events).mockResolvedValue([])
    jest
      .mocked(getF1DriverStandings)
      .mockImplementation(async (season) =>
        season === 2026
          ? [driverRow(4, 300), driverRow(1, 400), driverRow(81, 100)]
          : []
      )
    jest
      .mocked(getF1TeamStandings)
      .mockImplementation(async (season) =>
        season === 2026 ? [teamRow(806, 470), teamRow(808, 600)] : []
      )
    jest.mocked(findSportsMarket).mockResolvedValue(null)
    jest
      .mocked(ensureOfficialGroup)
      .mockResolvedValue({ id: 'g-f1-2027' } as never)
    jest.mocked(createSportsContract).mockImplementation(
      async (_pg, _creator, params) =>
        ({
          id: params.sportsEventId,
          slug: params.sportsEventId,
          creatorUsername: 'ManifoldSports',
        } as never)
    )
  })
  const titleLog = (r: F1CreateResult) =>
    r.log.filter((l) => l.key.startsWith('title:'))
  const created = () =>
    jest.mocked(createSportsContract).mock.calls.map((c) => c[2])

  it('previews both titles from last season before the provider has the calendar', async () => {
    const r = await createF1Markets(pg, 'f1-2027', { dryRun: true })
    const titles = titleLog(r)
    expect(titles.map((l) => [l.key, l.status])).toEqual([
      ['title:drivers', 'dry-run'],
      ['title:constructors', 'dry-run'],
    ])
    expect(titles[0]).toMatchObject({
      question: "Who will win the 2027 F1 Drivers' Championship?",
      reason: expect.stringContaining('closes 2027-11-28T23:59Z'),
    })
    expect(titles[0].reason).toContain('field from the 2026 standings')
    expect(titles[0].reason).toContain(
      "the provider's 2027 calendar isn't out yet"
    )
    expect(createSportsContract).not.toHaveBeenCalled()
    expect(ensureOfficialGroup).not.toHaveBeenCalled()
  })

  it("creates them on our calendar's dates, with the season's field once the provider has one", async () => {
    jest
      .mocked(getF1DriverStandings)
      .mockImplementation(async (season) =>
        season === 2027
          ? [driverRow(99, 0, 0, 2027), driverRow(1, 0, 0, 2027)]
          : [driverRow(4, 300), driverRow(1, 400)]
      )
    const r = await createF1Markets(pg, 'f1-2027')
    expect(r.created).toBe(2)
    const [drivers, constructors] = created()
    expect(drivers).toMatchObject({
      sportsEventId: 'bdl-f1-title:2027:drivers',
      sportsMarketType: 'title',
      shouldAnswersSumToOne: true,
      closeTime: Date.parse('2027-11-28T23:59:59Z'),
      // Three days before our first race day, the 7th.
      sportsStartTimestamp: '2027-03-04T00:00:00.000Z',
      // 2027's drivers, priced on 2026's points: a newcomer opens below.
      sportsEntrantIds: [1, 99, null],
      liquidityTier: 1000,
      groupIds: expect.arrayContaining(['g-f1-2027']),
    })
    expect(constructors).toMatchObject({
      sportsEventId: 'bdl-f1-title:2027:constructors',
      answers: ['Team 808', 'Team 806', 'Another team'],
      sportsEntrantIds: [808, 806, null],
    })
    expect(jest.mocked(createSportsContract).mock.calls[0][3]).toEqual({
      deduplicateMarketType: 'title',
      minLeadMs: 5 * 60 * 1000,
    })
    expect(ensureOfficialGroup).toHaveBeenCalledTimes(1)
  })

  it("takes the provider's dates once it lists the season, without cancelled weekends", async () => {
    jest
      .mocked(getF1Events)
      .mockImplementation(async (season) =>
        season === 2027
          ? [
              weekend(
                2,
                '2027-12-03T09:30:00Z',
                '2027-12-05T13:00:00Z',
                'scheduled'
              ),
              weekend(
                1,
                '2027-03-05T01:30:00Z',
                '2027-03-07T05:00:00Z',
                'scheduled'
              ),
              weekend(
                3,
                '2027-12-10T09:30:00Z',
                '2027-12-12T13:00:00Z',
                'canceled'
              ),
            ]
          : []
      )
    await createF1Markets(pg, 'f1-2027')
    for (const params of created()) {
      expect(params.closeTime).toBe(Date.parse('2027-12-05T16:00:00Z'))
      // Ours is sooner than the provider's FP1, so it opens until then.
      expect(params.sportsStartTimestamp).toBe('2027-03-04T00:00:00.000Z')
    }
  })

  it("closes on our last date while the provider's calendar stops short of it", async () => {
    // Only the first rounds are out: their last race isn't the finale.
    jest
      .mocked(getF1Events)
      .mockImplementation(async (season) =>
        season === 2027
          ? [
              weekend(
                1,
                '2027-03-05T01:30:00Z',
                '2027-03-07T05:00:00Z',
                'scheduled'
              ),
              weekend(
                2,
                '2027-03-19T01:30:00Z',
                '2027-03-21T05:00:00Z',
                'scheduled'
              ),
            ]
          : []
      )
    const r = await createF1Markets(pg, 'f1-2027', { dryRun: true })
    expect(titleLog(r)[0].reason).toContain(
      "the provider's 2027 calendar doesn't reach ours"
    )
    await createF1Markets(pg, 'f1-2027')
    for (const params of created())
      expect(params.closeTime).toBe(Date.parse('2027-11-28T23:59:59Z'))
  })

  it('opens no title once the season may have started', async () => {
    // Thursday before our first race day: FP1 could be tomorrow, and the
    // provider has no calendar to say otherwise.
    jest.mocked(Date.now).mockReturnValue(Date.parse('2027-03-04T12:00:00Z'))
    const r = await createF1Markets(pg, 'f1-2027', { dryRun: true })
    expect(titleLog(r).map((l) => [l.status, l.reason])).toEqual([
      [
        'skipped',
        expect.stringContaining("the 2027 season's first weekend has started"),
      ],
      [
        'skipped',
        expect.stringContaining("the 2027 season's first weekend has started"),
      ],
    ])
    expect(getF1DriverStandings).not.toHaveBeenCalled()
  })

  it('skips a title that has a market, and runs only the ticked ones', async () => {
    jest.mocked(findSportsMarket).mockResolvedValue({ id: 'old' } as never)
    const r = await createF1Markets(pg, 'f1-2027', {
      keys: ['title:constructors'],
    })
    expect(titleLog(r)).toEqual([
      expect.objectContaining({
        key: 'title:constructors',
        status: 'skipped',
        reason: 'market old already exists',
      }),
    ])
    expect(findSportsMarket).toHaveBeenCalledWith(
      pg,
      'bdl-f1-title:2027:constructors',
      'title'
    )
    expect(getF1DriverStandings).not.toHaveBeenCalled()
    expect(createSportsContract).not.toHaveBeenCalled()
  })
})

describe('resolveF1TitleMarkets', () => {
  const FINAL_RACE = Date.parse('2027-12-05T13:00:00Z')
  const FINAL_CLOSE = FINAL_RACE + 3 * HOUR_MS
  const DUE = FINAL_CLOSE + 96 * HOUR_MS
  const OUR_CLOSE = Date.parse('2027-11-28T23:59:59Z')

  const title = (
    id: string,
    closeTime: number,
    kind: 'drivers' | 'constructors' = 'drivers',
    entrantIds: (number | null)[] = [1, 4, 81, null],
    sportsEventId = `bdl-f1-title:2027:${kind}`
  ) => ({
    data: {
      id,
      question: `2027 ${kind} title`,
      closeTime,
      outcomeType: 'MULTIPLE_CHOICE',
      mechanism: 'cpmm-multi-1',
      shouldAnswersSumToOne: true,
      sportsEventId,
      sportsMarketType: 'title',
      sportsEntrantIds: entrantIds,
    },
    importance_score: 0,
  })
  const driversAnswers = (resolved: Record<string, string> = {}) =>
    answerRows(['t1', 't4', 't81', 'tother'], resolved)
  const season = (last: F1Event['status_state']) => [
    weekend(1, '2027-03-05T01:30:00Z', '2027-03-07T05:00:00Z', 'final'),
    weekend(2, '2027-12-03T09:30:00Z', '2027-12-05T13:00:00Z', last),
  ]
  // Two final races award 202 points, and the standings add up to them.
  const finalDrivers = [
    driverRow(81, 42, 3, 2027),
    driverRow(1, 100, 1, 2027),
    driverRow(4, 60, 2, 2027),
  ]
  const race = (id: number, eventId: number): F1Session => ({
    id,
    event: { id: eventId, name: '', short_name: '', season: 2027 },
    type: 'Race',
    name: 'Race',
    date: '',
    status_state: 'final',
  })

  function titleDb(
    rows: ReturnType<typeof title>[],
    answers: Record<string, AnswerRow[]>
  ) {
    const manyOrNone = jest.fn(async (sql: string, values: unknown[]) => {
      if (sql.includes('from contracts')) return rows
      if (sql.includes('from answers'))
        return answers[values[0] as string] ?? []
      return []
    })
    const none = jest.fn().mockResolvedValue(undefined)
    return {
      manyOrNone,
      none,
      pg: { manyOrNone, none } as unknown as SupabaseDirectClient,
    }
  }

  beforeEach(() => {
    jest.mocked(getF1Events).mockResolvedValue(season('final'))
    jest.mocked(getF1Sessions).mockResolvedValue([race(11, 1), race(21, 2)])
    jest.mocked(getF1DriverStandings).mockResolvedValue(finalDrivers)
    jest.mocked(getF1TeamStandings).mockResolvedValue([])
  })

  it("moves an open market's close to the provider's final race", async () => {
    jest.mocked(Date.now).mockReturnValue(Date.parse('2026-12-20T12:00:00Z'))
    jest.mocked(getF1Events).mockResolvedValue(season('scheduled'))
    const db = titleDb([title('wdc', OUR_CLOSE)], {})
    const r = await resolveF1TitleMarkets(db.pg)
    expect(db.manyOrNone.mock.calls[0][0]).toContain("like 'bdl-f1-title:%'")
    expect(r.moved).toBe(1)
    const [sql, values] = db.none.mock.calls[0]
    expect(sql).toMatch(/resolution is null and close_time > now\(\)/)
    expect(values).toEqual([JSON.stringify({ closeTime: FINAL_CLOSE }), 'wdc'])
    expect(getF1DriverStandings).not.toHaveBeenCalled()
  })

  it("leaves a close already on the final race, and doesn't reopen a closed market", async () => {
    jest.mocked(Date.now).mockReturnValue(Date.parse('2027-12-01T12:00:00Z'))
    jest.mocked(getF1Events).mockResolvedValue(season('scheduled'))
    const db = titleDb(
      [
        title('on-time', FINAL_CLOSE),
        title('closed', OUR_CLOSE, 'constructors'),
      ],
      {}
    )
    const r = await resolveF1TitleMarkets(db.pg)
    expect(db.none).not.toHaveBeenCalled()
    expect(r.waiting).toBe(2)
    // One calendar read for the season, however many titles it has.
    expect(getF1Events).toHaveBeenCalledTimes(1)
  })

  it('waits until four days after the final race, then pays the leader by id', async () => {
    const db = titleDb([title('wdc', FINAL_CLOSE)], { wdc: driversAnswers() })
    jest.mocked(Date.now).mockReturnValue(DUE - 60_000)
    expect((await resolveF1TitleMarkets(db.pg)).waiting).toBe(1)
    expect(getF1DriverStandings).not.toHaveBeenCalled()

    jest.mocked(Date.now).mockReturnValue(DUE)
    const r = await resolveF1TitleMarkets(db.pg)
    expect(r.resolved).toBe(1)
    expect(getF1Sessions).toHaveBeenCalledWith([1, 2])
    expect(getF1DriverStandings).toHaveBeenCalledWith(2027)
    expect(getF1TeamStandings).not.toHaveBeenCalled()
    const call = jest.mocked(resolveMarketHelper).mock.calls[0]
    expect(call[3]).toEqual({ outcome: 't1', resolutions: { t1: 100 } })
    expect(call[1]).toBe(creator)
  })

  it("pays a constructors' title from the team standings", async () => {
    jest.mocked(Date.now).mockReturnValue(DUE)
    jest
      .mocked(getF1TeamStandings)
      .mockResolvedValue([
        teamRow(806, 72, 2, 2027),
        teamRow(808, 130, 1, 2027),
      ])
    const db = titleDb(
      [title('wcc', FINAL_CLOSE, 'constructors', [806, 808, null])],
      { wcc: answerRows(['c806', 'c808', 'cother']) }
    )
    expect((await resolveF1TitleMarkets(db.pg)).resolved).toBe(1)
    expect(jest.mocked(resolveMarketHelper).mock.calls[0][3]).toEqual({
      outcome: 'c808',
      resolutions: { c808: 100 },
    })
    expect(getF1DriverStandings).not.toHaveBeenCalled()
  })

  it("hands standings that don't check out to a person, once", async () => {
    jest.mocked(Date.now).mockReturnValue(DUE)
    jest.mocked(getF1DriverStandings).mockResolvedValue([
      // A tie at the top, settled on countback.
      driverRow(1, 101, 1, 2027),
      driverRow(4, 101, 2, 2027),
    ])
    const db = titleDb([title('wdc', FINAL_CLOSE)], { wdc: driversAnswers() })
    const alerted = new Set<string>()
    expect((await resolveF1TitleMarkets(db.pg, alerted)).attention).toBe(1)
    await resolveF1TitleMarkets(db.pg, alerted)
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(resolveMarketHelper).not.toHaveBeenCalled()
  })

  it('stops a payout an answer resolved by hand disagrees with, here and on the fresh read', async () => {
    jest.mocked(Date.now).mockReturnValue(DUE)
    const db = titleDb([title('wdc', FINAL_CLOSE)], {
      wdc: driversAnswers({ t1: 'NO' }),
    })
    expect((await resolveF1TitleMarkets(db.pg)).attention).toBe(1)
    expect(resolveMarketHelper).not.toHaveBeenCalled()

    // A driver ruled out by hand agrees with the standings.
    const ok = titleDb([title('wdc', FINAL_CLOSE)], {
      wdc: driversAnswers({ t81: 'NO' }),
    })
    expect((await resolveF1TitleMarkets(ok.pg)).resolved).toBe(1)
    const assertResolvable = jest.mocked(resolveMarketHelper).mock
      .calls[0][5] as (c: MarketContract) => void
    const fresh = (resolved: Record<string, string>) =>
      ({ answers: driversAnswers(resolved) } as unknown as MarketContract)
    expect(() => assertResolvable(fresh({ t81: 'NO' }))).not.toThrow()
    expect(() => assertResolvable(fresh({ t1: 'NO' }))).toThrow()
  })

  it('pays nothing from standings that miss the finale', async () => {
    jest.mocked(Date.now).mockReturnValue(DUE)
    // The pre-finale snapshot: 4 leads, though 1 won the title.
    jest
      .mocked(getF1DriverStandings)
      .mockResolvedValue([driverRow(4, 60, 1, 2027), driverRow(1, 41, 2, 2027)])
    const db = titleDb([title('wdc', FINAL_CLOSE)], { wdc: driversAnswers() })
    const r = await resolveF1TitleMarkets(db.pg)
    expect(r.attention).toBe(1)
    expect(r.log[0].reason).toMatch(
      /add up to 101 points, but its 2 races and 0 sprints award 202/
    )
    expect(resolveMarketHelper).not.toHaveBeenCalled()
  })

  it("asks a person about a champion the field doesn't list", async () => {
    jest.mocked(Date.now).mockReturnValue(DUE)
    // The provider gave a listed team a new id, as it did Sauber.
    jest
      .mocked(getF1TeamStandings)
      .mockResolvedValue([
        teamRow(806, 72, 2, 2027),
        teamRow(825, 130, 1, 2027),
      ])
    const db = titleDb(
      [title('wcc', FINAL_CLOSE, 'constructors', [806, 814, null])],
      { wcc: answerRows(['c806', 'c814', 'cother']) }
    )
    expect((await resolveF1TitleMarkets(db.pg)).attention).toBe(1)
    expect(resolveMarketHelper).not.toHaveBeenCalled()
  })

  it("doesn't take a calendar that stops short of ours for the season", async () => {
    // The provider lists round one only, and it's final.
    jest
      .mocked(getF1Events)
      .mockResolvedValue([
        weekend(1, '2027-03-05T01:30:00Z', '2027-03-07T05:00:00Z', 'final'),
      ])
    const db = titleDb([title('wdc', OUR_CLOSE)], { wdc: driversAnswers() })
    jest.mocked(Date.now).mockReturnValue(Date.parse('2027-03-20T00:00:00Z'))
    const early = await resolveF1TitleMarkets(db.pg)
    expect(early.waiting).toBe(1)
    expect(early.log[0].reason).toMatch(/may be missing races/)
    expect(db.none).not.toHaveBeenCalled()

    jest.mocked(Date.now).mockReturnValue(OUR_CLOSE + (96 + 13) * HOUR_MS)
    expect((await resolveF1TitleMarkets(db.pg)).attention).toBe(1)
    expect(getF1DriverStandings).not.toHaveBeenCalled()
    expect(resolveMarketHelper).not.toHaveBeenCalled()
  })

  it('closes an open market now once its final race market has closed', async () => {
    // The finale came a week before the market's close.
    const now = FINAL_CLOSE + 24 * HOUR_MS
    jest.mocked(Date.now).mockReturnValue(now)
    const db = titleDb([title('wdc', FINAL_CLOSE + 7 * 24 * HOUR_MS)], {})
    const r = await resolveF1TitleMarkets(db.pg)
    expect(r.moved).toBe(1)
    expect(db.none.mock.calls[0][1]).toEqual([
      JSON.stringify({ closeTime: now }),
      'wdc',
    ])
  })

  it('waits for the season to end, then asks a person', async () => {
    jest.mocked(getF1Events).mockResolvedValue(season('postponed'))
    const db = titleDb([title('wdc', FINAL_CLOSE)], { wdc: driversAnswers() })
    jest.mocked(Date.now).mockReturnValue(FINAL_CLOSE + HOUR_MS)
    expect((await resolveF1TitleMarkets(db.pg)).waiting).toBe(1)
    jest.mocked(Date.now).mockReturnValue(DUE + 13 * HOUR_MS)
    const r = await resolveF1TitleMarkets(db.pg)
    expect(r.attention).toBe(1)
    expect(r.log[0].reason).toMatch(/isn't over, 13 hours after it was due/)
    expect(getF1DriverStandings).not.toHaveBeenCalled()
  })

  it("asks a person about an id it can't read", async () => {
    jest.mocked(Date.now).mockReturnValue(DUE)
    const db = titleDb(
      [
        title(
          'bad',
          FINAL_CLOSE,
          'drivers',
          [1, null],
          'bdl-f1-title:27:drivers'
        ),
      ],
      {}
    )
    const r = await resolveF1TitleMarkets(db.pg)
    expect(r.attention).toBe(1)
    expect(getF1Events).not.toHaveBeenCalled()
  })
})
