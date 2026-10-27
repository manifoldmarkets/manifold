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
}))

import { F1Session, F1SessionResult } from 'common/f1-markets'
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
  getF1Events,
  getF1SessionResults,
  getF1Sessions,
} from 'shared/balldontlie-f1-client'
import {
  createF1Markets,
  createF1MarketsForActiveCalendar,
  resolveF1Markets,
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
/** Driver ids by finishing position. */
const classified = (...ids: number[]) =>
  ids.map(
    (id, i) =>
      ({
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
  jest.spyOn(Date, 'now').mockReturnValue(NOW)
  jest.mocked(sportsCreator).mockResolvedValue(creator)
  jest.mocked(getF1Sessions).mockResolvedValue([session('final')])
  jest.mocked(getF1SessionResults).mockResolvedValue(classified(22, 11, 33, 44))
})

afterEach(() => jest.restoreAllMocks())

describe('resolveF1Markets', () => {
  it('only reads markets whose resolve delay has passed', async () => {
    const db = database([], {})
    const r = await resolveF1Markets(db.pg)
    expect(r.checked).toBe(0)
    const [, values] = db.manyOrNone.mock.calls[0]
    expect(values[1]).toBe(millisToTs(NOW - 2 * HOUR_MS))
    expect(getF1Sessions).not.toHaveBeenCalled()
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
})
