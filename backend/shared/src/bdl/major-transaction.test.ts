import type {
  SupabaseDirectClient,
  SupabaseTransaction,
} from '../supabase/init'
import { SPORTS_CALENDAR, calendarPhaseKey } from 'common/sports-calendar'
import { DAY_MS } from 'common/util/time'
import type { User } from 'common/user'
import type { MajorGame } from './major-games'
import { majorChange } from './major-change'
import type { MajorMarket } from './major-result'
import {
  recordMajorObservation,
  settleRecordedMajor,
  majorPhaseEnabled,
} from './major-lifecycle-store'
import { resolveMarketHelper } from '../resolve-market-helpers'

jest.mock('../supabase/init', () => ({
  pgp: jest.requireActual('pg-promise')(),
}))
jest.mock('../resolve-market-helpers', () => ({
  resolveMarketHelper: jest.fn(),
}))
jest.mock('../sports-kickoff-signal', () => ({
  reportSportsKickoffSignal: jest.fn(),
}))
const p = SPORTS_CALENDAR.find(
  (p) =>
    p.bdlLeagueKey === 'nba' &&
    p.startDate <= '2026-11-06' &&
    p.endDate >= '2026-11-06'
)!
const at = Date.parse('2026-11-07T01:00:00Z'),
  iso = new Date(at).toISOString()
const m = {
  id: 'c',
  creatorId: 'bot',
  visibility: 'public',
  token: 'MANA',
  sportsProvider: 'bdl',
  sportsEventId: 'bdl:nba:18',
  sportsMarketType: 'moneyline',
  sportsLeague: 'NBA',
  sportsLeagueKey: 'nba',
  sportsCompetitionId: p.competitionId,
  sportsCompetitionPhase: p.phase,
  sportsHomeTeam: 'H',
  sportsAwayTeam: 'A',
  sportsHomeTeamId: '2',
  sportsAwayTeamId: '3',
  sportsEntrantIds: [3, 2],
  sportsStartTimestamp: iso,
  question: 'A at H',
  mechanism: 'cpmm-multi-2',
  addAnswersMode: 'DISABLED',
  shouldAnswersSumToOne: true,
  outcomeType: 'MULTIPLE_CHOICE',
  answers: [
    { id: 'a', contractId: 'c', text: 'A', index: 0 },
    { id: 'h', contractId: 'c', text: 'H', index: 1 },
  ],
} as MajorMarket
const g: MajorGame = {
  id: 18,
  slateDate: '2026-11-06',
  status: 'final',
  season: 2026,
  startTime: iso,
  home: { id: 2, name: 'H' },
  away: { id: 3, name: 'A' },
  homeScore: 10,
  awayScore: 9,
  eligible: true,
}
const final = majorChange(m, 'nba', g, at),
  record = final.record!,
  market = { ...m, ...final.patch } as MajorMarket
const old = process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
beforeEach(() => {
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
  jest.clearAllMocks()
})
afterEach(() => {
  if (old === undefined) delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  else process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = old
})

it('runs all pre-payout checks against the actual transaction state', async () => {
  const user = { id: 'bot' } as User
  const attempt = async (options: {
    before?: Partial<MajorMarket>
    fresh?: Partial<MajorMarket>
    switch?: boolean
    stopAt?: number
    master?: boolean
    row?: boolean
    clock?: number
    paid?: boolean
  }) => {
    let calls = 0,
      paid = false,
      entered = false
    const live = () => ++calls !== options.stopAt
    const stale = { ...market, ...options.before }
    const tx = {
      one: async () => ({}),
      manyOrNone: async () => [],
      oneOrNone: async () =>
        options.row === false ? null : { enabled: options.switch ?? true },
    } as unknown as SupabaseTransaction
    const pg = {
      tx: async (fn: (tx: SupabaseTransaction) => Promise<void>) => fn(tx),
    } as unknown as SupabaseDirectClient
    jest
      .mocked(resolveMarketHelper)
      .mockImplementationOnce(async (_, __, ___, ____, observer, authorize) => {
        entered = true
        const current = { ...market, ...options.fresh } as MajorMarket
        if (options.master === false)
          process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'false'
        authorize!(current)
        paid = true
        observer?.('committed')
        return { contract: current, userUpdates: [] }
      })
    try {
      await settleRecordedMajor(
        pg,
        stale,
        'nba',
        record,
        user,
        () => options.clock ?? at,
        live
      )
    } catch (e) {
      expect((e as Error).message).toMatch(/Sports settlement/)
    }
    jest.mocked(resolveMarketHelper).mockReset()
    process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
    expect(paid).toBe(options.paid ?? false)
    return entered
  }
  expect(await attempt({ paid: true })).toBe(true)
  expect(await attempt({ stopAt: 1 })).toBe(false)
  expect(await attempt({ before: { sportsResultHash: 'old' } })).toBe(false)
  expect(await attempt({ stopAt: 2 })).toBe(false)
  expect(await attempt({ stopAt: 3 })).toBe(true)
  expect(await attempt({ switch: false })).toBe(false)
  expect(await attempt({ row: false })).toBe(false)
  expect(await attempt({ master: false })).toBe(true)
  for (const fresh of [
    { creatorId: 'other' },
    {
      id: 'wrong',
      answers: market.answers.map((a) => ({ ...a, contractId: 'wrong' })),
    },
    { sportsCompetitionId: 'wrong' },
    { sportsCompetitionPhase: 'wrong' },
    { sportsResultHash: 'old' },
    { sportsRecordedResult: undefined },
    { answers: [] },
  ])
    expect(await attempt({ fresh })).toBe(true)
})
it('honors request, observation, phase, settled-mode and watch-window guards before any write', async () => {
  const check = async (options: {
    seen?: number
    start?: number
    row?: Partial<MajorMarket>
    watch?: boolean
    enabled?: boolean
    stopAt?: number
    game?: Partial<MajorGame>
    expected?: number
  }) => {
    let calls = 0,
      writes = 0,
      transition = true
    const db = {
      tx: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
      one: async () => ({}),
      map: async () => [
        {
          competitionId: p.competitionId,
          phase: p.phase,
          on: options.enabled ?? true,
        },
      ],
      manyOrNone: async (sql: string) =>
        sql.includes('from contracts')
          ? [{ data: { ...m, ...options.row }, token: 'MANA' }]
          : m.answers.map((a) => ({
              id: a.id,
              text: a.text,
              index: a.index,
              contract_id: m.id,
            })),
      none: async (sql: string) => {
        if (sql.startsWith('update contracts')) writes++
      },
    } as unknown as SupabaseDirectClient
    try {
      const rows = await recordMajorObservation(
        db,
        'bot',
        'nba',
        m.sportsEventId,
        { ...g, ...options.game },
        options.start ?? at,
        options.seen ?? at,
        false,
        () => ++calls !== options.stopAt,
        options.watch ?? false
      )
      transition = rows.length > 0
    } catch (e) {
      expect((e as Error).message).toMatch(/expired/)
      transition = false
    }
    expect(transition).toBe(!!options.expected)
    expect(writes).toBe(options.expected ?? 0)
  }
  await check({ expected: 1 })
  for (const options of [
    { seen: NaN },
    { start: NaN },
    {
      start: 0,
      seen: at,
      row: { sportsLastCheckedTime: -1, sportsLiveUpdatedTime: -1 },
    },
    { seen: at - 1 },
    { stopAt: 1 },
    { stopAt: 2 },
    { stopAt: 3 },
    { game: { id: 99 } },
    { enabled: false },
    { row: { sportsLastCheckedTime: at } },
    { row: { sportsLiveUpdatedTime: at } },
    { row: { sportsScoreUpdatedTime: at }, game: { scoreUpdatedTime: at - 1 } },
    { row: { isResolved: true } },
    { watch: true, row: { resolutionTime: at } },
    { watch: true, row: { isResolved: true } },
    {
      watch: true,
      row: { isResolved: true, resolutionTime: at - 14 * DAY_MS - 1 },
    },
  ])
    await check(options)
  await check({
    expected: 1,
    watch: true,
    row: { isResolved: true, resolutionTime: at - 14 * DAY_MS },
  })
})
it('requires exactly one matching legacy phase and the enabled BDL phase for its league', () => {
  const on = { [calendarPhaseKey(p)]: true }
  expect(majorPhaseEnabled(m, 'nba', on)).toBe(true)
  expect(
    majorPhaseEnabled({ ...m, sportsCompetitionPhase: undefined }, 'nba', on)
  ).toBe(true)
  for (const seed of [
    'unknown',
    '2024-01-01T00:00:00Z',
    '2030-01-01T00:00:00Z',
  ]) {
    expect(
      majorPhaseEnabled(
        {
          ...m,
          sportsCompetitionPhase: undefined,
          sportsSeededStartTimestamp: seed,
        },
        'nba',
        on
      )
    ).toBe(false)
  }
  expect(majorPhaseEnabled(m, 'nfl', on)).toBe(false)
  expect(
    majorPhaseEnabled({ ...m, sportsCompetitionId: 'other' }, 'nba', on)
  ).toBe(false)
  expect(majorPhaseEnabled(m, 'nba', {})).toBe(false)
  expect(
    majorPhaseEnabled({ ...m, sportsCompetitionPhase: 'unknown' }, 'nba', on)
  ).toBe(false)
})
it('reserves at most one two-connection payout and releases the phase at commit before slow notifications', async () => {
  let notify!: () => void, entered!: () => void, releasePhase!: () => void
  const untilNotify = new Promise<void>((r) => {
    notify = r
  })
  const started = new Promise<void>((r) => {
    entered = r
  })
  const phaseUnlocked = new Promise<void>((r) => {
    releasePhase = r
  })
  let locked = false
  const tx = {
    one: async () => ({}),
    manyOrNone: async () => [],
    oneOrNone: async () => ({ enabled: true }),
  }
  const pg = {
    tx: async (fn: (tx: unknown) => Promise<void>) => {
      locked = true
      try {
        await fn(tx)
      } finally {
        locked = false
        releasePhase()
      }
    },
  } as unknown as SupabaseDirectClient
  jest
    .mocked(resolveMarketHelper)
    .mockImplementationOnce(async (_, __, ___, ____, observe, assert) => {
      expect(locked).toBe(true)
      assert!(market)
      entered()
      observe!('committed')
      await untilNotify
      return { contract: market, userUpdates: [] }
    })
  const run = () =>
    settleRecordedMajor(
      pg,
      market,
      'nba',
      record,
      { id: 'bot' } as User,
      () => at,
      () => true
    )
  const first = run()
  await started
  await phaseUnlocked
  expect(locked).toBe(false)
  expect(await run()).toBe(false)
  expect(resolveMarketHelper).toHaveBeenCalledTimes(1)
  notify()
  expect(await first).toBe(true)
})
